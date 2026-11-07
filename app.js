const $ = (s) => document.querySelector(s);
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '-');
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const renderStats = (el, rows) => {
  el.innerHTML = rows.map(([k, v, c = '']) => `<div><dt>${k}</dt><dd class="${c}">${v}</dd></div>`).join('');
};

// Tabs
document.querySelectorAll('nav button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button, .tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    $('#' + b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'journal') drawEquity();
  })
);

// Position size
function calcSize() {
  const f = Object.fromEntries([...new FormData($('#sizeForm'))].map(([k, v]) => [k, parseFloat(v)]));
  const riskAmt = (f.balance * f.risk) / 100;
  const perUnit = Math.abs(f.entry - f.stop);
  const units = perUnit ? riskAmt / perUnit : NaN;
  const reward = Math.abs(f.target - f.entry);
  const side = f.stop < f.entry ? 'Long' : 'Short';
  renderStats($('#sizeOut'), [
    ['Direction', side],
    ['Risk amount', fmt(riskAmt)],
    ['Units', fmt(units, 4)],
    ['Position value', fmt(units * f.entry)],
    ['Leverage', fmt((units * f.entry) / f.balance) + 'x'],
    ['R:R', perUnit ? '1 : ' + fmt(reward / perUnit) : '-'],
    ['Profit at target', fmt(units * reward), 'up'],
    ['Breakeven win rate', perUnit ? fmt((perUnit / (perUnit + reward)) * 100, 1) + '%' : '-'],
  ]);
}
$('#sizeForm').addEventListener('input', calcSize);
calcSize();

// Journal
const KEY = 'trading-analyst-trades';
let trades = [];
try { trades = JSON.parse(localStorage.getItem(KEY)) || []; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(trades)); } catch {} };
const pnl = (t) => (t.side === 'short' ? t.entry - t.exit : t.exit - t.entry) * t.size - (t.fees || 0);

function renderJournal() {
  trades.sort((a, b) => a.date.localeCompare(b.date));
  $('#trades').innerHTML = trades
    .map((t, i) => {
      const p = pnl(t);
      return `<tr><td>${esc(t.date)}</td><td>${esc(t.symbol)}</td><td>${t.side}</td><td>${fmt(t.entry, 6)}</td><td>${fmt(t.exit, 6)}</td><td>${fmt(t.size, 6)}</td><td class="${cls(p)}">${fmt(p)}</td><td>${esc(t.notes || '')}</td><td><button data-del="${i}">x</button></td></tr>`;
    })
    .reverse()
    .join('');

  const ps = trades.map(pnl);
  const wins = ps.filter((p) => p > 0), losses = ps.filter((p) => p < 0);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const net = sum(ps), gw = sum(wins), gl = -sum(losses);
  let peak = 0, eq = 0, dd = 0;
  for (const p of ps) { eq += p; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const avgW = wins.length ? gw / wins.length : 0, avgL = losses.length ? gl / losses.length : 0;
  renderStats($('#stats'), [
    ['Trades', ps.length],
    ['Win rate', ps.length ? fmt((wins.length / ps.length) * 100, 1) + '%' : '-'],
    ['Net P/L', fmt(net), cls(net)],
    ['Profit factor', gl ? fmt(gw / gl) : '-'],
    ['Avg win', fmt(avgW), 'up'],
    ['Avg loss', fmt(-avgL), 'down'],
    ['Expectancy', ps.length ? fmt(net / ps.length) : '-', cls(net)],
    ['Max drawdown', fmt(-dd), dd ? 'down' : ''],
  ]);
  drawEquity();
}

function drawEquity() {
  const c = $('#equity');
  if (!c.offsetWidth) return;
  const dpr = devicePixelRatio || 1, w = c.offsetWidth, h = 180;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const pts = [0];
  trades.forEach((t) => pts.push(pts.at(-1) + pnl(t)));
  if (pts.length < 2) { g.fillStyle = '#8b93a3'; g.fillText('Equity curve appears after the first trade', 12, h / 2); return; }
  const min = Math.min(...pts), max = Math.max(...pts), pad = 12;
  const x = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  g.strokeStyle = '#2a2f3a'; g.beginPath(); g.moveTo(pad, y(0)); g.lineTo(w - pad, y(0)); g.stroke();
  g.strokeStyle = pts.at(-1) >= 0 ? '#22c55e' : '#ef4444'; g.lineWidth = 2; g.beginPath();
  pts.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.stroke();
}

$('#tradeForm').date.valueAsDate = new Date();
$('#tradeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  ['entry', 'exit', 'size', 'fees'].forEach((k) => (d[k] = parseFloat(d[k]) || 0));
  trades.push(d);
  save(); renderJournal();
  e.target.reset(); e.target.date.valueAsDate = new Date();
});
$('#trades').addEventListener('click', (e) => {
  const i = e.target.dataset.del;
  if (i === undefined) return;
  trades.splice(+i, 1);
  save(); renderJournal();
});

const COLS = ['date', 'symbol', 'side', 'entry', 'exit', 'size', 'fees', 'notes'];
$('#exportCsv').addEventListener('click', () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [COLS.join(','), ...trades.map((t) => COLS.map((k) => q(t[k])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'trades.csv'; a.click();
});
$('#importCsv').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const lines = (await file.text()).trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    const v = [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
    const t = Object.fromEntries(COLS.map((k, i) => [k, v[i] ?? '']));
    ['entry', 'exit', 'size', 'fees'].forEach((k) => (t[k] = parseFloat(t[k]) || 0));
    if (t.date && t.symbol) trades.push(t);
  }
  save(); renderJournal(); e.target.value = '';
});
renderJournal();

// Indicators
const sma = (a, n) => (a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : NaN);
function ema(a, n) {
  if (a.length < n) return NaN;
  const k = 2 / (n + 1);
  let e = sma(a.slice(0, n), n);
  for (let i = n; i < a.length; i++) e = a[i] * k + e * (1 - k);
  return e;
}
function rsi(a, n) {
  if (a.length <= n) return NaN;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; d > 0 ? (gain += d) : (loss -= d); }
  gain /= n; loss /= n;
  for (let i = n + 1; i < a.length; i++) {
    const d = a[i] - a[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}
function calcInd() {
  const f = $('#indForm');
  const p = f.prices.value.split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const last = p.at(-1), s = sma(p, +f.sma.value), e = ema(p, +f.ema.value), r = rsi(p, +f.rsi.value);
  const chg = p.length > 1 ? ((last - p[0]) / p[0]) * 100 : NaN;
  const trend = !Number.isFinite(s) ? '-' : last > s && last > e ? 'Uptrend' : last < s && last < e ? 'Downtrend' : 'Mixed';
  const rsiRead = r >= 70 ? 'Overbought' : r <= 30 ? 'Oversold' : Number.isFinite(r) ? 'Neutral' : '-';
  renderStats($('#indOut'), [
    ['Bars', p.length],
    ['Last', fmt(last, 6)],
    ['Change', fmt(chg) + '%', cls(chg)],
    [`SMA ${f.sma.value}`, fmt(s, 6)],
    [`EMA ${f.ema.value}`, fmt(e, 6)],
    [`RSI ${f.rsi.value}`, fmt(r, 1)],
    ['RSI read', rsiRead, r >= 70 ? 'down' : r <= 30 ? 'up' : ''],
    ['Trend', trend, trend === 'Uptrend' ? 'up' : trend === 'Downtrend' ? 'down' : ''],
  ]);
}
$('#indForm').addEventListener('input', calcInd);
calcInd();
