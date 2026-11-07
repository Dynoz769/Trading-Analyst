const $ = (s) => document.querySelector(s);
const num = (v) => (v === '' || v == null ? NaN : Number(v));
const ok = Number.isFinite;
const fmt = (n, d = 2) => (ok(n) ? (Number(n.toFixed(d)) + 0).toLocaleString(undefined, { maximumFractionDigits: d }) : '-');
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const renderStats = (el, rows) => {
  el.innerHTML = rows.map(([k, v, c = '']) => `<div><dt>${k}</dt><dd class="${c}">${v}</dd></div>`).join('');
};

// Tabs
function showTab(id) {
  document.querySelectorAll('nav button, .tab').forEach((x) => x.classList.remove('active'));
  $(`nav button[data-tab="${id}"]`).classList.add('active');
  $('#' + id).classList.add('active');
  if (id === 'journal') drawEquity();
  if (id === 'history') renderHistory();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// Settings
const SET_KEY = 'ta-settings';
const settings = { key: '', model: 'claude-opus-5-5', lang: 'Bahasa Melayu', balance: 1000, sizing: 'lot', lot: 0.01, risk: 1, contract: 100, ...load(SET_KEY, {}) };
const setForm = $('#setForm');
for (const [k, v] of Object.entries(settings)) if (setForm[k]) setForm[k].value = v;
function syncSizing() {
  setForm.lot.disabled = settings.sizing !== 'lot';
  setForm.risk.disabled = settings.sizing === 'lot';
}
syncSizing();
setForm.addEventListener('input', () => {
  for (const el of setForm.elements) if (el.name) settings[el.name] = el.type === 'number' ? num(el.value) : el.value.trim();
  syncSizing();
  store(SET_KEY, settings);
});

// Image input
const MAX_IMG = 4;
let images = []; // { data, thumb }

function loadImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); res(img); };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
function toJpeg(img, max, q) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
async function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/') || images.length >= MAX_IMG) continue;
    try {
      const img = await loadImage(f);
      images.push({ data: toJpeg(img, 1568, 0.9), thumb: toJpeg(img, 360, 0.6) });
    } catch { setStatus('Gambar tidak dapat dibaca: ' + f.name, true); }
  }
  renderThumbs();
}
function renderThumbs() {
  $('#thumbs').innerHTML = images
    .map((im, i) => `<figure><img src="${im.thumb}" alt="Screenshot ${i + 1}"><button type="button" data-rm="${i}" aria-label="Buang">x</button></figure>`)
    .join('');
}
const drop = $('#drop');
drop.addEventListener('click', (e) => {
  if (e.target.dataset.rm !== undefined) { images.splice(+e.target.dataset.rm, 1); renderThumbs(); return; }
  $('#file').click();
});
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
$('#file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { addFiles(files); showTab('analyze'); }
});

// AI analysis
const price = { type: ['number', 'null'] };
const TOOL = {
  name: 'submit_analysis',
  description: 'Hantar analisis chart yang lengkap.',
  input_schema: {
    type: 'object',
    required: ['symbol', 'timeframe', 'current_price', 'bias', 'summary', 'structure', 'key_levels', 'patterns', 'indicators', 'setups', 'risks', 'verdict', 'warnings'],
    properties: {
      symbol: { type: 'string', description: 'Simbol yang kelihatan, atau "?"' },
      timeframe: { type: 'string', description: 'Timeframe yang kelihatan, atau "?"' },
      current_price: price,
      bias: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
      summary: { type: 'string', description: '2-3 ayat: keadaan pasaran sekarang.' },
      structure: { type: 'string', description: 'Struktur pasaran: HH/HL atau LH/LL, BOS, CHoCH, range.' },
      key_levels: {
        type: 'array',
        items: {
          type: 'object',
          required: ['price', 'kind', 'note'],
          properties: {
            price: { type: 'number' },
            kind: { type: 'string', enum: ['support', 'resistance', 'demand', 'supply', 'liquidity', 'fvg', 'order_block', 'pivot'] },
            note: { type: 'string' },
          },
        },
      },
      patterns: { type: 'array', items: { type: 'string' }, description: 'Corak chart dan candlestick yang kelihatan.' },
      indicators: { type: 'array', items: { type: 'string' }, description: 'Bacaan indikator yang kelihatan pada chart. Kosong jika tiada.' },
      setups: {
        type: 'array',
        items: {
          type: 'object',
          required: ['direction', 'primary', 'order_type', 'entry', 'sl', 'tp1', 'tp2', 'tp3', 'confidence', 'trigger', 'reasons', 'sl_reason', 'tp_reason', 'invalidation'],
          properties: {
            direction: { type: 'string', enum: ['buy', 'sell'] },
            primary: { type: 'boolean', description: 'true untuk setup utama.' },
            order_type: { type: 'string', enum: ['market', 'limit', 'stop'] },
            entry: { type: 'number' },
            sl: { type: 'number' },
            tp1: { type: 'number' },
            tp2: price,
            tp3: price,
            confidence: { type: 'integer', minimum: 0, maximum: 100 },
            trigger: { type: 'string', description: 'Apa yang perlu berlaku sebelum masuk.' },
            reasons: { type: 'array', items: { type: 'string' }, description: 'Sebab spesifik daripada chart.' },
            sl_reason: { type: 'string' },
            tp_reason: { type: 'string' },
            invalidation: { type: 'string' },
          },
        },
      },
      risks: { type: 'array', items: { type: 'string' } },
      verdict: { type: 'string', description: 'Keputusan akhir: setup mana diutamakan, atau tunggu.' },
      warnings: { type: 'array', items: { type: 'string' }, description: 'Masalah membaca chart, contoh skala harga kabur.' },
    },
  },
};

const SYSTEM = (lang) => `You are a technical analyst reading trading chart screenshots.

Work only from what is visible: price axis, candles, drawn lines, indicators, labels. Read the price scale carefully. Every price you give must sit on that scale and use the same decimal precision. If the scale is unreadable, say so in warnings and return no setups.

Cover: trend and bias, market structure (HH/HL, LH/LL, BOS, CHoCH, range), support and resistance, supply and demand, liquidity pools, FVG and order blocks when present, chart and candlestick patterns, visible indicator readings. With several screenshots, treat them as timeframes of one symbol and let the higher timeframe set the bias.

Give a buy setup and a sell setup when each has a real basis. Mark the one that fits the bias as primary. Leave a direction out rather than invent one. For each setup:
- entry: order type and price
- sl: beyond a structural level; name the level in sl_reason
- tp1 to tp3: the next levels price is likely to reach; name them in tp_reason
- reasons: concrete observations from the chart, each tied to a price or candle
- trigger, invalidation, confidence 0-100
Buy: sl < entry < tp1 < tp2 < tp3. Sell: sl > entry > tp1 > tp2 > tp3. Aim for tp1 at 1R or more where structure allows.

Write all text fields in ${lang}. Short, specific sentences. No disclaimers, no filler, no generic advice.`;

function setStatus(msg, err) {
  const el = $('#status');
  el.textContent = msg;
  el.className = 'status' + (err ? ' down' : '');
}

async function analyze(meta) {
  const content = images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.data.split(',')[1] } }));
  const lines = [
    `Analyse ${images.length > 1 ? 'these ' + images.length + ' screenshots' : 'this screenshot'}.`,
    meta.symbol && `Symbol: ${meta.symbol}`,
    meta.tf && `Timeframe: ${meta.tf}`,
    `Trading style: ${meta.style}`,
    meta.notes && `Trader notes: ${meta.notes}`,
  ];
  content.push({ type: 'text', text: lines.filter(Boolean).join('\n') });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.key.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 8000,
      system: SYSTEM(settings.lang),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('API key tidak sah. Semak di Tetapan: key mesti bermula sk-ant-api dan dicipta di console.anthropic.com.');
  if (!res.ok) throw new Error(body.error?.message || `HTTP ${res.status}`);
  const out = body.content?.find((c) => c.type === 'tool_use')?.input;
  if (!out) throw new Error('Jawapan AI tiada data analisis.');
  if (body.stop_reason === 'max_tokens') out.warnings = [...(out.warnings || []), 'Jawapan terpotong, sesetengah bahagian mungkin hilang.'];
  return out;
}

$('#askForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!settings.key) { setStatus('Masukkan API key dalam Tetapan dahulu.', true); showTab('settings'); return; }
  if (!images.length) { setStatus('Tambah sekurang-kurangnya satu screenshot.', true); return; }
  const meta = Object.fromEntries(new FormData(e.target));
  const btn = $('#go');
  btn.disabled = true;
  setStatus('Sedang menganalisis chart...');
  $('#result').innerHTML = '';
  try {
    const a = await analyze(meta);
    const entry = { id: Date.now(), at: new Date().toISOString(), model: settings.model, thumbs: images.map((i) => i.thumb), a };
    hist.unshift(entry);
    hist = hist.slice(0, 30);
    while (!store(HIST_KEY, hist) && hist.length > 1) hist.pop();
    setStatus('');
    renderResult(entry);
  } catch (err) {
    setStatus('Gagal: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
});

// Result rendering
const DIR = { buy: 'BUY', sell: 'SELL' };
const BIAS = { bullish: ['Bullish', 'up'], bearish: ['Bearish', 'down'], neutral: ['Neutral', ''] };
const tps = (s) => [s.tp1, s.tp2, s.tp3].filter(ok);

function checkSetup(s) {
  const lv = [s.sl, s.entry, ...tps(s)];
  const sorted = lv.every((v, i) => !i || (s.direction === 'buy' ? v > lv[i - 1] : v < lv[i - 1]));
  return sorted ? '' : 'Susunan SL/entry/TP tidak konsisten dengan arah trade. Semak semula harga.';
}

function sizing(s) {
  const perUnit = Math.abs(s.entry - s.sl);
  let units, riskAmt;
  if (settings.sizing === 'lot') {
    units = settings.lot * settings.contract;
    riskAmt = units * perUnit;
  } else {
    riskAmt = (settings.balance * settings.risk) / 100;
    units = perUnit ? riskAmt / perUnit : NaN;
  }
  return { riskAmt, perUnit, units, lots: units / settings.contract, riskPct: (riskAmt / settings.balance) * 100 };
}
const usd = (n) => (ok(n) ? '$' + fmt(n) : '-');

function ladder(s, cur) {
  const pts = [
    ['SL', s.sl, 'var(--down)'],
    ['Entry', s.entry, 'var(--text)'],
    ...tps(s).map((v, i) => [`TP${i + 1}`, v, 'var(--up)']),
  ];
  if (ok(cur)) pts.push(['Kini', cur, 'var(--accent)']);
  const vals = pts.map((p) => p[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const H = 200, pad = 12;
  const y = (v) => pad + ((hi - v) / (hi - lo || 1)) * (H - pad * 2);
  const zone = (a, b, c) => `<rect x="0" y="${Math.min(y(a), y(b))}" width="60" height="${Math.abs(y(a) - y(b))}" fill="${c}" opacity=".18"/>`;
  const far = tps(s).at(-1);
  return `<svg class="ladder" viewBox="0 0 200 ${H}" role="img" aria-label="Paras harga">
    ${zone(s.entry, s.sl, 'var(--down)')}${ok(far) ? zone(s.entry, far, 'var(--up)') : ''}
    ${pts.map(([l, v, c]) => `<line x1="0" x2="60" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-width="2" ${l === 'Kini' ? 'stroke-dasharray="4 3"' : ''}/>
      <text x="66" y="${y(v) + 4}" fill="${c}">${l} ${fmt(v, 5)}</text>`).join('')}
  </svg>`;
}

function setupCard(s, a, i) {
  const z = sizing(s);
  const warn = checkSetup(s);
  const rows = [['Entry', s.entry, ''], ['SL', s.sl, 'down'], ...tps(s).map((v, k) => [`TP${k + 1}`, v, 'up'])];
  return `<article class="setup ${s.direction}">
    <header>
      <span class="badge ${s.direction === 'buy' ? 'up' : 'down'}">${DIR[s.direction]}</span>
      <span>${esc(s.order_type)}</span>
      ${s.primary ? '<span class="badge">Utama</span>' : ''}
      <span class="conf" title="Keyakinan"><i style="width:${Math.max(0, Math.min(100, s.confidence))}%"></i></span>
      <b>${s.confidence}%</b>
    </header>
    ${warn ? `<p class="warn">${warn}</p>` : ''}
    <div class="setup-body">
      <table class="levels">
        <thead><tr><th></th><th>Harga</th><th>Jarak</th><th>R:R</th></tr></thead>
        <tbody>${rows.map(([l, v, c]) => {
          const d = Math.abs(v - s.entry);
          return `<tr><td>${l}</td><td class="${c}">${fmt(v, 5)}</td><td>${l === 'Entry' ? '' : fmt(d, 5)}</td><td>${c === 'up' && z.perUnit ? '1 : ' + fmt(d / z.perUnit) : ''}</td></tr>`;
        }).join('')}</tbody>
      </table>
      ${ladder(s, a.current_price)}
    </div>
    <dl class="stats small">
      <div><dt>Lot</dt><dd>${fmt(z.lots, 2)}</dd></div>
      <div><dt>Rugi di SL</dt><dd class="down">${usd(z.riskAmt)} <small>(${fmt(z.riskPct)}%)</small></dd></div>
      ${tps(s).map((v, k) => `<div><dt>Untung TP${k + 1}</dt><dd class="up">${usd(z.units * Math.abs(v - s.entry))}</dd></div>`).join('')}
    </dl>
    <h4>Sebab ${DIR[s.direction]}</h4>
    <ul>${(s.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <p><b>Trigger:</b> ${esc(s.trigger)}</p>
    <p><b>Kenapa SL di situ:</b> ${esc(s.sl_reason)}</p>
    <p><b>Kenapa TP di situ:</b> ${esc(s.tp_reason)}</p>
    <p><b>Batal jika:</b> ${esc(s.invalidation)}</p>
    <div class="row">
      <button type="button" data-copy="${i}">Salin</button>
      <button type="button" data-log="${i}">Masuk jurnal</button>
    </div>
  </article>`;
}

let current = null;
function renderResult(entry) {
  current = entry;
  const a = entry.a;
  const [biasTxt, biasCls] = BIAS[a.bias] || ['-', ''];
  const setups = [...(a.setups || [])].sort((x, y) => y.primary - x.primary);
  a.setups = setups;
  const list = (t, arr) => (arr?.length ? `<h3>${t}</h3><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  $('#result').innerHTML = `
    <div class="shots">${entry.thumbs.map((t) => `<img src="${t}" alt="">`).join('')}</div>
    <dl class="stats">
      <div><dt>Simbol</dt><dd>${esc(a.symbol)}</dd></div>
      <div><dt>Timeframe</dt><dd>${esc(a.timeframe)}</dd></div>
      <div><dt>Harga kini</dt><dd>${fmt(a.current_price, 5)}</dd></div>
      <div><dt>Bias</dt><dd class="${biasCls}">${biasTxt}</dd></div>
    </dl>
    ${(a.warnings || []).map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
    <section class="card">
      <h3>Ringkasan</h3><p>${esc(a.summary)}</p>
      <h3>Struktur pasaran</h3><p>${esc(a.structure)}</p>
    </section>
    <h2>Setup</h2>
    ${setups.length ? setups.map((s, i) => setupCard(s, a, i)).join('') : '<p class="muted">Tiada setup yang munasabah pada chart ini.</p>'}
    <section class="card verdict"><h3>Keputusan</h3><p>${esc(a.verdict)}</p></section>
    <section class="card">
      ${a.key_levels?.length ? `<h3>Paras penting</h3><div class="scroll"><table><thead><tr><th>Harga</th><th>Jenis</th><th>Nota</th></tr></thead><tbody>
        ${[...a.key_levels].sort((x, y) => y.price - x.price).map((l) => `<tr><td>${fmt(l.price, 5)}</td><td>${esc(l.kind.replace('_', ' '))}</td><td class="wrap">${esc(l.note)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${list('Corak', a.patterns)}
      ${list('Indikator', a.indicators)}
      ${list('Risiko', a.risks)}
    </section>
    <p class="muted">${new Date(entry.at).toLocaleString()} · ${esc(entry.model)}</p>`;
}

function setupText(s, a) {
  const z = sizing(s);
  return [
    `${a.symbol} ${a.timeframe} ${DIR[s.direction]} ${s.order_type} (${s.confidence}%)`,
    `Entry ${s.entry} | SL ${s.sl} | ${tps(s).map((v, i) => `TP${i + 1} ${v}`).join(' | ')}`,
    `Lot ${fmt(z.lots, 2)} | Rugi di SL ${usd(z.riskAmt)} (${fmt(z.riskPct)}%)`,
    'Sebab:', ...(s.reasons || []).map((r) => '- ' + r),
    `SL: ${s.sl_reason}`, `TP: ${s.tp_reason}`, `Batal jika: ${s.invalidation}`,
  ].join('\n');
}

$('#result').addEventListener('click', async (e) => {
  const { copy, log } = e.target.dataset;
  if (!current || (copy ?? log) === undefined) return;
  const a = current.a, s = a.setups[+(copy ?? log)];
  if (copy !== undefined) {
    try { await navigator.clipboard.writeText(setupText(s, a)); e.target.textContent = 'Disalin'; } catch { e.target.textContent = 'Gagal salin'; }
    return;
  }
  const f = $('#tradeForm');
  f.reset();
  f.date.valueAsDate = new Date();
  f.symbol.value = a.symbol === '?' ? '' : a.symbol;
  f.side.value = s.direction;
  f.entry.value = s.entry;
  f.sl.value = s.sl;
  f.tp.value = s.tp1;
  const u = sizing(s).units;
  f.size.value = ok(u) ? Number(u.toFixed(4)) : '';
  f.notes.value = `AI ${a.timeframe}: ${(s.reasons || [])[0] || ''}`;
  showTab('journal');
  f.exit.focus();
});

// History
const HIST_KEY = 'ta-history';
let hist = load(HIST_KEY, []);
function renderHistory() {
  $('#histList').innerHTML = hist.length
    ? hist.map((h, i) => {
        const [b, c] = BIAS[h.a.bias] || ['-', ''];
        return `<div class="hist-item" data-open="${i}">
          <img src="${h.thumbs[0]}" alt="">
          <div><b>${esc(h.a.symbol)} ${esc(h.a.timeframe)}</b> <span class="${c}">${b}</span><br>
          <span class="muted">${new Date(h.at).toLocaleString()} · ${h.a.setups?.length || 0} setup</span></div>
          <button type="button" data-del="${i}" aria-label="Padam">x</button>
        </div>`;
      }).join('')
    : '<p class="muted">Belum ada analisis.</p>';
}
$('#histList').addEventListener('click', (e) => {
  const del = e.target.dataset.del;
  if (del !== undefined) { hist.splice(+del, 1); store(HIST_KEY, hist); renderHistory(); return; }
  const item = e.target.closest('[data-open]');
  if (item) { showTab('analyze'); setStatus(''); renderResult(hist[+item.dataset.open]); }
});

// Journal
const KEY = 'trading-analyst-trades';
const SIDE = { long: 'buy', short: 'sell' };
let trades = load(KEY, []).map((t) => ({ ...t, side: SIDE[t.side] || t.side }));
const save = () => store(KEY, trades);
const closed = (t) => ok(num(t.exit));
const pnl = (t) => (closed(t) ? (t.side === 'sell' ? t.entry - t.exit : t.exit - t.entry) * t.size - (t.fees || 0) : NaN);
const rMult = (t) => {
  const risk = Math.abs(t.entry - num(t.sl));
  return closed(t) && risk ? (t.side === 'sell' ? t.entry - t.exit : t.exit - t.entry) / risk : NaN;
};

function renderJournal() {
  trades.sort((a, b) => a.date.localeCompare(b.date));
  $('#trades').innerHTML = trades
    .map((t, i) => {
      const p = pnl(t), r = rMult(t);
      return `<tr><td>${esc(t.date)}</td><td>${esc(t.symbol)}</td><td class="${t.side === 'buy' ? 'up' : 'down'}">${esc(t.side)}</td><td>${fmt(t.entry, 5)}</td><td>${fmt(num(t.sl), 5)}</td><td>${fmt(num(t.tp), 5)}</td><td>${closed(t) ? fmt(t.exit, 5) : '<span class="muted">buka</span>'}</td><td>${fmt(t.size, 4)}</td><td class="${cls(p)}">${fmt(p)}</td><td class="${cls(r)}">${fmt(r)}</td><td class="wrap">${esc(t.notes)}</td><td><button data-del="${i}">x</button></td></tr>`;
    })
    .reverse()
    .join('');

  const done = trades.filter(closed);
  const ps = done.map(pnl), rs = done.map(rMult).filter(ok);
  const wins = ps.filter((p) => p > 0), losses = ps.filter((p) => p < 0);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const net = sum(ps), gw = sum(wins), gl = -sum(losses);
  let peak = 0, eq = 0, dd = 0;
  for (const p of ps) { eq += p; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  renderStats($('#stats'), [
    ['Trade ditutup', `${done.length} / ${trades.length}`],
    ['Win rate', ps.length ? fmt((wins.length / ps.length) * 100, 1) + '%' : '-'],
    ['Net P/L', usd(net), cls(net)],
    ['Profit factor', gl ? fmt(gw / gl) : '-'],
    ['Purata R', rs.length ? fmt(sum(rs) / rs.length) : '-', cls(sum(rs))],
    ['Purata menang', fmt(wins.length ? gw / wins.length : 0), 'up'],
    ['Purata kalah', fmt(losses.length ? -gl / losses.length : 0), 'down'],
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
  trades.filter(closed).forEach((t) => pts.push(pts.at(-1) + pnl(t)));
  if (pts.length < 2) { g.fillStyle = '#8b93a3'; g.fillText('Lengkung ekuiti muncul selepas trade pertama ditutup', 12, h / 2); return; }
  const min = Math.min(...pts), max = Math.max(...pts), pad = 12;
  const x = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  g.strokeStyle = '#2a2f3a'; g.beginPath(); g.moveTo(pad, y(0)); g.lineTo(w - pad, y(0)); g.stroke();
  g.strokeStyle = pts.at(-1) >= 0 ? '#22c55e' : '#ef4444'; g.lineWidth = 2; g.beginPath();
  pts.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.stroke();
}

const NUMS = ['entry', 'sl', 'tp', 'exit', 'size', 'fees'];
const parseTrade = (t) => {
  NUMS.forEach((k) => (t[k] = t[k] === '' || t[k] == null ? '' : parseFloat(t[k]) || 0));
  t.side = SIDE[t.side] || t.side;
  return t;
};
$('#tradeForm').date.valueAsDate = new Date();
$('#tradeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  trades.push(parseTrade(Object.fromEntries(new FormData(e.target))));
  save(); renderJournal();
  e.target.reset(); e.target.date.valueAsDate = new Date();
});
$('#trades').addEventListener('click', (e) => {
  const i = e.target.dataset.del;
  if (i === undefined) return;
  trades.splice(+i, 1);
  save(); renderJournal();
});

const COLS = ['date', 'symbol', 'side', 'entry', 'sl', 'tp', 'exit', 'size', 'fees', 'notes'];
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
  const [head, ...lines] = (await file.text()).trim().split(/\r?\n/);
  const cols = head.split(',').map((c) => c.replace(/"/g, '').trim());
  for (const line of lines) {
    const v = [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
    const t = parseTrade(Object.fromEntries(cols.map((k, i) => [k, v[i] ?? ''])));
    if (t.date && t.symbol) trades.push(t);
  }
  save(); renderJournal(); e.target.value = '';
});
renderJournal();
