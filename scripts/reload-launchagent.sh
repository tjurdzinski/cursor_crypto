#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.user.btc-floop-cycle"
SRC_PLIST="$ROOT/scripts/$LABEL.plist"
DST_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$ROOT/logs"

if [[ ! -f "$SRC_PLIST" ]]; then
  echo "Brak pliku plist: $SRC_PLIST" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod +x "$ROOT/scripts/run-btc-floop-cycle.sh" "$ROOT/scripts/run-btc-floop-loop.sh"

launchctl bootout "gui/$(id -u)" "$DST_PLIST" 2>/dev/null || true
cp "$SRC_PLIST" "$DST_PLIST"
launchctl bootstrap "gui/$(id -u)" "$DST_PLIST"

echo
echo "Reload zakonczony: $LABEL"
launchctl print "gui/$(id -u)/$LABEL" | grep -E "state =|pid =|last exit code =|program =|path =" || true

echo
echo "Ostatnie wpisy daemon log:"
tail -n 20 "$LOG_DIR/btc-floop-daemon.log" 2>/dev/null || echo "(brak logu)"

echo
echo "Ostatnie wpisy cycle log:"
tail -n 20 "$LOG_DIR/btc-floop-cycle-$(date +%Y%m%d).log" 2>/dev/null || echo "(brak logu dzisiejszego)"
