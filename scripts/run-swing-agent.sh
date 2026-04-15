#!/usr/bin/env bash
# Swing agent pod cron: ubogi PATH, stałe REPO, sekrety z ENV / .env.cron / opcjonalnie mcp.json.
set -euo pipefail
PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${REPO:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$REPO"

ENV_FILE="${SWING_CRON_ENV:-$REPO/.env.cron}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${BYBIT_API_KEY:-}" || -z "${BYBIT_API_SECRET:-}" ]]; then
  MCP_JSON="$REPO/.cursor/mcp.json"
  if [[ -f "$MCP_JSON" ]] && command -v jq >/dev/null 2>&1; then
    BYBIT_API_KEY="${BYBIT_API_KEY:-$(jq -r '.mcpServers.bybit.env.BYBIT_API_KEY // empty' "$MCP_JSON")}"
    BYBIT_API_SECRET="${BYBIT_API_SECRET:-$(jq -r '.mcpServers.bybit.env.BYBIT_API_SECRET // empty' "$MCP_JSON")}"
    _be="$(jq -r '.mcpServers.bybit.env.BYBIT_ENVIRONMENT // empty' "$MCP_JSON")"
    if [[ -n "$_be" ]]; then
      BYBIT_ENVIRONMENT="${BYBIT_ENVIRONMENT:-$_be}"
    fi
  fi
fi

export BYBIT_API_KEY="${BYBIT_API_KEY:?Ustaw BYBIT_API_KEY (np. $REPO/.env.cron lub export przed cronem)}"
export BYBIT_API_SECRET="${BYBIT_API_SECRET:?Ustaw BYBIT_API_SECRET (np. $REPO/.env.cron lub export przed cronem)}"
export BYBIT_ENVIRONMENT="${BYBIT_ENVIRONMENT:-mainnet}"
export CURSOR_CRYPTO_ROOT="$REPO"
export SWING_CRON=1

LOG="$REPO/logs/swing-cron-$(date -u +%Y%m%d).log"
mkdir -p "$REPO/logs"

LOCK="$REPO/logs/swing-agent.cron.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') skip: poprzednia instancja w toku" >>"$LOG"
  exit 0
fi

PROMPT="$(cat "$REPO/prompts/swing-5-assets.txt")"
AGENT="${AGENT:-$HOME/.local/bin/agent}"

RUN_ID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "run-$(date -u +%s)")"
mkdir -p "$REPO/logs/runs"
RUN_LOG="$REPO/logs/runs/${RUN_ID}.log"

set +e
set +o pipefail
(
  echo "START=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  "$AGENT" --print --output-format text --workspace "$REPO" --trust --yolo --approve-mcps "$PROMPT"
  _agent_ec=$?
  echo "STOP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  exit "$_agent_ec"
) 2>&1 | tee -a "$LOG" | tee "$RUN_LOG"
_agent_ec=${PIPESTATUS[0]}
set -euo pipefail

node "$REPO/dashboard/ingest-run.mjs" "$RUN_ID" "$RUN_LOG" "$_agent_ec" || true

exit "$_agent_ec"
