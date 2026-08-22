# Compiler Backend — Production Deployment & Nginx Setup Guide

This guide provides step-by-step instructions to deploy the **Compiler Backend** on a Linux server (Ubuntu/Debian) behind an **Nginx** reverse proxy, complete with WebSocket support (`Socket.IO`), Docker-in-Docker sandbox execution, and domain SSL configuration.

---

## 1. System Overview & Architecture

The Compiler Backend consists of:
- **Node.js (Express & Socket.IO server)**: Runs on port `5001` handling API requests and streaming real-time compilation output.
- **Redis 7**: Manages Bull background job queues and rate limiting.
- **MongoDB 7**: Stores job execution history and metadata.
- **Docker Engine**: Compiles and executes code in isolated containers (`compiler-cpp`, `compiler-python`, `compiler-rust`, `compiler-go`, `compiler-java`).
- **Nginx**: Reverse proxy handling HTTP endpoints (`/api`, `/health`) and WebSocket upgrades (`/socket.io`).

---

## 2. Prerequisites & Server Initial Setup

### Step 2.1: Update System Packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ufw
```

### Step 2.2: Install Docker & Docker Compose
The backend relies on Docker to spawn isolated sandboxes for untrusted code execution.

```bash
# Install Docker Engine
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose Plugin
sudo apt install -y docker-compose-plugin

# Grant current user permission to execute Docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker installation
docker --version
docker compose version
```

### Step 2.3: Install Node.js (v20 LTS) & PM2 (For Bare-Metal Option)
If deploying directly on the host using PM2:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

---

## 3. Clone Repository & Build Sandbox Images

### Step 3.1: Clone & Configure Directories
```bash
# Create /var/www directory if it does not exist
sudo mkdir -p /var/www

cd /var/www
sudo git clone https://github.com/codeopsdigital/Devora-learn-compiler compiler-backend
sudo chown -R $USER:$USER /var/www/compiler-backend
cd /var/www/compiler-backend

# Ensure host jobs temporary directory exists with write permissions
sudo mkdir -p /tmp/jobs
sudo chmod 777 /tmp/jobs
```

### Step 3.2: Build Language Sandbox Images
The backend dynamically calls Docker images for execution. Build all sandbox images before launching the server:

```bash
# Build C++ Image
docker build -t compiler-cpp ./docker/cpp

# Build Python Image
docker build -t compiler-python ./docker/python

# Build Rust Image
docker build -t compiler-rust ./docker/rust

# Build Go Image
docker build -t compiler-go ./docker/go

# Build Java Image
docker build -t compiler-java ./docker/java

# Verify built images
docker images | grep compiler-
```

---

## 4. Environment Configuration

Create a `.env` file in the root directory:

```bash
nano .env
```

Paste and customize the following environment variables:

```env
PORT=5001
NODE_ENV=production
MONGO_URI=mongodb://localhost:27017/online-compiler
REDIS_URL=redis://localhost:6379
CLIENT_URL=https://yourdomain.com
WORKER_CONCURRENCY=5
JOBS_DIR=/tmp/jobs
```

> **Note:** If deploying via Docker Compose, set `MONGO_URI=mongodb://mongo:27017/online-compiler` and `REDIS_URL=redis://redis:6379`.

---

## 5. Running the Backend

You can run the backend using **Option A (Docker Compose)** or **Option B (PM2 + Host Services)**.

### Option A: Docker Compose Deployment (Recommended)

1. Start containers using Docker Compose:
   ```bash
   docker compose up -d --build
   ```

2. Check status and logs:
   ```bash
   docker compose ps
   docker compose logs -f backend
   ```

### Option B: PM2 Deployment on Host

1. Install Redis & MongoDB on host (if not already running):
   ```bash
   # Redis
   sudo apt install -y redis-server
   sudo systemctl enable --now redis-server

   # MongoDB 7
   sudo apt install -y mongodb-org
   sudo systemctl enable --now mongod
   ```

2. Install Node dependencies & start via PM2:
   ```bash
   npm ci --production
   pm2 start src/index.js --name "compiler-backend"
   pm2 save
   pm2 startup
   ```

---

## 6. Nginx Reverse Proxy Configuration

Nginx will proxy client requests to port `5001`, managing both REST HTTP endpoints and real-time WebSockets.

### Step 6.1: Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

### Step 6.2: Create Nginx Site Configuration

Create `/etc/nginx/sites-available/compiler-backend`:

```bash
sudo nano /etc/nginx/sites-available/compiler-backend
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name compiler-api.yourdomain.com; # Replace with your domain or server IP

    # General Request Body Size Limit
    client_max_body_size 10M;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # REST API Routes Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for longer executions
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
    }

    # Health Check Route
    location /health {
        proxy_pass http://127.0.0.1:5001/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Socket.IO Real-Time WebSockets Proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;

        # Mandatory headers for WebSocket handshake upgrade
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for real-time WebSocket streaming
        proxy_buffering off;
        proxy_cache off;

        # Extended timeouts for active streaming sockets
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### Step 6.3: Enable Nginx Configuration & Restart

```bash
# Enable site configuration link
sudo ln -s /etc/nginx/sites-available/compiler-backend /etc/nginx/sites-enabled/

# Test Nginx syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## 7. Domain Addition & SSL (HTTPS) Configuration

To make the compiler backend accessible publicly under a domain with SSL/TLS encryption, follow these steps:

### Step 7.1: Configure DNS Records
Go to your domain provider (e.g., Cloudflare, Namecheap, GoDaddy) and point an `A Record` to your server IP:

| Type | Name | Content / Target | TTL |
|------|------|------------------|-----|
| `A`  | `compiler-api` | `YOUR_SERVER_PUBLIC_IP` | Auto / 300 |

*(e.g., `compiler-api.yourdomain.com` points to `203.0.113.10`)*

### Step 7.2: Open Firewall & Cloud Network Ports (UFW & Azure/AWS NSG)
1. **OS Firewall (UFW)**: Ensure HTTP (80) and HTTPS (443) ports are open:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

2. **Cloud Security Group (Azure / AWS / GCP)**: 
> ⚠️ **IMPORTANT FOR AZURE/AWS USERS:** Opening UFW ports alone is not enough. You must also allow inbound HTTP (Port 80) and HTTPS (Port 443) traffic in the **Azure Network Security Group (NSG)** or AWS Security Group:
> - Go to **Azure Portal** -> **Virtual Machines** -> Select your VM (`devoracamp-backend`).
> - Click **Networking** -> **Add inbound port rule**.
> - Add rules allowing **Port 80 (HTTP)** and **Port 443 (HTTPS)** for `Any` source.
> - Without this, Certbot validation will time out (`Timeout during connect`).

### Step 7.3: Install Certbot & Obtain Free SSL Certificate
Use Certbot to automatically configure Let's Encrypt SSL certificates for Nginx:

```bash
# Install Certbot and Nginx plugin
sudo apt install -y certbot python3-certbot-nginx

# Obtain and install SSL Certificate (Automated)
sudo certbot --nginx -d compiler-api.yourdomain.com
```

Certbot will automatically update `/etc/nginx/sites-available/compiler-backend` to redirect HTTP traffic to HTTPS and configure SSL certificates (`/etc/letsencrypt/live/compiler-api.yourdomain.com/`).

### Step 7.4: Verify Automated SSL Renewal
```bash
sudo certbot renew --dry-run
```

### Step 7.5: Update Backend CORS Settings
After enabling SSL, update `.env` to allow requests only from your secure frontend domain:

```env
CLIENT_URL=https://your-frontend-domain.com
```

Restart the backend to apply changes:
```bash
# If using Docker Compose:
docker compose restart backend

# If using PM2:
pm2 restart compiler-backend
```

---

## 8. Verification & Testing

### Test 1: Health Check Endpoint
```bash
curl -i https://compiler-api.yourdomain.com/health
```
**Expected Output:**
```json
HTTP/2 200
{"status":"UP","timestamp":"2026-08-22T10:00:00.000Z"}
```

### Test 2: Code Execution Endpoint
```bash
curl -i -X POST https://compiler-api.yourdomain.com/api/execute/execute \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(\"Hello from Nginx!\")"}'
```

**Expected Output:**
```json
HTTP/2 202
{"jobId":"...","status":"queued","message":"Code execution started"}
```

### Test 3: Socket.IO WebSocket Connection Test
Connect using a browser console or Node.js test script:

```javascript
import { io } from "socket.io-client";

const socket = io("https://compiler-api.yourdomain.com", {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("Connected to Compiler Backend via Nginx! Socket ID:", socket.id);
});
```

---

## 9. Troubleshooting & Best Practices

| Issue | Cause | Solution |
|-------|-------|----------|
| `502 Bad Gateway` | Backend container/process is not running on port 5001 | Check status with `pm2 status` or `docker compose ps`. |
| WebSocket fallback to HTTP Polling | Missing WebSocket headers in Nginx | Ensure `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "Upgrade";` exist in `/socket.io/` block. |
| `Permission denied` on `/var/run/docker.sock` | User or container lacks permissions for Docker daemon | Run `sudo usermod -aG docker $USER` and restart backend. |
| `ENOENT: no such file or directory /tmp/jobs/...` | `/tmp/jobs` directory missing or lacks permissions | Run `mkdir -p /tmp/jobs && chmod 777 /tmp/jobs`. |
| `429 Too Many Requests` | Express rate limiter triggered | Rate limiting is active (20 req/min per IP). Adjust in `src/middleware/rateLimiter.js` if needed. |
