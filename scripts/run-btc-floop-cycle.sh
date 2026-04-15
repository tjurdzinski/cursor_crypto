#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROMPT_FILE="$ROOT/scripts/prompt-btc-floop-cycle.txt"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/btc-floop-cycle-$(date +%Y%m%d).log"

if ! command -v agent >/dev/null 2>&1; then
  echo "agent: nie znaleziono w PATH (Cursor Agent CLI)" >&2
  exit 1
fi

PROMPT="$(cat "$PROMPT_FILE")"

AGENT_CMD=(agent --print --trust --approve-mcps --force --workspace "$ROOT")
if [[ -z "${CURSOR_AGENT_MODEL:-}" ]]; then
  echo "UWAGA: CURSOR_AGENT_MODEL puste -> agent moze uzyc trybu Auto i zmieniac modele miedzy cyklami. Ustaw zmienna (np. w LaunchAgent plist)." >>"$LOG_FILE"
fi
if [[ -n "${CURSOR_AGENT_MODEL:-}" ]]; then
  AGENT_CMD+=(--model "$CURSOR_AGENT_MODEL")
fi
AGENT_CMD+=("$PROMPT")

{
  echo "===== $(date -u +"%Y-%m-%dT%H:%M:%SZ") START ====="
  "${AGENT_CMD[@]}"
  echo "===== $(date -u +"%Y-%m-%dT%H:%M:%SZ") END ====="
} >>"$LOG_FILE" 2>&1
