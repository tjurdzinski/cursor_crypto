import { useCallback, useEffect, useMemo, useState } from 'react';

type RunRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  report_preview: string | null;
  ingest_note: string | null;
  raw_log_path: string;
};

type RunDetail = RunRow & {
  report: Record<string, unknown> | null;
  decisions: { id: number; symbol: string | null; action: string | null; summary: string | null; detail_json: string | null }[];
  raw_log: string;
};

function pickUsdtWallet(account: Record<string, unknown> | null) {
  if (!account?.wallet) return null;
  const w = account.wallet as { result?: { list?: unknown[] } };
  const list = w.result?.list;
  if (!Array.isArray(list) || !list[0]) return null;
  const row = list[0] as { totalEquity?: string; coin?: { coin: string; walletBalance?: string; equity?: string }[] };
  const usdt = row.coin?.find((c) => c.coin === 'USDT');
  return { totalEquity: row.totalEquity, usdt };
}

export default function App() {
  const [tab, setTab] = useState<'account' | 'runs'>('account');
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [accErr, setAccErr] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runsErr, setRunsErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refreshAccount = useCallback(async () => {
    setAccErr(null);
    try {
      const r = await fetch('/api/account');
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error?: string }).error || r.statusText);
      setAccount(j as Record<string, unknown>);
    } catch (e) {
      setAccErr(String((e as Error).message));
      setAccount(null);
    }
  }, []);

  const refreshRuns = useCallback(async () => {
    setRunsErr(null);
    try {
      const r = await fetch('/api/runs?limit=100');
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error?: string }).error || r.statusText);
      setRuns((j as { runs: RunRow[] }).runs || []);
    } catch (e) {
      setRunsErr(String((e as Error).message));
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    void refreshAccount();
    void refreshRuns();
  }, [refreshAccount, refreshRuns, tick]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const openDetail = async (id: string) => {
    setDetailErr(null);
    setDetail(null);
    try {
      const r = await fetch(`/api/runs/${encodeURIComponent(id)}`);
      const j = await r.json();
      if (!r.ok) throw new Error((j as { error?: string }).error || r.statusText);
      setDetail(j as RunDetail);
    } catch (e) {
      setDetailErr(String((e as Error).message));
    }
  };

  const positions = useMemo(() => {
    if (!account?.positions_linear_usdt) return [];
    return account.positions_linear_usdt as Record<string, unknown>[];
  }, [account]);

  const decisionColumns = useMemo(() => {
    if (!detail?.decisions?.length) return ['symbol', 'action', 'summary'];
    const keys = new Set<string>();
    for (const d of detail.decisions) {
      keys.add('symbol');
      keys.add('action');
      keys.add('summary');
      if (d.detail_json) {
        try {
          const o = JSON.parse(d.detail_json) as Record<string, unknown>;
          for (const k of Object.keys(o)) keys.add(k);
        } catch {
          /* ignore */
        }
      }
    }
    return [...keys];
  }, [detail]);

  const walletBits = pickUsdtWallet(account);

  return (
    <div className="app-shell">
      <div className="crt-vignette" aria-hidden />
      <header className="pip-header">
        <h1>
          VAULT-TEC TACTICAL TERMINAL <span className="blink">▮</span>
        </h1>
        <div className="tabs">
          <button type="button" className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>
            Konto
          </button>
          <button type="button" className={tab === 'runs' ? 'active' : ''} onClick={() => setTab('runs')}>
            Cron / logi
          </button>
        </div>
        <button type="button" className="tabs" onClick={() => setTick((t) => t + 1)}>
          ⟳ ODŚWIEŻ
        </button>
      </header>

      <main>
        {tab === 'account' && (
          <>
            <section className="panel">
              <h2>Stan konta Bybit (linear USDT)</h2>
              {accErr && <p className="err">{accErr}</p>}
              {walletBits && (
                <div className="stat-grid">
                  <div className="stat">
                    <div className="k">TOTAL EQUITY (API)</div>
                    <div className="v">{walletBits.totalEquity ?? '—'}</div>
                  </div>
                  <div className="stat">
                    <div className="k">USDT WALLET</div>
                    <div className="v">{walletBits.usdt?.walletBalance ?? '—'}</div>
                  </div>
                  <div className="stat">
                    <div className="k">USDT EQUITY</div>
                    <div className="v">{walletBits.usdt?.equity ?? '—'}</div>
                  </div>
                  <div className="stat">
                    <div className="k">ODŚWIEŻENIE</div>
                    <div className="v">{(account?.fetched_at as string) || '—'}</div>
                  </div>
                </div>
              )}
              <p className="mono" style={{ marginTop: '0.75rem', opacity: 0.85 }}>
                Pozycje: przycięte pole API; kolejność: symbol → unrealisedPnl (+ % vs positionValue) → mark/avg →
                TP/SL → reszta. % PnL: unrealisedPnl / positionIM (fallback positionIMByMp). Badge SECURED: LONG →
                SL &lt; avg; SHORT → SL &gt; avg.
              </p>
            </section>
            <section className="panel">
              <h2>Otwarte pozycje</h2>
              {!positions.length && <p className="mono">Brak otwartych pozycji linear USDT (size &gt; 0).</p>}
              {!!positions.length && (
                <DynamicPositionTable rows={positions} />
              )}
            </section>
          </>
        )}

        {tab === 'runs' && (
          <section className="panel">
            <h2>Przebiegi agenta (cron)</h2>
            {runsErr && <p className="err">{runsErr}</p>}
            <table className="data">
              <thead>
                <tr>
                  <th>Start</th>
                  <th>Koniec</th>
                  <th>Exit</th>
                  <th>Run ID</th>
                  <th>Ingest</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.started_at}</td>
                    <td className="mono">{r.ended_at || '—'}</td>
                    <td>{r.exit_code ?? '—'}</td>
                    <td className="mono" style={{ maxWidth: 220, wordBreak: 'break-all' }}>
                      {r.id}
                    </td>
                    <td className="mono">{r.ingest_note || 'OK'}</td>
                    <td>
                      <button type="button" className="row-link" onClick={() => void openDetail(r.id)}>
                        LOG / DECYZJE
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>

      {detail && (
        <div
          className="modal-back"
          role="dialog"
          aria-modal
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>RUN {detail.id}</h3>
              <button type="button" className="tabs" onClick={() => setDetail(null)}>
                ZAMKNIJ
              </button>
            </header>
            {detailErr && <p className="err">{detailErr}</p>}
            <section className="panel">
              <h2>Raport (SWING_JSON)</h2>
              <pre className="mono">{detail.report ? JSON.stringify(detail.report, null, 2) : '(brak)'}</pre>
            </section>
            <section className="panel">
              <h2>Decyzje (wiersze z DB — kolumny dynamiczne)</h2>
              <table className="data">
                <thead>
                  <tr>
                    {decisionColumns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.decisions.map((d) => (
                    <tr key={d.id}>
                      {decisionColumns.map((c) => (
                        <td key={c} className="mono">
                          {renderDecisionCell(d, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel">
              <h2>Pełny log wywołania</h2>
              <pre className="mono" style={{ maxHeight: 360, overflow: 'auto' }}>
                {detail.raw_log || '(pusty)'}
              </pre>
            </section>
          </div>
        </div>
      )}

      <footer className="pip-footer">
        NODE / SQLITE / TAILSCALE HTTP — automatyczne odświeżanie co 30 s (konto + lista). Retencja DB: 7 dni (serwer).
      </footer>
    </div>
  );
}

function renderDecisionCell(
  d: { symbol: string | null; action: string | null; summary: string | null; detail_json: string | null },
  col: string,
) {
  if (col === 'symbol') return d.symbol || '—';
  if (col === 'action') return d.action || '—';
  if (col === 'summary') return d.summary || '—';
  if (!d.detail_json) return '—';
  try {
    const o = JSON.parse(d.detail_json) as Record<string, unknown>;
    const v = o[col];
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  } catch {
    return '—';
  }
}

/** Pola pomocnicze z API — tylko do komórek, nie jako osobne kolumny. */
const HIDDEN_POSITION_KEYS = new Set(['unrealisedPnlRoiOnImPct']);

function positionColumnOrder(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  const primary = Object.keys(rows[0]).filter((k) => !HIDDEN_POSITION_KEYS.has(k));
  const seen = new Set(primary);
  const extra = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (HIDDEN_POSITION_KEYS.has(k)) continue;
      if (!seen.has(k)) extra.add(k);
    }
  }
  return [...primary, ...[...extra].sort()];
}

function DynamicPositionTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = useMemo(() => positionColumnOrder(rows), [rows]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="mono">
                  {formatPositionCell(r, c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** LONG (Buy): SL &lt; avg. SHORT (Sell): SL &gt; avg. Brak SL / złych liczb → false. */
function isSecuredStopForSide(row: Record<string, unknown>) {
  const sl = Number(row.stopLoss);
  const avg = Number(row.avgPrice);
  if (!Number.isFinite(sl) || !Number.isFinite(avg) || sl <= 0 || avg <= 0) return false;

  const side = String(row.side ?? '')
    .trim()
    .toLowerCase();
  if (side === 'buy') return sl < avg;
  if (side === 'sell') return sl > avg;
  return false;
}

function securedStopTitle(row: Record<string, unknown>) {
  const side = String(row.side ?? '')
    .trim()
    .toLowerCase();
  if (side === 'buy') return 'LONG: SL poniżej ceny wejścia (avg) — logiczna ochrona';
  if (side === 'sell') return 'SHORT: SL powyżej ceny wejścia (avg) — logiczna ochrona';
  return 'Stop loss ustawiony po właściwej stronie średniej wejścia';
}

function formatPositionCell(row: Record<string, unknown>, col: string) {
  if (col === 'symbol') {
    const sym = formatCell(row.symbol);
    if (isSecuredStopForSide(row)) {
      return (
        <span className="sym-cell">
          <span className="sym-name">{sym}</span>
          <span className="badge-secured" title={securedStopTitle(row)}>
            SECURED
          </span>
        </span>
      );
    }
    return sym;
  }
  if (col === 'unrealisedPnl') {
    return <UnrealisedPnlCell row={row} />;
  }
  return formatCell(row[col]);
}

function UnrealisedPnlCell({ row }: { row: Record<string, unknown> }) {
  const raw = row.unrealisedPnl;
  const label = formatCell(raw);
  const pnl = Number(raw);
  const roi = Number(row.unrealisedPnlRoiOnImPct);
  const tone = Number.isFinite(roi)
    ? roi >= 0
      ? 'pnl-up'
      : 'pnl-down'
    : Number.isFinite(pnl)
      ? pnl >= 0
        ? 'pnl-up'
        : 'pnl-down'
      : '';

  if (!Number.isFinite(roi)) {
    return (
      <strong className={['pnl-strong', tone].filter(Boolean).join(' ')} title="Brak positionIM — nie liczę % ROI">
        {label}
      </strong>
    );
  }

  const pctStr = `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`;
  return (
    <strong
      className={['pnl-strong', tone].filter(Boolean).join(' ')}
      title="Zwrot względem marginesu początkowego (IM), jak przy dźwigni na Bybit"
    >
      {label} <span className="pnl-pct">({pctStr})</span>
    </strong>
  );
}
