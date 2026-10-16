CREATE DATABASE IF NOT EXISTS studentdb;

USE studentdb;

CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    course VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO students (name, email, course)
VALUES
    ('Rahul Sharma', 'rahul@example.com', 'Computer Science'),
    ('Priya Patil', 'priya@example.com', 'Information Technology'),
    ('Amit Deshmukh', 'amit@example.com', 'Cloud Computing');
