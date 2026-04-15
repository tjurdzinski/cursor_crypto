#!/usr/bin/env bash
# Wylacza i usuwa job launchd z ~/Library/LaunchAgents/ (nie chodzi o Launchpad w Docku).
set -euo pipefail

LABEL="com.user.btc-floop-cycle"
DST_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
GUI_DOMAIN="gui/$(id -u)"

if [[ -f "$DST_PLIST" ]]; then
  launchctl bootout "$GUI_DOMAIN" "$DST_PLIST" 2>/dev/null || true
  rm -f "$DST_PLIST"
  echo "Zatrzymano i usunieto: $DST_PLIST"
else
  echo "Brak pliku: $DST_PLIST (probuje bootout po etykiecie)" >&2
  launchctl bootout "$GUI_DOMAIN/$LABEL" 2>/dev/null || true
fi

echo "Gotowe: $LABEL nie jest juz ladowany z LaunchAgents."
