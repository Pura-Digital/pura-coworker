#!/usr/bin/env bash
# Validates CSC_LINK / CSC_KEY_PASSWORD before electron-builder runs.
# Uses `security import` (same as electron-builder), not OpenSSL alone — legacy .p12
# files use RC2-40-CBC which OpenSSL 3 rejects unless -legacy is passed.
set -euo pipefail

if [ -z "${CSC_LINK:-}" ]; then
  echo "::error::CSC_LINK is empty. Add the base64 .p12 to GitHub Actions secrets for this repository."
  exit 1
fi

if [ -z "${CSC_KEY_PASSWORD:-}" ]; then
  echo "::error::CSC_KEY_PASSWORD is empty. Add the .p12 export password to GitHub Actions secrets."
  exit 1
fi

echo "CSC_LINK length: ${#CSC_LINK}"
echo "CSC_KEY_PASSWORD length: ${#CSC_KEY_PASSWORD}"

TMP_P12="$(mktemp /tmp/csc-verify.XXXXXX.p12)"
# Do not mktemp the keychain path — mktemp creates an empty file and
# `security create-keychain` then fails with "already exists".
TMP_KC="/tmp/csc-verify-$$-$(date +%s)-$RANDOM.keychain-db"
cleanup() {
  rm -f "$TMP_P12"
  security delete-keychain "$TMP_KC" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! printf '%s' "$CSC_LINK" | tr -d '[:space:]' | base64 -D >"$TMP_P12" 2>/dev/null; then
  echo "::error::CSC_LINK is not valid base64. Regenerate with: base64 -i cert.p12 | tr -d '\\n'"
  exit 1
fi

P12_SIZE="$(wc -c <"$TMP_P12" | tr -d ' ')"
echo "Decoded .p12 size: ${P12_SIZE} bytes"
if [ "$P12_SIZE" -lt 500 ]; then
  echo "::error::Decoded .p12 is too small (${P12_SIZE} bytes). CSC_LINK may be truncated or wrong."
  exit 1
fi

# Optional OpenSSL inspect (legacy .p12 needs -legacy on OpenSSL 3+).
if openssl pkcs12 -legacy -in "$TMP_P12" -nokeys -passin pass:"$CSC_KEY_PASSWORD" >/dev/null 2>&1; then
  echo "Certificate in .p12:"
  openssl pkcs12 -legacy -in "$TMP_P12" -nokeys -passin pass:"$CSC_KEY_PASSWORD" 2>/dev/null \
    | openssl x509 -noout -subject -issuer
elif openssl pkcs12 -in "$TMP_P12" -nokeys -passin pass:"$CSC_KEY_PASSWORD" >/dev/null 2>&1; then
  echo "Certificate in .p12:"
  openssl pkcs12 -in "$TMP_P12" -nokeys -passin pass:"$CSC_KEY_PASSWORD" 2>/dev/null \
    | openssl x509 -noout -subject -issuer
else
  echo "OpenSSL could not parse .p12 (common with legacy RC2 encryption); continuing with security import..."
fi

KC_PASS="$(openssl rand -base64 24 2>/dev/null || date +%s)"
security delete-keychain "$TMP_KC" >/dev/null 2>&1 || true
security create-keychain -p "$KC_PASS" "$TMP_KC"
security unlock-keychain -p "$KC_PASS" "$TMP_KC"

if ! security import "$TMP_P12" -k "$TMP_KC" -P "$CSC_KEY_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security 2>/dev/null; then
  echo "::error::security import failed. Wrong CSC_KEY_PASSWORD, corrupt .p12, or missing private key."
  exit 1
fi

security set-key-partition-list -S apple-tool:,apple: -s -k "$CSC_KEY_PASSWORD" "$TMP_KC" >/dev/null 2>&1 || true

IDENTITY="$(security find-identity -v -p codesigning "$TMP_KC" | grep "Developer ID Application" || true)"
if [ -z "$IDENTITY" ]; then
  echo "::error::.p12 imported but no Developer ID Application identity found."
  echo "       Andrea must export 'Developer ID Application: PURA digital S.r.l.' from Keychain."
  security find-identity -v -p codesigning "$TMP_KC" || true
  exit 1
fi

echo "Signing identity OK: $IDENTITY"
