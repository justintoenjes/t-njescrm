#!/bin/bash
set -e

# Run on microcrm server to generate self-signed SSL cert
# Usage: ssh microcrm 'bash -s' < setup-ssl.sh

CERT_DIR="/home/microcrm/certs"

echo "==> Creating cert directory..."
sudo -u microcrm mkdir -p "$CERT_DIR"

echo "==> Generating self-signed certificate for 'microcrm'..."
sudo -u microcrm openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/CN=microcrm" \
  -addext "subjectAltName=DNS:microcrm,IP:192.168.178.162"

echo "==> Certificates created:"
ls -la "$CERT_DIR"

echo "==> Done! Cert valid for 10 years."
