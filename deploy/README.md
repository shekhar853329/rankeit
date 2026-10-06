# Ranker Deployment Guide: Ubuntu Server & GitHub Actions CI/CD

This guide walks you through setting up automated CI/CD deployment of the **Ranker ASP.NET Core Web API** and **Ranker Angular SSR Frontend** to an Ubuntu server using **GitHub Actions**, **systemd**, and **Nginx**.

---

## 🏛 Architecture Overview

```
                      [ Internet / User Browser ]
                                   │
                                   ▼ Port 80 (HTTP) / 443 (HTTPS)
                            [ Nginx Server ]
                     ┌─────────────┴─────────────┐
                     │                           │
          /api/ and /hubs/ (WebSockets)          │ / (All other requests)
                     │                           │
                     ▼                           ▼
        [ ranker-backend.service ]   [ ranker-frontend.service ]
          ASP.NET Core (.NET 10)         Angular 20 SSR (Node 24)
          Port: 127.0.0.1:5000           Port: 127.0.0.1:4000
                     │
                     ▼
          [ External SQL Server ]
```

---

## 🔒 Security & API Protection Architecture

The backend API is **completely isolated** from direct external access:

1. **Local Loopback Isolation**:
   - The ASP.NET Core API listens strictly on `127.0.0.1:5000` (loopback).
   - Port 5000 is **NOT** exposed or open in the firewall (UFW).
   - External internet scanners or scrapers cannot connect to port 5000 directly.

2. **Nginx Reverse Proxy Gatekeeping**:
   - Nginx inspects all incoming requests to `/api/`.
   - Any request that does **not** carry the Angular client application header (`X-App-Client: Ranker-UI-Client`) is instantly rejected with **403 Forbidden**.
   - Direct address-bar hits, automated bots, and external tools like curl/Postman hitting `/api/` from outside are blocked at the edge.
   - Cross-site WebSocket hijacking on `/hubs/` is blocked via `Sec-Fetch-Site: cross-site` inspection.

3. **Angular HTTP Interceptor (`appSecurityInterceptor`)**:
   - Transparently attaches `X-App-Client: Ranker-UI-Client` and `X-Requested-With: XMLHttpRequest` to every outgoing API call made by your Angular application.
   - SignalR sends the client identification header during the connection handshake.

4. **Defense-in-Depth ASP.NET Core Middleware**:
   - Even behind the proxy, the backend middleware validates the client header in Production.
   - Only your Angular application and internal loopback processes (Node SSR server, health checks) are granted access.
   - OpenAPI / Swagger documentation endpoints are disabled in Production (`app.Environment.IsDevelopment()` check).

---

## 📋 Step 1: One-Time Server Setup (Ubuntu)

SSH into your Ubuntu server and run the automated provisioning script.

1. **Clone the repository (or copy the script)** to your server:
   ```bash
   git clone https://github.com/shekhar853329/rankeit.git /tmp/rankeit
   ```

2. **Run the provisioning script as root / with sudo**:
   ```bash
   sudo bash /tmp/rankeit/deploy/scripts/setup-server.sh
   ```

### What this script does automatically:
- Installs prerequisites (`curl`, `rsync`, `git`, `ufw`).
- Installs **Node.js 24**.
- Installs **.NET 10 SDK & Runtime** via official Microsoft scripts.
- Installs & enables **Nginx**.
- Prepares deployment directories:
  - `/var/www/ranker/backend`
  - `/var/www/ranker/frontend`
- Installs systemd services (`ranker-backend.service` and `ranker-frontend.service`).
- Configures Nginx reverse proxy with SignalR WebSocket support and static asset caching.
- Configures `sudoers` so your CI/CD runner can restart the services without a password prompt.

---

## 🔑 Step 2: Configure SSH Key for GitHub Actions

GitHub Actions needs SSH access to sync your build files and restart the services.

1. **Generate an SSH key pair** (on your local computer or on the server):
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-ranker" -f ~/.ssh/ranker_deploy_key
   ```

2. **Add the public key** to your Ubuntu server's `authorized_keys`:
   ```bash
   cat ~/.ssh/ranker_deploy_key.pub >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   chmod 700 ~/.ssh
   ```

3. **Keep the private key** (`~/.ssh/ranker_deploy_key`) safe. You will paste this into GitHub Secrets.

---

## 🔐 Step 3: Add GitHub Repository Secrets

In your GitHub repository:
1. Go to **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret** and add the following:

| Secret Name | Value Example | Description |
|---|---|---|
| `SERVER_HOST` | `123.45.67.89` | Public IP address of your Ubuntu server |
| `SERVER_USER` | `ubuntu` (or your SSH username) | Ubuntu user with SSH and sudo access |
| `SERVER_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Private key content generated in Step 2 |
| `SERVER_PORT` | `22` (optional, defaults to 22) | SSH port |
| `DODO_PAYMENTS_API_KEY` | `your_dodo_api_key` | Dodo Payments API Key |
| `DODO_PAYMENTS_PRODUCT_ID` | `pdt_...` | Dodo Payments Product ID |

---

## 🚀 Step 4: Trigger the CI/CD Pipeline

The pipeline is triggered automatically whenever you push code to `main`:

```bash
git add .
git commit -m "Configure Ubuntu deployment and CI/CD pipeline"
git push origin main
```

You can also trigger it manually at any time:
1. Go to **GitHub** > **Actions**.
2. Select **Build & Deploy to Ubuntu Server**.
3. Click **Run workflow** > Select branch `main` > **Run workflow**.

---

## 🛠 Manual Management & Useful Commands on Ubuntu

### Check Service Status
```bash
sudo systemctl status ranker-backend
sudo systemctl status ranker-frontend
sudo systemctl status nginx
```

### View Live Logs
```bash
# Backend ASP.NET Core logs
sudo journalctl -u ranker-backend -f

# Frontend Node SSR logs
sudo journalctl -u ranker-frontend -f

# Nginx access & error logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Restart Services Manually
```bash
sudo systemctl restart ranker-backend
sudo systemctl restart ranker-frontend
sudo systemctl reload nginx
```

### Verify Endpoints Locally on Server
```bash
# Check backend health & database connection
curl -s http://127.0.0.1:5000/api/health | jq .

# Check frontend SSR output
curl -I http://127.0.0.1:4000
```

---

## 🌐 Next Step: Adding a Domain Name & Free HTTPS (SSL)

When you are ready to point a custom domain (e.g., `ranker.com`) to your server:

1. Create an **A record** in your DNS provider pointing `@` and `www` to your Ubuntu server's public IP.
2. Edit `/etc/nginx/sites-available/ranker`:
   ```nginx
   server_name ranker.com www.ranker.com;
   ```
3. Test and reload Nginx:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. Install Certbot and obtain free SSL certificates:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d ranker.com -d www.ranker.com
   ```
   Certbot will automatically update the Nginx configuration and set up automatic SSL certificate renewals!
