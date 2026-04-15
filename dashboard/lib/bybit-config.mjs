import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Uzupełnia process.env z plików w root repozytorium (npm run dashboard nie ładuje .env.cron sam).
 * Nie nadpisuje istniejących, niepustych wartości.
 */
function applyEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    const cur = process.env[name];
    if (cur != null && String(cur).length > 0) continue;
    process.env[name] = val;
  }
}

function hydrateRepoEnv() {
  applyEnvFile(path.join(REPO_ROOT, '.env'));
  applyEnvFile(path.join(REPO_ROOT, '.env.cron'));
}

export function loadBybitConfig() {
  hydrateRepoEnv();

  const key = process.env.BYBIT_API_KEY?.trim();
  const secret = process.env.BYBIT_API_SECRET?.trim();
  const env = process.env.BYBIT_ENVIRONMENT || 'mainnet';
  if (key && secret) {
    return { key, secret, testnet: env !== 'mainnet' };
  }

  const mcpPath = path.join(REPO_ROOT, '.cursor/mcp.json');
  if (!fs.existsSync(mcpPath)) {
    throw new Error(
      'Brak BYBIT_API_KEY / BYBIT_API_SECRET. Dodaj je do ENV albo do plików .env / .env.cron w katalogu głównym repozytorium (obok compose / przed npm run dashboard).',
    );
  }
  const j = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  const e = j.mcpServers?.bybit?.env;
  if (!e?.BYBIT_API_KEY || !e?.BYBIT_API_SECRET) {
    throw new Error(
      'Brak kluczy Bybit: nie ma ich w ENV / .env / .env.cron, a w .cursor/mcp.json brak mcpServers.bybit.env.',
    );
  }
  return {
    key: e.BYBIT_API_KEY,
    secret: e.BYBIT_API_SECRET,
    testnet: e.BYBIT_ENVIRONMENT !== 'mainnet',
  };
}
