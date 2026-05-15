#!/bin/bash
# ============================================================
# ARIA V1 — Generate RSA key pair for JWT RS256 signing
# Run once: bash scripts/generate-keys.sh
# ============================================================

set -e

echo "Generating RSA-4096 key pair for JWT RS256..."

# Generate private key
openssl genrsa -out private_key.pem 4096

# Extract public key
openssl rsa -in private_key.pem -pubout -out public_key.pem

# Base64 encode for .env.local
PRIVATE_KEY_B64=$(base64 -w 0 private_key.pem 2>/dev/null || base64 private_key.pem)
PUBLIC_KEY_B64=$(base64 -w 0 public_key.pem 2>/dev/null || base64 public_key.pem)

echo ""
echo "Keys generated successfully."
echo "Add these to your .env.local:"
echo ""
echo "JWT_PRIVATE_KEY=${PRIVATE_KEY_B64}"
echo "JWT_PUBLIC_KEY=${PUBLIC_KEY_B64}"
echo ""
echo "IMPORTANT: Delete private_key.pem and public_key.pem after copying to .env.local"
echo "NEVER commit .env.local or *.pem files to git."

# Cleanup reminder
echo ""
echo "Run: rm private_key.pem public_key.pem"
