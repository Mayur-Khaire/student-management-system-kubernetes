# Student Management System on Kubernetes

A containerized student management application deployed on a two-node Kubernetes cluster using AWS EC2. The project demonstrates container orchestration, service networking, persistent storage, database migration, and Redis caching.

## Architecture

* **Frontend:** NGINX
* **Backend:** Flask REST API
* **Database:** MySQL 8.4
* **Cache:** Redis 7
* **Containerization:** Docker and Docker Hub
* **Orchestration:** Kubernetes, kubeadm, and containerd
* **Networking:** Calico CNI with VXLAN
* **Storage:** Kubernetes PersistentVolumes and PersistentVolumeClaims
* **Cloud:** AWS EC2

## Features

* Create, view, update, and delete student records.
* Route frontend API requests to the Flask backend through NGINX.
* Cache student records in Redis with a 60-second TTL.
* Invalidate relevant cache entries after student data changes.
* Preserve MySQL data using persistent storage.
* Manage database credentials using Kubernetes Secrets.
* Expose the frontend through a Kubernetes NodePort Service.

## Project Structure

```text
k8s/
├── backend/
│   ├── app.py
│   ├── Dockerfile
│   └── requirements.txt
├── database/
│   └── init.sql
├── frontend/
│   ├── app.js
│   ├── index.html
│   ├── nginx.conf
│   ├── style.css
│   └── Dockerfile
├── kubernetes/
│   ├── backend.yaml
│   ├── frontend.yaml
│   ├── mysql-storage.yaml
│   ├── mysql.yaml
│   └── redis.yaml
├── docker-compose.yml
├── .env.example
└── README.md
```

## Run Locally with Docker Compose

### Prerequisites

* Docker Engine or Docker Desktop
* Docker Compose

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/Mayur-Khaire/student-management-system-kubernetes.git
   cd student-management-system-kubernetes
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and configure your database credentials. Do not commit this file.

4. Build and start the services:

   ```bash
   docker compose up --build -d
   ```

5. Check the service status:

   ```bash
   docker compose ps
   ```

6. Test the application:

   ```bash
   curl http://localhost:8080/api/health
   curl http://localhost:8080/api/students
   ```

The frontend is available at `http://localhost:8080`.

## Kubernetes Deployment

The Kubernetes manifests are located in the `kubernetes/` directory.

The deployment requires:

* A Kubernetes cluster with a working CNI.
* The frontend and backend images available in Docker Hub.
* A configured `student-db-credentials` Secret.
* A `mysql-initdb` ConfigMap containing a database initialization SQL script.
* A PersistentVolumeClaim backed by storage accessible from the MySQL node.

Apply the manifests in dependency order:

```bash
kubectl apply -f kubernetes/mysql-storage.yaml
kubectl apply -f kubernetes/mysql.yaml
kubectl apply -f kubernetes/redis.yaml
kubectl apply -f kubernetes/backend.yaml
kubectl apply -f kubernetes/frontend.yaml
```

Create the required Secret and initialization ConfigMap before deploying MySQL. Supply your own SQL backup; database backups and credentials are intentionally excluded from the repository.

Verify the deployment:

```bash
kubectl get nodes -o wide
kubectl get pods -o wide
kubectl get services
kubectl get pvc
```

The frontend uses NodePort `30080` by default. Access it through a permitted EC2 node address:

```text
http://<EC2-public-IP>:30080
```

Restrict inbound access to the application port through the EC2 security group.

## Security Notes

* Never commit `.env` files, database backups, passwords, or SSH private keys.
* Kubernetes Secrets should be managed carefully and should not be treated as encrypted merely because they are encoded.
* MySQL and Redis are exposed through internal Kubernetes Services, not public application ports.
* The local PersistentVolume configuration is intended for a learning environment, not production-grade high availability.

## Learning Outcomes

* Deployed a multi-component application on a two-node Kubernetes cluster.
* Configured Kubernetes Deployments, Services, and persistent storage.
* Troubleshot Kubernetes DNS and cross-node networking using Calico VXLAN.
* Migrated MySQL records from a SQL backup.
* Implemented Redis caching and cache invalidation in a Flask application.
