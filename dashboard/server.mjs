#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import express from 'express';
import { RestClientV5 } from 'bybit-api';
import { loadBybitConfig } from './lib/bybit-config.mjs';
import { getDb, listRuns, getRun } from './lib/db.mjs';
import { slimPositionList } from './lib/slim-positions.mjs';
import { runRetention } from './retention.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIST = path.join(__dirname, 'ui-dist');

getDb();

let _client;
function getClient() {
  if (_client) return _client;
  const cfg = loadBybitConfig();
  _client = new RestClientV5({
    key: cfg.key,
    secret: cfg.secret,
    testnet: cfg.testnet,
  });
  return _client;
}

async function fetchAccountSnapshot() {
  const client = getClient();
  const [wallet, pos] = await Promise.all([
    client.getWalletBalance({ accountType: 'UNIFIED', coin: 'USDT' }),
    client.getPositionInfo({ category: 'linear', settleCoin: 'USDT' }),
  ]);
  const list = pos?.result?.list || [];
  const open = slimPositionList(list);
  return {
    wallet,
    positions_linear_usdt: open,
    fetched_at: new Date().toISOString(),
  };
}

const app = express();
app.disable('x-powered-by');

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/account', async (_req, res) => {
  try {
    const data = await fetchAccountSnapshot();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/runs', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 80;
    const rows = listRuns(limit);
    res.json({ runs: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/runs/:id', (req, res) => {
  try {
    const row = getRun(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    let raw = '';
    try {
      if (row.raw_log_path && fs.existsSync(row.raw_log_path)) {
        raw = fs.readFileSync(row.raw_log_path, 'utf8');
      }
    } catch (_) {
      raw = '(nie można odczytać pliku logu)';
    }
    let report = null;
    try {
      report = row.report_json ? JSON.parse(row.report_json) : null;
    } catch (_) {
      report = null;
    }
    const db = getDb();
    const decisions = db.prepare(`SELECT * FROM decisions WHERE run_id = ? ORDER BY id`).all(req.params.id);
    res.json({ ...row, report, decisions, raw_log: raw });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.use(express.static(UI_DIST, { index: false }));

app.get('*', (_req, res) => {
  const index = path.join(UI_DIST, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(503).type('text').send('Brak zbudowanego UI (uruchom npm run build w dashboard/ui).');
});

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`dashboard http://${HOST}:${PORT}`);
  try {
    runRetention();
  } catch (e) {
    console.error('retention:', e);
  }
  setInterval(() => {
    try {
      runRetention();
    } catch (e) {
      console.error('retention:', e);
    }
  }, 24 * 60 * 60 * 1000);
});
