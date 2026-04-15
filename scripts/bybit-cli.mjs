#!/usr/bin/env node
/**
 * Bybit REST V5 CLI — te same klucze co w .cursor/mcp.json (lub zmienne środowiskowe).
 * Obejście problemów serializacji Cursor → MCP.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RestClientV5 } from 'bybit-api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadConfig() {
  const key = process.env.BYBIT_API_KEY;
  const secret = process.env.BYBIT_API_SECRET;
  const env = process.env.BYBIT_ENVIRONMENT || 'mainnet';
  if (key && secret) {
    return { key, secret, testnet: env !== 'mainnet' };
  }
  const mcpPath = path.join(ROOT, '.cursor/mcp.json');
  if (!fs.existsSync(mcpPath)) {
    console.error('Ustaw BYBIT_API_KEY / BYBIT_API_SECRET albo dodaj .cursor/mcp.json z bybit.env');
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  const e = j.mcpServers?.bybit?.env;
  if (!e?.BYBIT_API_KEY || !e?.BYBIT_API_SECRET) {
    console.error('Brak BYBIT_API_KEY / BYBIT_API_SECRET w mcp.json → mcpServers.bybit.env');
    process.exit(1);
  }
  return {
    key: e.BYBIT_API_KEY,
    secret: e.BYBIT_API_SECRET,
    testnet: e.BYBIT_ENVIRONMENT !== 'mainnet',
  };
}

function out(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function decimalsFromStep(step) {
  const s = String(step);
  if (!s.includes('.')) return 0;
  return s.split('.')[1].replace(/0+$/, '').length;
}

function floorToStep(value, step) {
  const v = Number(value);
  const st = Number(step);
  if (!Number.isFinite(v) || !Number.isFinite(st) || st <= 0) return NaN;
  const floored = Math.floor(v / st) * st;
  const d = decimalsFromStep(step);
  return Number(floored.toFixed(d));
}

/** Okno UTC: env BYBIT_TRADE_WINDOW_UTC lub pierwsza linia .cursor/trade-window.txt, format HH:MM-HH:MM */
function loadUtcWindow() {
  const env = process.env.BYBIT_TRADE_WINDOW_UTC?.trim();
  const filePath = path.join(ROOT, '.cursor', 'trade-window.txt');
  let line = env || '';
  if (!line && fs.existsSync(filePath)) {
    line = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).find((l) => l && !l.startsWith('#')) || '';
  }
  if (!line) return null;
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(line);
  if (!m) {
    console.error('Zły format okna czasu. Użyj HH:MM-HH:MM UTC, np. 08:00-22:00');
    process.exit(1);
  }
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return { start, end, raw: line, overnight: start > end };
}

function assertExecuteAllowed(execute) {
  if (!execute) return;
  if (process.argv.includes('--bypass-hours')) return;
  const w = loadUtcWindow();
  if (!w) return;
  const d = new Date();
  const cur = d.getUTCHours() * 60 + d.getUTCMinutes();
  let ok;
  if (!w.overnight) ok = cur >= w.start && cur < w.end;
  else ok = cur >= w.start || cur < w.end;
  if (!ok) {
    console.error(
      `bybit-cli: poza oknem handlu UTC (${w.raw}). Ustaw BYBIT_TRADE_WINDOW_UTC lub .cursor/trade-window.txt, albo użyj --bypass-hours.`,
    );
    process.exit(1);
  }
}

function auditWrite(cmdName, requestPayload, response) {
  try {
    const logDir = path.join(ROOT, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const file = path.join(logDir, `trade-audit-${day}.jsonl`);
    const row = {
      ts: new Date().toISOString(),
      cmd: cmdName,
      request: requestPayload,
      retCode: response?.retCode,
      retMsg: response?.retMsg,
      orderId: response?.result?.orderId,
      orderLinkId: response?.result?.orderLinkId,
    };
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
  } catch (e) {
    console.error('audit log:', e.message);
  }
}

/** Pozycyjne argumenty + --execute + --bypass-hours + --klucz wartosc / --klucz=wartosc */
function parseCli(argv) {
  const pos = [];
  let execute = false;
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--execute') {
      execute = true;
      continue;
    }
    if (x === '--bypass-hours') {
      opts['bypass-hours'] = true;
      continue;
    }
    if (x.startsWith('--')) {
      let key = x.slice(2);
      let val = true;
      const eq = key.indexOf('=');
      if (eq >= 0) {
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        val = argv[++i];
      }
      opts[key] = val;
      continue;
    }
    pos.push(x);
  }
  return { pos, execute, opts };
}

function stripExecFlags(argv) {
  const a = [];
  let execute = false;
  for (const x of argv) {
    if (x === '--execute') execute = true;
    else if (x === '--bypass-hours') continue;
    else a.push(x);
  }
  return { pos: a, execute };
}

const cfg = loadConfig();
const client = new RestClientV5({
  key: cfg.key,
  secret: cfg.secret,
  testnet: cfg.testnet,
});

const [, , cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case 'wallet-balance': {
      const accountType = args[0] || 'UNIFIED';
      const coin = args[1];
      const r = await client.getWalletBalance({
        accountType,
        ...(coin ? { coin } : {}),
      });
      out(r);
      break;
    }
    case 'positions': {
      const category = args[0];
      const symbol = args[1];
      if (!category) {
        console.error('usage: positions <linear|spot|inverse|option> [symbol]');
        process.exit(1);
      }
      const r = await client.getPositionInfo({ category, symbol });
      out(r);
      break;
    }
    case 'open-orders': {
      const category = args[0];
      const symbol = args[1];
      const limit = args[2] ? parseInt(args[2], 10) : 50;
      if (!category) {
        console.error('usage: open-orders <category> [symbol] [limit]');
        process.exit(1);
      }
      const r = await client.getActiveOrders({ category, symbol, limit });
      out(r);
      break;
    }
    case 'order-history': {
      const category = args[0];
      const symbol = args[1];
      const limit = args[2] ? parseInt(args[2], 10) : 20;
      if (!category) {
        console.error('usage: order-history <category> [symbol] [limit]');
        process.exit(1);
      }
      const r = await client.getHistoricOrders({ category, symbol, limit });
      out(r);
      break;
    }
    case 'symbol-meta': {
      const category = args[0] || 'linear';
      const symbol = args[1];
      if (!symbol) {
        console.error('usage: symbol-meta [linear] <symbol>');
        process.exit(1);
      }
      const info = await client.getInstrumentsInfo({ category, symbol });
      const ticker = await client.getTickers({ category, symbol });
      out({
        instrument: info?.result?.list?.[0] ?? null,
        ticker: ticker?.result?.list?.[0] ?? null,
      });
      break;
    }
    case 'calc-size': {
      const { pos, opts } = parseCli(args);
      const [symbol] = pos;
      if (!symbol) {
        console.error(
          'usage: calc-size <symbol> [--category linear] [--equity-pct 0.20] [--max-leverage 100] [--price 0.09456]',
        );
        process.exit(1);
      }
      const category = String(opts.category || 'linear');
      const equityPct = Number(opts['equity-pct'] ?? 0.2);
      const maxLev = Number(opts['max-leverage'] ?? 100);
      const priceOverride = opts.price != null ? Number(opts.price) : null;
      if (!(equityPct > 0 && equityPct <= 1)) {
        console.error('--equity-pct musi być z zakresu (0,1], np. 0.2');
        process.exit(1);
      }
      const wallet = await client.getWalletBalance({ accountType: 'UNIFIED', coin: 'USDT' });
      const usdt = wallet?.result?.list?.[0]?.coin?.find((c) => c.coin === 'USDT');
      const equity = Number(usdt?.walletBalance ?? 0);
      if (!(equity > 0)) {
        console.error('Nie udało się odczytać walletBalance USDT');
        process.exit(1);
      }
      const infoResp = await client.getInstrumentsInfo({ category, symbol });
      const inst = infoResp?.result?.list?.[0];
      if (!inst) {
        console.error(`Brak instrumentu ${symbol} (${category})`);
        process.exit(1);
      }
      const tickerResp = await client.getTickers({ category, symbol });
      const ticker = tickerResp?.result?.list?.[0];
      const price = priceOverride && priceOverride > 0 ? priceOverride : Number(ticker?.ask1Price || ticker?.lastPrice);
      if (!(price > 0)) {
        console.error('Nie udało się ustalić ceny (podaj --price)');
        process.exit(1);
      }

      const exchMaxLev = Number(inst?.leverageFilter?.maxLeverage || maxLev);
      const lEff = Math.min(maxLev, exchMaxLev);
      const notional = equity * equityPct * lEff;
      const rawQty = notional / price;

      const qtyStep = Number(inst?.lotSizeFilter?.qtyStep || 0);
      const minQty = Number(inst?.lotSizeFilter?.minOrderQty || 0);
      const minNotional = Number(inst?.lotSizeFilter?.minNotionalValue || 0);
      const tickSize = Number(inst?.priceFilter?.tickSize || 0);

      const qtyRounded = qtyStep > 0 ? floorToStep(rawQty, qtyStep) : rawQty;
      const qtyFinal = qtyRounded;
      const orderValue = qtyFinal * price;

      out({
        symbol,
        category,
        equityUSDT: equity,
        equityPct,
        exchangeMaxLeverage: exchMaxLev,
        maxLeverageCap: maxLev,
        lEff,
        priceUsed: price,
        tickSize,
        qtyStep,
        minQty,
        minNotional,
        rawQty,
        qtyRounded: qtyFinal,
        orderValueUSDT: orderValue,
        validByMinQty: qtyFinal >= minQty,
        validByMinNotional: orderValue >= minNotional,
      });
      break;
    }
    case 'close-position': {
      const { pos, execute, opts } = parseCli(args);
      const [category, symbol] = pos;
      if (!category || !symbol) {
        console.error(
          'usage: close-position <category> <symbol> [--qty N] [--execute] [--bypass-hours]\n' +
            '  Zamyka przez Market reduceOnly (domyślnie cała pozycja).',
        );
        process.exit(1);
      }
      const pinfo = await client.getPositionInfo({ category, symbol });
      const list = pinfo?.result?.list || [];
      const row = list.find((p) => Number(p.size) > 0);
      if (!row) {
        console.error('Brak otwartej pozycji (size=0).');
        process.exit(1);
      }
      const maxSz = Number(row.size);
      const infoResp = await client.getInstrumentsInfo({ category, symbol });
      const inst = infoResp?.result?.list?.[0];
      const qtyStep = Number(inst?.lotSizeFilter?.qtyStep || 1);
      let qtyWant =
        opts.qty != null && opts.qty !== true ? Number(opts.qty) : maxSz;
      if (!Number.isFinite(qtyWant) || qtyWant <= 0) {
        console.error('Niepoprawna --qty');
        process.exit(1);
      }
      if (qtyWant > maxSz) qtyWant = maxSz;
      const qtyFinal = qtyStep > 0 ? floorToStep(qtyWant, qtyStep) : qtyWant;
      if (!(qtyFinal > 0)) {
        console.error('qty po zaokrągleniu = 0');
        process.exit(1);
      }
      const closeSide = row.side === 'Buy' ? 'Sell' : 'Buy';
      const body = {
        category,
        symbol,
        side: closeSide,
        orderType: 'Market',
        qty: String(qtyFinal),
        reduceOnly: true,
      };
      if (!execute) {
        console.error('[dry-run] close-position submitOrder:', JSON.stringify(body));
        process.exit(0);
      }
      assertExecuteAllowed(true);
      const res = await client.submitOrder(body);
      auditWrite('close-position', body, res);
      out(res);
      break;
    }
    case 'set-leverage': {
      const { pos, execute, opts } = parseCli(args);
      const [category, symbol, lev] = pos;
      const L = lev ?? opts.leverage;
      if (!category || !symbol || !L) {
        console.error(
          'usage: set-leverage <linear|inverse> <symbol> <leverage> [--execute]\n' +
            '  np. set-leverage linear DOGEUSDT 75 --execute',
        );
        process.exit(1);
      }
      const body = {
        category,
        symbol,
        buyLeverage: String(L),
        sellLeverage: String(L),
      };
      if (!execute) {
        console.error('[dry-run] setLeverage:', JSON.stringify(body));
        process.exit(0);
      }
      assertExecuteAllowed(true);
      const res = await client.setLeverage(body);
      auditWrite('set-leverage', body, res);
      out(res);
      break;
    }
    case 'trading-stop': {
      const { pos, execute, opts } = parseCli(args);
      const [category, symbol] = pos;
      const positionIdx = opts['position-idx'] != null ? Number(opts['position-idx']) : 0;
      if (!category || !symbol) {
        console.error(
          'usage: trading-stop <category> <symbol> [--position-idx 0] [--tp P] [--sl P] [--trail T] [--tp-trigger LastPrice] [--sl-trigger LastPrice] [--execute]\n' +
            '  Ustawia TP/SL/trailing na pozycji (v5/position/trading-stop). One-way: position-idx 0.',
        );
        process.exit(1);
      }
      const tp = opts.tp != null && opts.tp !== true ? String(opts.tp) : '';
      const sl = opts.sl != null && opts.sl !== true ? String(opts.sl) : '';
      const trail =
        opts.trail != null && opts.trail !== true ? String(opts.trail) : '';
      if (!tp && !sl && !trail) {
        console.error('Podaj przynajmniej --tp, --sl lub --trail (z wartością)');
        process.exit(1);
      }
      const body = {
        category,
        symbol,
        positionIdx,
        ...(tp ? { takeProfit: tp } : {}),
        ...(sl ? { stopLoss: sl } : {}),
        ...(trail ? { trailingStop: trail } : {}),
        ...(opts['tp-trigger'] ? { tpTriggerBy: String(opts['tp-trigger']) } : {}),
        ...(opts['sl-trigger'] ? { slTriggerBy: String(opts['sl-trigger']) } : {}),
      };
      if (!execute) {
        console.error('[dry-run] setTradingStop:', JSON.stringify(body));
        process.exit(0);
      }
      assertExecuteAllowed(true);
      const res = await client.setTradingStop(body);
      auditWrite('trading-stop', body, res);
      out(res);
      break;
    }
    case 'amend': {
      const { pos, execute, opts } = parseCli(args);
      const [category, symbol, orderId] = pos;
      if (!category || !symbol || !orderId) {
        console.error(
          'usage: amend <category> <symbol> <orderId> [--price P] [--qty Q] [--trigger T] [--tp P] [--sl P] [--execute]\n' +
            '  Modyfikuje otwarte zlecenie (np. cena limitu, trigger TP/SL na zleceniu warunkowym).',
        );
        process.exit(1);
      }
      const body = {
        category,
        symbol,
        orderId,
        ...(opts.price != null && opts.price !== true ? { price: String(opts.price) } : {}),
        ...(opts.qty != null && opts.qty !== true ? { qty: String(opts.qty) } : {}),
        ...(opts.trigger != null && opts.trigger !== true
          ? { triggerPrice: String(opts.trigger) }
          : {}),
        ...(opts.tp != null && opts.tp !== true ? { takeProfit: String(opts.tp) } : {}),
        ...(opts.sl != null && opts.sl !== true ? { stopLoss: String(opts.sl) } : {}),
      };
      if (Object.keys(body).length <= 3) {
        console.error('Podaj co najmniej jedno: --price, --qty, --trigger, --tp, --sl');
        process.exit(1);
      }
      if (!execute) {
        console.error('[dry-run] amendOrder:', JSON.stringify(body));
        process.exit(0);
      }
      assertExecuteAllowed(true);
      const res = await client.amendOrder(body);
      auditWrite('amend', body, res);
      out(res);
      break;
    }
    case 'submit': {
      const { pos, execute } = stripExecFlags(args);
      const [category, symbol, side, orderType, qty, price] = pos;
      if (!category || !symbol || !side || !orderType || !qty) {
        console.error(
          'usage: submit <category> <symbol> <Buy|Sell> <Market|Limit> <qty> [price] [--execute] [--bypass-hours]',
        );
        console.error('  Dla Limit podaj price. Domyślnie dry-run; --execute wysyła zlecenie.');
        process.exit(1);
      }
      if (orderType === 'Limit' && !price) {
        console.error('Limit wymaga ceny.');
        process.exit(1);
      }
      const body = {
        category,
        symbol,
        side,
        orderType,
        qty: String(qty),
        ...(orderType === 'Limit'
          ? { price: String(price), timeInForce: 'GTC' }
          : {}),
      };
      if (!execute) {
        console.error('[dry-run] submitOrder:', JSON.stringify(body));
        process.exit(0);
      }
      assertExecuteAllowed(true);
      const res = await client.submitOrder(body);
      auditWrite('submit', body, res);
      out(res);
      break;
    }
    case 'cancel': {
      const { pos, execute } = stripExecFlags(args);
      const [category, symbol, orderId] = pos;
      if (!category || !symbol || !orderId) {
        console.error('usage: cancel <category> <symbol> <orderId> [--execute] [--bypass-hours]');
        process.exit(1);
      }
      if (!execute) {
        console.error('[dry-run] cancelOrder:', JSON.stringify({ category, symbol, orderId }));
        process.exit(0);
      }
      assertExecuteAllowed(true);
      const payload = { category, symbol, orderId };
      const res = await client.cancelOrder(payload);
      auditWrite('cancel', payload, res);
      out(res);
      break;
    }
    default:
      console.error(`bybit-cli — Bybit REST v5

Odczyt:
  wallet-balance [UNIFIED] [coin]
  positions <category> [symbol]
  symbol-meta [linear] <symbol>
  calc-size <symbol> [--category linear] [--equity-pct 0.20] [--max-leverage 100] [--price 0.09456]
  open-orders <category> [symbol] [limit]
  order-history <category> [symbol] [limit]

Zlecenia:
  submit <category> <symbol> <Buy|Sell> <Market|Limit> <qty> [price] [--execute] [--bypass-hours]
  cancel <category> <symbol> <orderId> [--execute] [--bypass-hours]
  amend <category> <symbol> <orderId> [--price P] [--qty Q] [--trigger T] [--tp P] [--sl P] [--execute] [--bypass-hours]

Pozycja:
  close-position <category> <symbol> [--qty N] [--execute] [--bypass-hours]
  trading-stop <category> <symbol> [--position-idx 0] [--tp P] [--sl P] [--trail T] [--execute] [--bypass-hours]

Dźwignia:
  set-leverage <linear|inverse> <symbol> <leverage> [--execute] [--bypass-hours]

Audyt: każde --execute zapisuje linię JSON do logs/trade-audit-YYYYMMDD.jsonl

Okno czasu (opcjonalnie, UTC): zmienna BYBIT_TRADE_WINDOW_UTC=08:00-22:00
 lub pierwsza linia .cursor/trade-window.txt — poza oknem --execute jest blokowane (--bypass-hours pomija).

Klucze: BYBIT_API_KEY, BYBIT_API_SECRET, BYBIT_ENVIRONMENT
 lub .cursor/mcp.json → mcpServers.bybit.env
`);
      process.exit(cmd ? 1 : 0);
  }
}

await main();
