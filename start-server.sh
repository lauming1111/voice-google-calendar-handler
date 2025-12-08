#!/usr/bin/env bash
set -euo pipefail

# Starts the Flask backend; creates the venv and installs deps on first run.
# Usage: ./start-server.sh [--setup] (forces reinstall of deps/playwright)

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/flask-server"
VENV_DIR="$SERVER_DIR/.venv"
FORCE_SETUP=0

for arg in "$@"; do
  case "$arg" in
    --setup|--reinstall) FORCE_SETUP=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  PYTHON_BIN="python"
fi

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ACTIVATE_PATH="$VENV_DIR/Scripts/activate" ;;
  *) ACTIVATE_PATH="$VENV_DIR/bin/activate" ;;
esac

cd "$SERVER_DIR"

FIRST_RUN=0
if [ ! -d "$VENV_DIR" ]; then
  FIRST_RUN=1
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

if [ ! -f "$ACTIVATE_PATH" ]; then
  echo "Cannot find venv activation script at $ACTIVATE_PATH" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ACTIVATE_PATH"

if [ "$FIRST_RUN" -eq 1 ] || [ "$FORCE_SETUP" -eq 1 ]; then
  pip install --upgrade pip
  pip install -r requirements.txt
  playwright install chromium
fi

python server.py
