#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deleteRunsOlderThanDays } from './lib/db.mjs';

export function runRetention() {
  const days = Number(process.env.DASHBOARD_RETENTION_DAYS || 7);
  const deleted = deleteRunsOlderThanDays(days);
  for (const row of deleted) {
    try {
      if (row.raw_log_path && fs.existsSync(row.raw_log_path)) fs.unlinkSync(row.raw_log_path);
    } catch (e) {
      console.error('unlink', row.raw_log_path, e.message);
    }
  }
  console.log(
    JSON.stringify({ retention_days: days, deleted_rows: deleted.length, ts: new Date().toISOString() }),
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runRetention();
}
