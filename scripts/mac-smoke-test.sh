#!/usr/bin/env bash
# Smoke-test a packaged macOS app directory (release/mac-arm64 or release/mac-x64).
set -euo pipefail

APP_DIR="${1:-}"
MODE="${2:-all}"

if [[ -z "$APP_DIR" ]]; then
  echo "Usage: $0 <release/mac-{arch}> [verify|launch|all]" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "::error::App directory not found: $APP_DIR" >&2
  exit 1
fi

APP_NAME=$(ls "$APP_DIR" | grep '\.app$' | head -1 || true)
if [[ -z "$APP_NAME" ]]; then
  echo "::error::No .app bundle found in $APP_DIR" >&2
  exit 1
fi

RESOURCES="$APP_DIR/$APP_NAME/Contents/Resources"
EXECUTABLE="$APP_DIR/$APP_NAME/Contents/MacOS/$(echo "$APP_NAME" | sed 's/\.app$//')"

verify_resources() {
  echo "Checking resources in: $RESOURCES"
  local failed=0
  for check in \
    "mcp/gui-operate-server.js" \
    "mcp/software-dev-server-example.js" \
    "node/bin/node" \
    "lima-agent/index.js" \
    "skills"; do
    if [[ -e "$RESOURCES/$check" ]]; then
      echo "  OK: $check"
    else
      echo "::error::Missing resource: $check (in $APP_DIR)"
      failed=1
    fi
  done

  if [[ "$failed" -eq 1 ]]; then
    echo "::error::Packaged app is missing critical resources in $APP_DIR"
    exit 1
  fi
  echo "All packaged resources verified for $APP_DIR."
}

launch_smoke_test() {
  echo "Launching: $EXECUTABLE --smoke-test"
  local exit_code=0
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout 30 "$EXECUTABLE" --smoke-test 2>&1 || exit_code=$?
  elif command -v timeout >/dev/null 2>&1; then
    timeout 30 "$EXECUTABLE" --smoke-test 2>&1 || exit_code=$?
  else
    "$EXECUTABLE" --smoke-test 2>&1 &
    local app_pid=$!
    sleep 30
    if kill -0 "$app_pid" 2>/dev/null; then
      kill "$app_pid"
      echo "::error::Launch smoke test timed out after 30s ($APP_DIR)"
      exit 1
    fi
    wait "$app_pid" || exit_code=$?
  fi

  if [[ "$exit_code" -eq 0 ]]; then
    echo "Launch smoke test passed for $APP_DIR"
  else
    echo "::error::Launch smoke test failed for $APP_DIR with exit code ${exit_code}"
    exit 1
  fi
}

case "$MODE" in
  verify)
    verify_resources
    ;;
  launch)
    launch_smoke_test
    ;;
  all)
    verify_resources
    launch_smoke_test
    ;;
  *)
    echo "Unknown mode: $MODE (expected verify, launch, or all)" >&2
    exit 1
    ;;
esac
