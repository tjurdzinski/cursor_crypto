# cursor_crypto (lokalny katalog roboczy: `cursor_tv`)

Skrypty Bybit (REST v5), patch MCP, skill FLOOP → cykl handlowy.

## Klon na VPS

```bash
git clone git@github.com:tjurdzinski/cursor_crypto.git
cd cursor_crypto
npm ci
```

## Konfiguracja Cursor / MCP

1. Skopiuj szablon MCP (bez sekretów w repo):

   ```bash
   cp .cursor/mcp.json.example .cursor/mcp.json
   ```

2. W `.cursor/mcp.json` ustaw **absolutną** ścieżkę do `tradingview-mcp` oraz `command` do `node` (np. z `which node`).

3. **Bybit:** preferowane są **zmienne środowiska** (`BYBIT_API_KEY`, `BYBIT_API_SECRET`, opcjonalnie `BYBIT_ENVIRONMENT`). Wtedy możesz usunąć lub zostawić placeholdery w `mcp.json` — `scripts/bybit-cli.mjs` i tak najpierw czyta ENV.

4. Opcjonalnie okno handlu UTC: `BYBIT_TRADE_WINDOW_UTC` lub `.cursor/trade-window.txt` (wzorzec: `.cursor/trade-window.example.txt`).

## Cron + agent (headless)

Prompt: `prompts/swing-5-assets.txt`. Przykładowy wrapper: `scripts/run-swing-agent.example.sh` (skopiuj poza repo lub do `~/bin`, nadaj `chmod +x`).

W cronie podaj pełną ścieżkę do `agent` i eksportuj ENV Bybit przed wywołaniem (cron ma ubogi `PATH`).

## Bezpieczeństwo

- Nie commituj `.cursor/mcp.json` z prawdziwymi kluczami (jest w `.gitignore`).
- Nie commituj `logs/` (audyt może zawierać dane zleceń).
