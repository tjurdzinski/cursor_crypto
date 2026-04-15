import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function defaultDbPath() {
  const fromEnv = process.env.DASHBOARD_DB_PATH;
  if (fromEnv) return fromEnv;
  const dataDir = path.join(REPO_ROOT, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'dashboard.db');
}

let _db;

export function getDb() {
  if (_db) return _db;
  const file = defaultDbPath();
  _db = new Database(file);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      exit_code INTEGER,
      report_json TEXT,
      ingest_note TEXT,
      raw_log_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      symbol TEXT,
      action TEXT,
      summary TEXT,
      detail_json TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions(symbol);
  `);
}

export function listRuns(limit = 100) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, started_at, ended_at, exit_code, substr(report_json,1,200) as report_preview, ingest_note, raw_log_path
       FROM runs ORDER BY started_at DESC LIMIT ?`,
    )
    .all(Math.min(500, Math.max(1, limit)));
}

export function getRun(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  return row || null;
}

export function insertRunWithDecisions({
  id,
  started_at,
  ended_at,
  exit_code,
  report_json,
  ingest_note,
  raw_log_path,
  decisions,
}) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM decisions WHERE run_id = ?`).run(id);
    db.prepare(
      `INSERT OR REPLACE INTO runs (id, started_at, ended_at, exit_code, report_json, ingest_note, raw_log_path)
       VALUES (@id, @started_at, @ended_at, @exit_code, @report_json, @ingest_note, @raw_log_path)`,
    ).run({
      id,
      started_at,
      ended_at,
      exit_code,
      report_json,
      ingest_note,
      raw_log_path,
    });
    const ins = db.prepare(
      `INSERT INTO decisions (run_id, symbol, action, summary, detail_json) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const d of decisions) {
      ins.run(id, d.symbol ?? null, d.action ?? null, d.summary ?? null, d.detail_json ?? null);
    }
  });
  tx();
}

export function deleteRunsOlderThanDays(days) {
  const db = getDb();
  const n = Math.max(1, Math.min(365, Number(days) || 7));
  const mod = `-${n} days`;
  const rows = db
    .prepare(
      `SELECT id, raw_log_path FROM runs WHERE datetime(started_at) < datetime('now', ?)`,
    )
    .all(mod);
  db.prepare(`DELETE FROM runs WHERE datetime(started_at) < datetime('now', ?)`).run(mod);
  return rows;
}
