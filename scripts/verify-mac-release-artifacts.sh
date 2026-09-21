#!/usr/bin/env bash
# Verify macOS release artifacts before uploading to GitHub Releases.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
PRODUCT_NAME="Aiden"
VERSION="$(node -pe "require('$PROJECT_ROOT/package.json').version")"

required_zip() {
  local arch="$1"
  local pattern="$RELEASE_DIR/${PRODUCT_NAME}-${VERSION}-mac-${arch}.zip"
  local matches=( $pattern )
  if [[ ${#matches[@]} -ne 1 || ! -f "${matches[0]}" ]]; then
    echo "::error::Missing macOS zip for ${arch}: ${pattern}" >&2
    exit 1
  fi
  echo "${matches[0]}"
}

verify_zip_contents() {
  local zip="$1"
  local arch="$2"
  local tmp
  tmp="$(mktemp -d)"
  echo "Verifying ${zip} (${arch})"

  unzip -q "$zip" -d "$tmp"
  local app_path
  app_path="$(find "$tmp" -maxdepth 3 -name '*.app' -print -quit || true)"
  if [[ -z "$app_path" ]]; then
    echo "::error::No .app bundle found inside ${zip}" >&2
    exit 1
  fi

  local resources="$app_path/Contents/Resources"
  local failed=0
  for check in \
    "mcp/gui-operate-server.js" \
    "mcp/software-dev-server-example.js" \
    "node/bin/node" \
    "lima-agent/index.js" \
    "skills"; do
    if [[ -e "$resources/$check" ]]; then
      echo "  OK: $check"
    else
      echo "::error::Missing resource in ${zip}: $check" >&2
      failed=1
    fi
  done

  rm -rf "$tmp"
  if [[ "$failed" -eq 1 ]]; then
    exit 1
  fi
}

echo "Checking release artifacts for ${PRODUCT_NAME} ${VERSION}"

arm64_zip="$(required_zip arm64)"
x64_zip="$(required_zip x64)"

verify_zip_contents "$arm64_zip" arm64
verify_zip_contents "$x64_zip" x64

if [[ ! -f "$RELEASE_DIR/latest-mac.yml" ]]; then
  echo "::error::Missing $RELEASE_DIR/latest-mac.yml" >&2
  exit 1
fi

if ! grep -q "version: ${VERSION}" "$RELEASE_DIR/latest-mac.yml"; then
  echo "::error::latest-mac.yml version mismatch" >&2
  exit 1
fi

if ! grep -q "${PRODUCT_NAME}-${VERSION}-mac-arm64.zip" "$RELEASE_DIR/latest-mac.yml"; then
  echo "::error::latest-mac.yml missing arm64 zip entry" >&2
  exit 1
fi

if ! grep -q "${PRODUCT_NAME}-${VERSION}-mac-x64.zip" "$RELEASE_DIR/latest-mac.yml"; then
  echo "::error::latest-mac.yml missing x64 zip entry" >&2
  exit 1
fi

echo "All macOS release artifacts verified."
