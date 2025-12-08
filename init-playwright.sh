#!/usr/bin/env bash
set -euo pipefail

# Kick off the Playwright-backed Calendar init so you can log in manually once.
# The Flask server must already be running (see start-server.sh).

API_BASE="${API_BASE:-http://127.0.0.1:8080}"
HEADLESS_RAW="${HEADLESS:-false}"
USER_DATA_DIR="${USER_DATA_DIR:-}"

headless_value="$(printf '%s' "$HEADLESS_RAW" | tr '[:upper:]' '[:lower:]')"
if [ "$headless_value" != "true" ]; then
  headless_value="false"
fi

payload='{"headless":'"$headless_value"
if [ -n "$USER_DATA_DIR" ]; then
  payload="$payload"',"user_data_dir":"'"$USER_DATA_DIR"'"'
fi
payload="$payload"'}'

echo "Calling $API_BASE/api/calendar/init (headless=$headless_value)..."
curl -f -s -X POST "$API_BASE/api/calendar/init" \
  -H "Content-Type: application/json" \
  -d "$payload"
echo

chromium_path=$(./flask-server/.venv/Scripts/python.exe - <<'PY'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    print(p.chromium.executable_path)
PY
)
echo "CHROME_EXECUTABLE=\"$chromium_path\"" > ./flask-server/.env