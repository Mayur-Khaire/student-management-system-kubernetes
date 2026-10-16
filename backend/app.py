import json
import os
import time

import mysql.connector
import redis
from flask import Flask, jsonify, request
from mysql.connector import Error, IntegrityError
from redis.exceptions import RedisError

app = Flask(__name__)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "mysql"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "studentapp"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "studentdb"),
}

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
CACHE_TTL_SECONDS = max(1, int(os.getenv("CACHE_TTL_SECONDS", "60")))

# Redis is optional at runtime: API requests fall back to MySQL if it is down.
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    decode_responses=True,
    socket_connect_timeout=1,
    socket_timeout=1,
)

STUDENTS_CACHE_KEY = "students:all"
STUDENT_CACHE_KEY_PREFIX = "students:"


def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def execute_with_retry(query, params=None, fetch=False):
    """Run a database operation with retries and always close its resources."""
    last_error = None

    for attempt in range(10):
        connection = None
        cursor = None

        try:
            connection = get_db_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute(query, params or ())

            if fetch:
                return cursor.fetchall()

            # Consume result rows from statements such as SELECT 1.
            if cursor.with_rows:
                cursor.fetchall()

            connection.commit()
            return None

        except Error as exc:
            last_error = exc
            if attempt < 9:
                time.sleep(2)

        finally:
            if cursor is not None:
                cursor.close()
            if connection is not None and connection.is_connected():
                connection.close()

    raise last_error


def cache_get(key):
    """Return (decoded value, status), where status is HIT, MISS, or BYPASS."""
    try:
        cached_value = redis_client.get(key)
        if cached_value is None:
            return None, "MISS"

        try:
            return json.loads(cached_value), "HIT"
        except (json.JSONDecodeError, TypeError):
            # Remove malformed cache data and load a fresh value from MySQL.
            try:
                redis_client.delete(key)
            except RedisError:
                pass
            return None, "MISS"

    except RedisError as exc:
        app.logger.warning("Redis read unavailable; bypassing cache: %s", exc)
        return None, "BYPASS"


def cache_set(key, value):
    """Cache JSON data with a TTL. Return False if Redis is unavailable."""
    try:
        redis_client.setex(key, CACHE_TTL_SECONDS, json.dumps(value))
        return True
    except (RedisError, TypeError, ValueError) as exc:
        app.logger.warning("Redis write unavailable; skipping cache: %s", exc)
        return False


def invalidate_student_cache(student_id=None):
    """Invalidate the list cache and, when supplied, one student's cache."""
    keys = [STUDENTS_CACHE_KEY]
    if student_id is not None:
        keys.append(STUDENT_CACHE_KEY_PREFIX + str(student_id))

    try:
        redis_client.delete(*keys)
    except RedisError as exc:
        # Database writes remain successful even if Redis is unavailable.
        # Cached entries expire automatically after CACHE_TTL_SECONDS.
        app.logger.warning("Could not invalidate Redis cache: %s", exc)


def json_with_cache_header(data, status_code, cache_status):
    response = jsonify(data)
    response.status_code = status_code
    response.headers["X-Cache"] = cache_status
    return response


def validate_student_data(data):
    if not isinstance(data, dict):
        return None, "A JSON object is required"

    name = data.get("name")
    email = data.get("email")
    course = data.get("course")

    if not all(
        isinstance(value, str) and value.strip()
        for value in (name, email, course)
    ):
        return None, "name, email, and course must be non-empty strings"

    name = name.strip()
    email = email.strip()
    course = course.strip()

    if len(name) > 100:
        return None, "Name must not exceed 100 characters"
    if len(email) > 255:
        return None, "Email must not exceed 255 characters"
    if len(course) > 100:
        return None, "Course must not exceed 100 characters"
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        return None, "A valid email address is required"

    return {"name": name, "email": email, "course": course}, None


@app.get("/health")
def health():
    try:
        execute_with_retry("SELECT 1")
        return jsonify({
            "status": "ok",
            "service": "student-api",
            "database": "connected",
        }), 200
    except Error:
        app.logger.exception("Health check failed")
        return jsonify({
            "status": "unhealthy",
            "service": "student-api",
            "database": "unavailable",
        }), 503


@app.get("/students")
def get_students():
    cached_students, cache_status = cache_get(STUDENTS_CACHE_KEY)
    if cache_status == "HIT":
        return json_with_cache_header(cached_students, 200, "HIT")

    try:
        students = execute_with_retry(
            """
            SELECT id, name, email, course
            FROM students
            ORDER BY id
            """,
            fetch=True,
        )

        cache_written = cache_set(STUDENTS_CACHE_KEY, students)
        response_cache_status = "MISS" if cache_written and cache_status != "BYPASS" else "BYPASS"
        return json_with_cache_header(students, 200, response_cache_status)

    except Error:
        app.logger.exception("Unable to retrieve students")
        return jsonify({"error": "Student service temporarily unavailable"}), 503


@app.get("/students/<int:student_id>")
def get_student(student_id):
    cache_key = STUDENT_CACHE_KEY_PREFIX + str(student_id)
    cached_student, cache_status = cache_get(cache_key)
    if cache_status == "HIT":
        return json_with_cache_header(cached_student, 200, "HIT")

    try:
        students = execute_with_retry(
            """
            SELECT id, name, email, course
            FROM students
            WHERE id = %s
            """,
            (student_id,),
            fetch=True,
        )

        if not students:
            return jsonify({"error": "Student not found"}), 404

        student = students[0]
        cache_written = cache_set(cache_key, student)
        response_cache_status = "MISS" if cache_written and cache_status != "BYPASS" else "BYPASS"
        return json_with_cache_header(student, 200, response_cache_status)

    except Error:
        app.logger.exception("Unable to retrieve student")
        return jsonify({"error": "Student service temporarily unavailable"}), 503


@app.post("/students")
def create_student():
    data, error_message = validate_student_data(request.get_json(silent=True))
    if error_message:
        return jsonify({"error": error_message}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO students (name, email, course)
            VALUES (%s, %s, %s)
            """,
            (data["name"], data["email"], data["course"]),
        )
        student_id = cursor.lastrowid
        connection.commit()

        invalidate_student_cache(student_id)
        return jsonify({"id": student_id, **data}), 201

    except IntegrityError as exc:
        if connection is not None:
            connection.rollback()
        if getattr(exc, "errno", None) == 1062:
            return jsonify({"error": "A student with this email already exists"}), 409
        app.logger.exception("Database integrity error creating student")
        return jsonify({"error": "Could not create student"}), 500

    except Error:
        if connection is not None:
            connection.rollback()
        app.logger.exception("Unable to create student")
        return jsonify({"error": "Student service temporarily unavailable"}), 503

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


@app.put("/students/<int:student_id>")
def update_student(student_id):
    data, error_message = validate_student_data(request.get_json(silent=True))
    if error_message:
        return jsonify({"error": error_message}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT id FROM students WHERE id = %s", (student_id,))

        if cursor.fetchone() is None:
            return jsonify({"error": "Student not found"}), 404

        cursor.execute(
            """
            UPDATE students
            SET name = %s, email = %s, course = %s
            WHERE id = %s
            """,
            (data["name"], data["email"], data["course"], student_id),
        )
        connection.commit()

        invalidate_student_cache(student_id)
        return jsonify({
            "message": "Student updated successfully",
            "id": student_id,
            **data,
        }), 200

    except IntegrityError as exc:
        if connection is not None:
            connection.rollback()
        if getattr(exc, "errno", None) == 1062:
            return jsonify({"error": "Another student already uses this email"}), 409
        app.logger.exception("Database integrity error updating student")
        return jsonify({"error": "Could not update student"}), 500

    except Error:
        if connection is not None:
            connection.rollback()
        app.logger.exception("Unable to update student")
        return jsonify({"error": "Student service temporarily unavailable"}), 503

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


@app.delete("/students/<int:student_id>")
def delete_student(student_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("DELETE FROM students WHERE id = %s", (student_id,))
        deleted = cursor.rowcount
        connection.commit()

        if not deleted:
            return jsonify({"error": "Student not found"}), 404

        invalidate_student_cache(student_id)
        return jsonify({
            "message": "Student deleted successfully",
            "id": student_id,
        }), 200

    except Error:
        if connection is not None:
            connection.rollback()
        app.logger.exception("Unable to delete student")
        return jsonify({"error": "Student service temporarily unavailable"}), 503

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()
