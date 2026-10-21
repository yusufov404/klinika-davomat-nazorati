#!/usr/bin/env bash
# ===================================================================
#  Lokal SSL sertifikat yaratish (HTTPS uchun)
#  Ishga tushirish:  sudo ./scripts/make-certs.sh [IP manzil]
# ===================================================================
set -euo pipefail

IP="${1:-192.168.50.2}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"

mkdir -p "$DIR"
cd "$DIR"

cat > san.cnf <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
req_extensions     = v3_req

[dn]
C  = UZ
ST = Tashkent
L  = Tashkent
O  = Klinika
CN = ${IP}

[v3_req]
basicConstraints = critical, CA:TRUE
keyUsage         = critical, digitalSignature, keyEncipherment, keyCertSign
extendedKeyUsage = serverAuth
subjectAltName   = @alt_names

[alt_names]
IP.1  = ${IP}
DNS.1 = localhost
DNS.2 = attendance.local
EOF

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout privkey.pem -out fullchain.pem -config san.cnf

chmod 600 privkey.pem
rm -f san.cnf

echo "✅ Sertifikat yaratildi: $DIR/fullchain.pem"
echo "   Brauzerda ogohlantirish chiqishi mumkin (lokal CA emas) —"
echo "   ishonchli sertifikat uchun ichki CA tashkil eting."
