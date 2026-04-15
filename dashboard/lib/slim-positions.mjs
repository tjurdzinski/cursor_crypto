/**
 * Uproszczenie pozycji linear z Bybit pod dashboard (mniej szumu, stała kolejność pól).
 */

/** Pola techniczne / redundantne — ukryte w UI (łatwo rozszerzyć listę). */
const DROP_KEYS = new Set([
  'seq',
  'riskId',
  'sessionAvgPrice',
  'leverageSysUpdatedTime',
  'liqPriceByMp',
  'autoAddMargin',
  // Propozycje dalszego cięcia:
  'bustPrice',
  'positionIdx',
  'mmrSysUpdatedTime',
  'updatedTime',
  'createdTime',
  'tradeMode',
  'tpslMode',
  'isReduceOnly',
  'adlRankIndicator',
  'riskLimitValue',
  'positionMMByMp',
  'positionIMByMp',
  'positionBalance',
  'positionIM',
  'positionMM',
  'positionStatus',
]);

/**
 * Kolejność kolumn: instrument → PnL → ceny → TP/SL → reszta sensowna dla handlu.
 * (Pola, których nie ma w odpowiedzi API, są pomijane.)
 */
const KEY_ORDER = [
  'symbol',
  'unrealisedPnl',
  'markPrice',
  'avgPrice',
  'takeProfit',
  'stopLoss',
  'side',
  'size',
  'leverage',
  'positionValue',
  'liqPrice',
  'breakEvenPrice',
  'trailingStop',
  'cumRealisedPnl',
  'curRealisedPnl',
];

export function slimLinearPosition(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  const used = new Set();

  for (const k of KEY_ORDER) {
    if (DROP_KEYS.has(k)) continue;
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    const v = raw[k];
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
    used.add(k);
  }

  const rest = Object.keys(raw)
    .filter((k) => !used.has(k) && !DROP_KEYS.has(k))
    .sort();
  for (const k of rest) {
    const v = raw[k];
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }

  // ROI vs środki „włożone” (margines początkowy IM), jak w podglądzie Bybit — nie vs notional.
  const pnl = Number(raw.unrealisedPnl);
  let im = Number(raw.positionIM);
  if (!Number.isFinite(im) || im <= 0) im = Number(raw.positionIMByMp);
  if (Number.isFinite(pnl) && Number.isFinite(im) && im > 0) {
    out.unrealisedPnlRoiOnImPct = (pnl / im) * 100;
  }

  return out;
}

export function slimPositionList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => Number(p?.size) > 0).map(slimLinearPosition);
}
