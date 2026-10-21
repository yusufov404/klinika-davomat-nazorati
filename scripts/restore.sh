#!/usr/bin/env bash
# ===================================================================
#  PostgreSQL backup'ni tiklash
#  Ishga tushirish:  ./scripts/restore.sh backups/attendance_20260101_030000.dump
# ===================================================================
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Foydalanish: $0 <backup fayli>"
  ls -lh backups/ 2>/dev/null || true
  exit 1
fi

cd "$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

DB_NAME="${DB_NAME:-attendance}"
DB_USER="${DB_USER:-attendance}"
DB_PASSWORD="${DB_PASSWORD:-attendance}"
PGPASSWORD="$DB_PASSWORD"

echo "⚠️  Diqqat: '${DB_NAME}' bazasi to'liq almashtiriladi!"
read -p "Davom etasizmi? (yes/no): " ans
[[ "$ans" == "yes" ]] || { echo "Bekor qilindi."; exit 1; }

echo "1/3) Eski bazani tozalanmoqda..."
docker compose exec -T db psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);" -c "CREATE DATABASE ${DB_NAME};"

echo "2/3) Backup tiklanmoqda..."
docker compose exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < "$FILE"

echo "3/3) Tekshirilmoqda..."
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT count(*) AS xodimlar FROM employees;"

echo "✅ Backup tiklandi: $FILE"
