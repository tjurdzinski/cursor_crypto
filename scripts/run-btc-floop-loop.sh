#!/usr/bin/env bash
# Uruchamia cykl od razu po starcie, potem co 300 s (od zakonczenia poprzedniego cyklu).
# launchd: RunAtLoad + KeepAlive, bez StartInterval.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CYCLE="$ROOT/scripts/run-btc-floop-cycle.sh"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
DAEMON_LOG="$LOG_DIR/btc-floop-daemon.log"

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") daemon start (pierwszy cykl natychmiast)" >>"$DAEMON_LOG"

while true; do
  if "$CYCLE"; then
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") cykl zakonczony OK" >>"$DAEMON_LOG"
  else
    ec=$?
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") cykl zakonczony kod=$ec (kontynuuje petle)" >>"$DAEMON_LOG"
  fi
  sleep 300
done
