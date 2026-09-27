#!/usr/bin/env bash
# ==============================================================================
# Ranker Ubuntu Server Setup Script
# Installs .NET 10, Node.js 22 LTS, Nginx, configures directories, systemd, and UFW
# ==============================================================================
set -euo pipefail

echo "=========================================="
echo " Starting Ranker Server Provisioning"
echo "=========================================="

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run this script with sudo or as root:"
  echo "  sudo bash deploy/scripts/setup-server.sh"
  exit 1
fi

CURRENT_USER="${SUDO_USER:-$(whoami)}"
echo "Configuring for user: ${CURRENT_USER}"

# 1. Update system packages & install prerequisites
echo "--> Updating system packages..."
apt-get update -y
apt-get install -y ca-certificates curl wget gnupg lsb-release ufw git rsync tar gzip libicu-dev

# 2. Install Node.js 22 LTS
echo "--> Installing Node.js 22 LTS..."
if ! command -v node &> /dev/null || [[ $(node -v) != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

# 3. Install .NET 10 SDK & Runtime via official Microsoft install script
echo "--> Installing .NET 10..."
mkdir -p /usr/share/dotnet
mkdir -p /var/tmp
export TMPDIR=/var/tmp

# Clean up any previously corrupted or partial downloads
rm -rf /usr/share/dotnet/* /tmp/dotnet-install.sh /var/tmp/dotnet*

curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
chmod +x /tmp/dotnet-install.sh

# Run install with verbose output (fallback to ASP.NET Core runtime if SDK has environment constraints)
/tmp/dotnet-install.sh --channel 10.0 --install-dir /usr/share/dotnet --verbose || \
/tmp/dotnet-install.sh --channel 10.0 --runtime aspnetcore --install-dir /usr/share/dotnet --verbose

ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet
rm -f /tmp/dotnet-install.sh
echo ".NET version: $(dotnet --version)"

# 4. Install and configure Nginx
echo "--> Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# 5. Create deployment directories
echo "--> Setting up /var/www/ranker directories..."
mkdir -p /var/www/ranker/backend
mkdir -p /var/www/ranker/frontend

# Assign ownership to www-data and deploy user
usermod -aG www-data "${CURRENT_USER}"
chown -R "${CURRENT_USER}":www-data /var/www/ranker
chmod -R 775 /var/www/ranker

# Ensure new files created in /var/www/ranker inherit group permissions (setgid)
chmod g+s /var/www/ranker
chmod g+s /var/www/ranker/backend
chmod g+s /var/www/ranker/frontend

# 6. Copy systemd service definitions
echo "--> Installing systemd services..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "${SCRIPT_DIR}")"

if [ -f "${REPO_DIR}/systemd/ranker-backend.service" ]; then
  cp "${REPO_DIR}/systemd/ranker-backend.service" /etc/systemd/system/
fi

if [ -f "${REPO_DIR}/systemd/ranker-frontend.service" ]; then
  cp "${REPO_DIR}/systemd/ranker-frontend.service" /etc/systemd/system/
fi

systemctl daemon-reload
systemctl enable ranker-backend.service || true
systemctl enable ranker-frontend.service || true

# 7. Configure Nginx virtual host
echo "--> Installing Nginx site configuration..."
if [ -f "${REPO_DIR}/nginx/ranker.conf" ]; then
  cp "${REPO_DIR}/nginx/ranker.conf" /etc/nginx/sites-available/ranker
  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/ranker /etc/nginx/sites-enabled/ranker
  nginx -t && systemctl reload nginx
fi

# 8. Configure passwordless sudo for service restarts in CI/CD
echo "--> Configuring sudoers for CI/CD deployments..."
cat > /etc/sudoers.d/ranker-deploy << EOF
# Allow only the deploy user to manage Ranker services without a password
${CURRENT_USER} ALL=(ALL) NOPASSWD: \\
  /usr/bin/systemctl restart ranker-backend, \\
  /usr/bin/systemctl restart ranker-frontend, \\
  /usr/bin/systemctl reload nginx, \\
  /usr/bin/systemctl status ranker-backend, \\
  /usr/bin/systemctl status ranker-frontend, \\
  /usr/bin/journalctl
EOF
chmod 0440 /etc/sudoers.d/ranker-deploy

# 9. Configure firewall (UFW)
echo "--> Configuring firewall (allowing SSH, HTTP 80, HTTPS 443)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
# ufw --force enable (uncomment if you want UFW enabled automatically)

echo "=========================================="
echo " Server Setup Complete!"
echo " Backend folder:  /var/www/ranker/backend"
echo " Frontend folder: /var/www/ranker/frontend"
echo " Services ready:  ranker-backend, ranker-frontend"
echo "=========================================="
