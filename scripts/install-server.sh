#!/usr/bin/env bash
# ===================================================================
#  Klinika davomat tizimi - server o'rnatish (Ubuntu Server 22.04/24.04)
#  Ishga tushirish:  sudo ./scripts/install-server.sh
# ===================================================================
set -euo pipefail

APP_DIR="/opt/attendance"

echo "=== 1/7: Dasturlarni yangilash ==="
apt update && apt upgrade -y
apt install -y curl git ufw chrony postgresql-client openssl rsync unattended-upgrades

echo "=== 2/7: Docker o'rnatish ==="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "=== 3/7: Loyiha papkasiga ko'chirish ==="
mkdir -p "$APP_DIR"
cd "$(dirname "$0")/.."
if [[ "$PWD" != "$APP_DIR" ]]; then
  rsync -a --exclude node_modules --exclude .git ./ "$APP_DIR"/
fi
cd "$APP_DIR"

echo "=== 4/7: .env faylini tayyorlash ==="
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "  ⚠️  .env yaratildi. Kalitlarni o'zgartiring:"
  echo "      openssl rand -hex 48   # JWT kalitlari"
  echo "      openssl rand -hex 32   # ENCRYPTION_KEY"
  echo "  Keyin: nano .env"
else
  echo "  .env mavjud, o'tkazib yuboriladi"
fi

echo "=== 5/7: Vaqt sinxronizatsiyasi (NTP) ==="
timedatectl set-timezone Asia/Tashkent
timedatectl set-ntp true
timedatectl status

echo "=== 6/7: Firewall ==="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8080/tcp
ufw allow 3000/tcp
ufw --force enable
echo "  ℹ️  Faqat 3000-port terminallar uchun VLAN ichida ochilishi kerak."

echo "=== 7/7: Qurilma va ishga tushirish ==="
docker compose up -d --build
docker compose exec app node scripts/migrate.js up
docker compose exec app node scripts/seed.js

echo ""
echo "✅ O'rnatish yakunlandi."
echo "   Admin panel:  http://$(hostname -I | awk '{print $1}'):8080"
echo "   API health:   http://$(hostname -I | awk '{print $1}'):3000/api/health"
echo ""
echo "   HTTPS uchun:  ./scripts/make-certs.sh $(hostname -I | awk '{print $1}')"
echo "                 docker compose -f docker-compose.yml -f docker-compose.https.yml up -d"
