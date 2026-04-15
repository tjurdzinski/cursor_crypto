#!/usr/bin/env bash
# Skopiuj do np. ~/bin/run-swing-agent.sh, uzupełnij ścieżki i uruchom z crona.
set -euo pipefail
REPO="${REPO:-$HOME/cursor_crypto}"
cd "$REPO"

export BYBIT_API_KEY="${BYBIT_API_KEY:?set BYBIT_API_KEY}"
export BYBIT_API_SECRET="${BYBIT_API_SECRET:?set BYBIT_API_SECRET}"
export BYBIT_ENVIRONMENT="${BYBIT_ENVIRONMENT:-mainnet}"

LOG="$REPO/logs/swing-cron-$(date -u +%Y%m%d).log"
mkdir -p "$REPO/logs"

PROMPT="$(cat "$REPO/prompts/swing-5-assets.txt")"
AGENT="${AGENT:-$HOME/.local/bin/agent}"

"$AGENT" --print --output-format text --workspace "$REPO" --trust --yolo --approve-mcps \
  "$PROMPT" >>"$LOG" 2>&1
