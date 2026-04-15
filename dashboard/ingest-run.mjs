#!/usr/bin/env node
/**
 * Wpisuje jeden run crona do SQLite + dopisuje linię do logs/swing-reports.jsonl
 * Args: <run_id> <raw_log_path> <exit_code>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { insertRunWithDecisions } from './lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function parseStartStop(text) {
  let started_at = null;
  let ended_at = null;
  for (const line of text.split(/\r?\n/)) {
    const s = line.match(/^START=(.+)$/);
    if (s) started_at = s[1].trim();
    const e = line.match(/^STOP=(.+)$/);
    if (e) ended_at = e[1].trim();
  }
  return { started_at, ended_at };
}

function extractSwingJson(text) {
  const lines = text.split(/\r?\n/);
  let last = null;
  for (const line of lines) {
    const m = line.match(/^SWING_JSON\s+(.+)$/);
    if (m) last = m[1].trim();
  }
  if (!last) return { report: null, error: 'brak linii SWING_JSON' };
  try {
    return { report: JSON.parse(last), error: null };
  } catch (e) {
    return { report: null, error: `JSON parse: ${e.message}` };
  }
}

function normalizeDecisions(report) {
  if (!report || !Array.isArray(report.decisions)) return [];
  return report.decisions.map((d) => ({
    symbol: d.symbol ?? null,
    action: d.action ?? null,
    summary: d.summary ?? d.note ?? null,
    detail_json: typeof d === 'object' && d !== null ? JSON.stringify(d) : null,
  }));
}

function appendJsonl(runId, payload) {
  const dir = path.join(REPO_ROOT, 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'swing-reports.jsonl');
  fs.appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), run_id: runId, ...payload }) + '\n', 'utf8');
}

async function main() {
  const [runId, logPath, exitCodeRaw] = process.argv.slice(2);
  if (!runId || !logPath) {
    console.error('usage: ingest-run.mjs <run_id> <raw_log_path> [exit_code]');
    process.exit(1);
  }
  const exit_code = exitCodeRaw != null ? parseInt(exitCodeRaw, 10) : null;
  const text = fs.readFileSync(logPath, 'utf8');
  const { started_at, ended_at } = parseStartStop(text);
  const { report, error } = extractSwingJson(text);
  const report_json = report ? JSON.stringify(report) : null;
  const ingest_note = error || null;
  const decisions = normalizeDecisions(report);

  try {
    insertRunWithDecisions({
      id: runId,
      started_at: started_at || new Date().toISOString(),
      ended_at: ended_at || null,
      exit_code: Number.isFinite(exit_code) ? exit_code : null,
      report_json,
      ingest_note,
      raw_log_path: path.isAbsolute(logPath) ? logPath : path.resolve(logPath),
      decisions,
    });
  } catch (e) {
    console.error('ingest DB:', e);
    process.exitCode = 1;
  }

  try {
    appendJsonl(runId, {
      started_at,
      ended_at,
      exit_code,
      ingest_ok: !error,
      ingest_note: error,
      report_summary: report?.summary ?? report?.headline ?? null,
    });
  } catch (e) {
    console.error('ingest jsonl:', e);
  }
}

await main();
