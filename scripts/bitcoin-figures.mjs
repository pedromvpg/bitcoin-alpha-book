/**
 * SVG diagrams for "The Bitcoin Protocol" primer. Every figure draws what the
 * v0.1.0 code does: amounts come from GetBlockValue's shift, the retarget curve
 * from GetNextWorkRequired's clamp, and field names from main.h. Static,
 * deterministic SVG (seeded PRNG for the peer graph) so builds are stable.
 * Visual vocabulary borrowed from the Anatomy of Bitcoin explorer: token rows
 * split into unlocking/locking phases, stack snapshots, and an epoch spiral.
 */

const FONT_MONO = 'Basis Grotesque Mono Pro, monospace';

const C = {
  ink: '#111827',
  text: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  rule: '#d1d5db',
  wash: '#f3f4f6',
  paper: '#ffffff',
  orange: '#f97316',
  orangeDeep: '#c2410c',
  orangeSoft: '#fff1e6',
  blue: '#2563eb',
  blueSoft: '#eaf1fe',
  red: '#dc2626',
};

/** Crisp strokes when SVG is scaled (e.g. print/PDF) */
const VEC = ' vector-effect="non-scaling-stroke"';

const COIN = 100000000n;
const SUBSIDY_INTERVAL = 210000;
const TARGET_TIMESPAN = 14 * 24 * 60 * 60;
const TARGET_SPACING = 10 * 60;
const RETARGET_INTERVAL = TARGET_TIMESPAN / TARGET_SPACING;
const GENESIS_TIME = 1231006505; // genesis block nTime (main.cpp)

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgWrap(width, height, body, ariaHidden = true) {
  const ah = ariaHidden ? ' aria-hidden="true"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"${ah}>
    <rect width="${width}" height="${height}" fill="${C.paper}"/>
    <g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

function text(x, y, s, o = {}) {
  const {
    size = 11, weight = 400, anchor = 'start', fill = C.text, halo = false, italic = false,
  } = o;
  const h = halo ? ` stroke="${C.paper}" stroke-width="4" paint-order="stroke fill"` : '';
  const it = italic ? ' font-style="italic"' : '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT_MONO}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}"${it}${h}>${esc(s)}</text>`;
}

/** Several lines of text, `lh` apart, first baseline at y */
function lines(x, y, arr, o = {}) {
  const lh = o.lh ?? (o.size ?? 11) * 1.3;
  return arr.map((s, i) => text(x, y + i * lh, s, o)).join('');
}

function rect(x, y, w, h, o = {}) {
  const { fill = C.paper, stroke = C.ink, sw = 1, rx = 4, dash = null } = o;
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  const s = stroke ? ` stroke="${stroke}" stroke-width="${sw}"${VEC}${d}` : '';
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${fill}"${s}/>`;
}

function line(x1, y1, x2, y2, o = {}) {
  const { stroke = C.muted, sw = 1.2, dash = null, marker = null } = o;
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  const m = marker ? ` marker-end="url(#${marker})"` : '';
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"${VEC}${d}${m}/>`;
}

function path(d, o = {}) {
  const { stroke = C.muted, sw = 1.2, fill = 'none', dash = null, marker = null } = o;
  const da = dash ? ` stroke-dasharray="${dash}"` : '';
  const m = marker ? ` marker-end="url(#${marker})"` : '';
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${VEC}${da}${m}/>`;
}

function circle(cx, cy, r, o = {}) {
  const { fill = C.ink, stroke = null, sw = 1, dash = null } = o;
  const da = dash ? ` stroke-dasharray="${dash}"` : '';
  const s = stroke ? ` stroke="${stroke}" stroke-width="${sw}"${VEC}${da}` : '';
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}"${s}/>`;
}

/** Arrowhead markers; ids are figure-scoped because every SVG shares one HTML document */
function markers(prefix, colors) {
  return `<defs>${Object.entries(colors).map(([name, color]) => `
    <marker id="${prefix}-${name}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
      <polygon points="0 0, 7 3.5, 0 7" fill="${color}"/>
    </marker>`).join('')}</defs>`;
}

/** Horizontal-tangent cubic from (x1,y1) to (x2,y2) */
function hCurve(x1, y1, x2, y2) {
  const dx = Math.max(24, Math.abs(x2 - x1) * 0.5);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Approximate advance width of monospace text */
function monoWidth(s, size) {
  return s.length * size * 0.6;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Money supply: computed from GetBlockValue's rule, not typed in
// ---------------------------------------------------------------------------

/** int64 nSubsidy = 50 * COIN; nSubsidy >>= era;  (in satoshis) */
function subsidyForEra(era) {
  return (50n * COIN) >> BigInt(era);
}

function supplySchedule() {
  const eras = [];
  let cumulative = 0n;
  for (let era = 0; ; era++) {
    const subsidy = subsidyForEra(era);
    if (subsidy === 0n) {
      eras.push({ era, subsidy, cumulative, firstBlock: era * SUBSIDY_INTERVAL });
      break;
    }
    cumulative += subsidy * BigInt(SUBSIDY_INTERVAL);
    eras.push({ era, subsidy, cumulative, firstBlock: era * SUBSIDY_INTERVAL });
  }
  return { eras, total: cumulative };
}

const SCHEDULE = supplySchedule();
if (SCHEDULE.total !== 2099999997690000n) {
  throw new Error(`bitcoin-figures: supply total ${SCHEDULE.total} != 2099999997690000 satoshis`);
}
if (RETARGET_INTERVAL !== 2016) {
  throw new Error(`bitcoin-figures: retarget interval ${RETARGET_INTERVAL} != 2016`);
}

function formatBtc(sat, { trim = true } = {}) {
  const whole = sat / COIN;
  const frac = (sat % COIN).toString().padStart(8, '0');
  const f = trim ? frac.replace(/0+$/, '') : frac;
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return f ? `${w}.${f}` : w;
}

/** Nominal calendar month for a height at exactly 10 minutes per block */
function nominalDate(height) {
  const d = new Date((GENESIS_TIME + height * TARGET_SPACING) * 1000);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// 1. Coins, not accounts: a small transaction graph
// ---------------------------------------------------------------------------

function utxoGraphFigure() {
  const W = 560;
  const H = 268;
  const TW = 124;
  const HEAD = 20;
  const ROW = 24;
  const mk = markers('btc-utxo', { gray: C.muted });

  const txs = {
    cbA: { x: 16, y: 26, title: 'Coinbase A', ins: ['new coins'], outs: [{ v: '50.00', spent: true }], coinbase: true },
    cbB: { x: 16, y: 170, title: 'Coinbase B', ins: ['new coins'], outs: [{ v: '50.00', spent: true }], coinbase: true },
    tx1: { x: 214, y: 26, title: 'Tx 1', ins: ['in 0'], outs: [{ v: '20.00', spent: true }, { v: '30.00', spent: true }] },
    tx2: { x: 418, y: 136, title: 'Tx 2', ins: ['in 0', 'in 1'], outs: [{ v: '60.00', spent: false }, { v: '10.00', spent: false }] },
    tx3: { x: 418, y: 18, title: 'Tx 3', ins: ['in 0'], outs: [{ v: '30.00', spent: false }] },
  };
  const rowY = (tx, i) => tx.y + HEAD + ROW / 2 + i * ROW + 3;
  const height = (tx) => HEAD + Math.max(tx.ins.length, tx.outs.length) * ROW + 6;

  let out = '';
  // Edges first so boxes sit on top
  const edges = [
    ['cbA', 0, 'tx1', 0],
    ['tx1', 0, 'tx2', 0],
    ['cbB', 0, 'tx2', 1],
    ['tx1', 1, 'tx3', 0],
  ];
  for (const [a, ai, b, bi] of edges) {
    const A = txs[a];
    const B = txs[b];
    out += path(hCurve(A.x + TW + 4, rowY(A, ai), B.x - 6, rowY(B, bi)), { stroke: C.muted, sw: 1.6, marker: 'btc-utxo-gray' });
  }

  for (const tx of Object.values(txs)) {
    const h = height(tx);
    out += rect(tx.x, tx.y, TW, h, { stroke: C.ink, sw: 1.1 });
    out += rect(tx.x, tx.y, TW, HEAD, { fill: C.ink, stroke: null, rx: 4 });
    out += rect(tx.x, tx.y + HEAD - 4, TW, 4, { fill: C.ink, stroke: null, rx: 0 });
    out += text(tx.x + 8, tx.y + 14, tx.title, { size: 10.5, weight: 700, fill: C.paper });
    tx.ins.forEach((label, i) => {
      const y = rowY(tx, i);
      out += circle(tx.x, y, 3.5, tx.coinbase
        ? { fill: C.paper, stroke: C.muted, dash: '2 2' }
        : { fill: C.ink });
      out += text(tx.x + 8, y + 3.5, label, { size: 9.5, fill: tx.coinbase ? C.muted : C.text, italic: tx.coinbase });
    });
    tx.outs.forEach((o, i) => {
      const y = rowY(tx, i);
      if (!o.spent) {
        out += rect(tx.x + TW - 62, y - 9, 58, 18, { fill: C.orangeSoft, stroke: C.orange, sw: 1, rx: 9 });
      }
      out += text(tx.x + TW - 10, y + 3.5, o.v, { size: 10.5, weight: 700, anchor: 'end', fill: o.spent ? C.text : C.orangeDeep });
      out += circle(tx.x + TW, y, 3.5, o.spent ? { fill: C.muted } : { fill: C.orange });
    });
  }

  // Legend
  const ly = H - 14;
  out += circle(24, ly - 4, 4, { fill: C.orange });
  out += text(34, ly, 'unspent output (UTXO)', { size: 9.5 });
  out += circle(200, ly - 4, 4, { fill: C.muted });
  out += text(210, ly, 'spent output', { size: 9.5 });
  out += circle(318, ly - 4, 4, { fill: C.paper, stroke: C.muted, dash: '2 2' });
  out += text(328, ly, 'coinbase input: no prior output', { size: 9.5 });

  return svgWrap(W, H, mk + out);
}

// ---------------------------------------------------------------------------
// 2. Anatomy of a transaction (main.h)
// ---------------------------------------------------------------------------

function fieldBox(x, y, w, title, subtitle, rows, o = {}) {
  const HEAD = 24;
  const rowH = o.rowH ?? 36;
  let out = '';
  const h = HEAD + rows.length * rowH + 4;
  out += rect(x, y, w, h, { stroke: C.ink, sw: 1.1 });
  out += rect(x, y, w, HEAD, { fill: C.ink, stroke: null, rx: 4 });
  out += rect(x, y + HEAD - 4, w, 4, { fill: C.ink, stroke: null, rx: 0 });
  out += text(x + 8, y + 16, title, { size: 11, weight: 700, fill: C.paper });
  if (subtitle) out += text(x + w - 8, y + 16, subtitle, { size: 9, anchor: 'end', fill: '#d1d5db' });
  const ys = [];
  rows.forEach((r, i) => {
    const ry = y + HEAD + i * rowH;
    if (i > 0) out += line(x + 6, ry, x + w - 6, ry, { stroke: C.rule, sw: 0.8 });
    if (r.accent) out += rect(x + 3, ry + 3, w - 6, rowH - 6, { fill: r.accent, stroke: null, rx: 3 });
    out += text(x + 10, ry + 15, r.name, { size: 10.5, weight: 700, fill: C.ink });
    out += text(x + 10 + monoWidth(r.name, 10.5) + 8, ry + 15, r.type, { size: 9.5, fill: C.muted });
    if (r.note) out += text(x + 10, ry + 29, r.note, { size: 9, fill: C.text });
    ys.push(ry + rowH / 2);
  });
  return { svg: out, h, rowMid: ys };
}

function txAnatomyFigure() {
  const W = 560;
  const H = 336;
  const mk = markers('btc-anat', { gray: C.muted, orange: C.orange });
  let out = mk;

  const tx = fieldBox(16, 60, 186, 'CTransaction', '', [
    { name: 'nVersion', type: 'int', note: 'format version (1)' },
    { name: 'vin', type: 'vector<CTxIn>', note: 'coins being spent', accent: C.blueSoft },
    { name: 'vout', type: 'vector<CTxOut>', note: 'coins being created', accent: C.orangeSoft },
    { name: 'nLockTime', type: 'int', note: 'final once the chain passes this height' },
  ]);
  out += tx.svg;

  const vin = fieldBox(258, 10, 286, 'CTxIn', 'one per input', [
    { name: 'prevout', type: 'COutPoint', note: '{ hash, n }: which earlier output' },
    { name: 'scriptSig', type: 'CScript', note: 'unlocking data: signature (+ key)', accent: C.blueSoft },
    { name: 'nSequence', type: 'unsigned int', note: 'UINT_MAX = final' },
  ]);
  out += vin.svg;

  const voutY = 10 + vin.h + 22;
  const vout = fieldBox(258, voutY, 286, 'CTxOut', 'one per output', [
    { name: 'nValue', type: 'int64', note: 'amount; 1 BTC = COIN = 100,000,000' },
    { name: 'scriptPubKey', type: 'CScript', note: 'locking condition for the next spender', accent: C.orangeSoft },
  ]);
  out += vout.svg;

  out += path(hCurve(16 + 186, tx.rowMid[1], 258 - 4, 10 + 12), { stroke: C.blue, sw: 1.4, marker: 'btc-anat-gray' });
  out += path(hCurve(16 + 186, tx.rowMid[2], 258 - 4, voutY + 12), { stroke: C.orange, sw: 1.4, marker: 'btc-anat-orange' });

  // Fee line
  const fy = H - 22;
  out += line(16, fy - 18, W - 16, fy - 18, { stroke: C.rule, sw: 0.8 });
  out += text(16, fy, 'fee = Σ (values of the outputs vin spends) − Σ vout[i].nValue', { size: 10.5, weight: 700, fill: C.ink });
  out += text(16, fy + 15, 'no field records it: the miner claims the difference in the coinbase', { size: 9.5, fill: C.muted });
  out += text(16, 40, 'serialized in this order:', { size: 9, fill: C.muted });
  out += text(16, 52, 'nVersion, vin, vout, nLockTime', { size: 9, fill: C.muted });

  return svgWrap(W, H, out);
}

// ---------------------------------------------------------------------------
// 3. The two script templates (Solver, script.cpp)
// ---------------------------------------------------------------------------

function chip(x, y, label, kind, size = 10) {
  const w = monoWidth(label, size) + 14;
  const h = 22;
  const styles = {
    lock: { fill: C.orangeSoft, stroke: C.orange, color: C.orangeDeep },
    unlock: { fill: C.blueSoft, stroke: C.blue, color: C.blue },
    op: { fill: C.ink, stroke: null, color: C.paper },
    neutral: { fill: C.wash, stroke: C.faint, color: C.text },
  };
  const s = styles[kind];
  return {
    w,
    svg: rect(x, y, w, h, { fill: s.fill, stroke: s.stroke, sw: 1, rx: 4 })
      + text(x + w / 2, y + 15, label, { size, weight: 700, anchor: 'middle', fill: s.color }),
  };
}

function chipRow(x, y, items, gap = 6) {
  let cx = x;
  let svg = '';
  const pos = [];
  for (const it of items) {
    const c = chip(cx, y, it.label, it.kind);
    svg += c.svg;
    if (it.size) svg += text(cx + c.w / 2, y + 34, it.size, { size: 8.5, anchor: 'middle', fill: C.muted });
    pos.push({ x: cx, w: c.w });
    cx += c.w + gap;
  }
  return { svg, end: cx - gap, pos };
}

function scriptTemplatesFigure() {
  const W = 560;
  const H = 300;
  let out = '';
  const LX = 16;
  const CX = 132;

  const panels = [
    {
      y: 10,
      title: 'Pay to public key',
      use: 'generated coins · change · pay-to-IP replies',
      lock: [
        { label: '<pubKey>', kind: 'lock', size: '65 bytes' },
        { label: 'OP_CHECKSIG', kind: 'op' },
      ],
      unlock: [{ label: '<sig>', kind: 'unlock', size: '≈72 bytes' }],
    },
    {
      y: 152,
      title: 'Pay to public key hash',
      use: 'payments to a Bitcoin address',
      lock: [
        { label: 'OP_DUP', kind: 'op' },
        { label: 'OP_HASH160', kind: 'op' },
        { label: '<pubKeyHash>', kind: 'lock', size: '20 bytes' },
        { label: 'OP_EQUALVERIFY', kind: 'op' },
        { label: 'OP_CHECKSIG', kind: 'op' },
      ],
      unlock: [
        { label: '<sig>', kind: 'unlock', size: '≈72 bytes' },
        { label: '<pubKey>', kind: 'unlock', size: '65 bytes' },
      ],
    },
  ];

  for (const p of panels) {
    out += rect(8, p.y, W - 16, 136, { fill: C.paper, stroke: C.rule, sw: 1, rx: 6 });
    out += text(LX + 4, p.y + 20, p.title, { size: 12, weight: 700, fill: C.ink });
    out += text(W - 20, p.y + 20, p.use, { size: 9.5, anchor: 'end', fill: C.muted });

    out += text(LX + 4, p.y + 54, 'scriptPubKey', { size: 10, weight: 700, fill: C.orangeDeep });
    out += text(LX + 4, p.y + 66, 'locks an output', { size: 8.5, fill: C.muted });
    out += chipRow(CX, p.y + 40, p.lock).svg;

    out += text(LX + 4, p.y + 104, 'scriptSig', { size: 10, weight: 700, fill: C.blue });
    out += text(LX + 4, p.y + 116, 'unlocks it, later', { size: 8.5, fill: C.muted });
    out += chipRow(CX, p.y + 90, p.unlock).svg;
  }

  // Legend
  const ly = H + 12;
  out += rect(16, ly - 11, 12, 12, { fill: C.ink, stroke: null, rx: 2 });
  out += text(34, ly, 'opcode', { size: 9.5 });
  out += rect(96, ly - 11, 12, 12, { fill: C.orangeSoft, stroke: C.orange, rx: 2 });
  out += text(114, ly, 'data pushed by the locking script', { size: 9.5 });
  out += rect(340, ly - 11, 12, 12, { fill: C.blueSoft, stroke: C.blue, rx: 2 });
  out += text(358, ly, 'data supplied by the spender', { size: 9.5 });

  return svgWrap(W, H + 20, out);
}

// ---------------------------------------------------------------------------
// 4. Running a script: stack snapshots
// ---------------------------------------------------------------------------

/**
 * tokens: [{ label: [line1, line2?], kind, group }]
 * stacks: per step, bottom→top array of { label, kind, fresh }
 * effects: per step, short caption under the column
 */
function stackFigure({ prefix, tokens, stacks, effects, groups, result }) {
  const COL = 78;
  const M = 14;
  const W = M * 2 + tokens.length * COL;
  const TOKEN_Y = 34;
  const TOKEN_H = 34;
  const ITEM_H = 22;
  const maxDepth = Math.max(...stacks.map((s) => s.length));
  const BASE = TOKEN_Y + TOKEN_H + 26 + maxDepth * (ITEM_H + 4) + 6;
  const H = BASE + 58;
  const mk = markers(prefix, { gray: C.muted });
  let out = mk;

  // Group brackets above the token tape
  for (const g of groups) {
    const x1 = M + g.from * COL + 4;
    const x2 = M + (g.to + 1) * COL - 4;
    out += path(`M ${x1} 22 L ${x1} 16 L ${x2} 16 L ${x2} 22`, { stroke: g.color, sw: 1.2 });
    out += text((x1 + x2) / 2, 11, g.label, { size: 9.5, weight: 700, anchor: 'middle', fill: g.color });
  }

  tokens.forEach((t, i) => {
    const x = M + i * COL + 4;
    const w = COL - 8;
    const styles = {
      lock: { fill: C.orangeSoft, stroke: C.orange, color: C.orangeDeep },
      unlock: { fill: C.blueSoft, stroke: C.blue, color: C.blue },
      op: { fill: C.ink, stroke: null, color: C.paper },
      sep: { fill: C.wash, stroke: C.faint, color: C.text },
    }[t.kind];
    out += rect(x, TOKEN_Y, w, TOKEN_H, { fill: styles.fill, stroke: styles.stroke, rx: 4 });
    const ls = t.label;
    const y0 = ls.length === 1 ? TOKEN_Y + 21 : TOKEN_Y + 15;
    out += lines(x + w / 2, y0, ls, { size: 9.5, weight: 700, anchor: 'middle', fill: styles.color, lh: 12 });
    // Step number
    out += text(x + w / 2, TOKEN_Y + TOKEN_H + 14, String(i + 1), { size: 9, anchor: 'middle', fill: C.faint });
  });

  // Stack columns
  stacks.forEach((stack, i) => {
    const x = M + i * COL + 6;
    const w = COL - 12;
    out += line(x - 2, BASE, x + w + 2, BASE, { stroke: C.ink, sw: 1.4 });
    stack.forEach((item, d) => {
      const y = BASE - (d + 1) * (ITEM_H + 4);
      const st = {
        unlock: { fill: C.blueSoft, stroke: C.blue, color: C.blue },
        lock: { fill: C.orangeSoft, stroke: C.orange, color: C.orangeDeep },
        derived: { fill: C.wash, stroke: C.muted, color: C.ink },
        ok: { fill: C.ink, stroke: null, color: C.paper },
      }[item.kind];
      out += rect(x, y, w, ITEM_H, { fill: st.fill, stroke: st.stroke, sw: item.fresh ? 2 : 1, rx: 3 });
      out += text(x + w / 2, y + 15, item.label, { size: 9.5, weight: 700, anchor: 'middle', fill: st.color });
    });
    if (!stack.length) out += text(x + w / 2, BASE - 8, 'empty', { size: 9, anchor: 'middle', fill: C.faint, italic: true });
    out += text(x + w / 2, BASE + 15, effects[i], { size: 9, anchor: 'middle', fill: C.text });
  });

  // Time arrow and result
  const ay = BASE + 34;
  out += line(M + 4, ay, W - M - 4, ay, { stroke: C.muted, sw: 1, marker: `${prefix}-gray` });
  out += text(M + 4, ay + 16, 'EvalScript runs left to right', { size: 9, fill: C.muted });
  out += text(W - M - 4, ay + 16, result, { size: 9, anchor: 'end', weight: 700, fill: C.ink });

  return svgWrap(W, H, out);
}

const SIG = { label: 'sig', kind: 'unlock' };
const PK = { label: 'pubKey', kind: 'unlock' };

function scriptStackP2PKHFigure() {
  const f = (o) => ({ ...o, fresh: true });
  return stackFigure({
    prefix: 'btc-stk2',
    groups: [
      { from: 0, to: 1, label: 'scriptSig (input)', color: C.blue },
      { from: 3, to: 7, label: 'scriptPubKey (previous output)', color: C.orangeDeep },
    ],
    tokens: [
      { label: ['<sig>'], kind: 'unlock' },
      { label: ['<pubKey>'], kind: 'unlock' },
      { label: ['OP_CODE', 'SEPARATOR'], kind: 'sep' },
      { label: ['OP_DUP'], kind: 'op' },
      { label: ['OP_HASH160'], kind: 'op' },
      { label: ['<pubKey', 'Hash>'], kind: 'lock' },
      { label: ['OP_EQUAL', 'VERIFY'], kind: 'op' },
      { label: ['OP_CHECK', 'SIG'], kind: 'op' },
    ],
    stacks: [
      [f(SIG)],
      [SIG, f(PK)],
      [SIG, PK],
      [SIG, PK, f({ label: 'pubKey', kind: 'derived' })],
      [SIG, PK, f({ label: 'H160(pk)', kind: 'derived' })],
      [SIG, PK, { label: 'H160(pk)', kind: 'derived' }, f({ label: 'pkHash', kind: 'lock' })],
      [SIG, PK],
      [f({ label: 'true', kind: 'ok' })],
    ],
    effects: ['push', 'push', 'mark', 'duplicate', 'hash top', 'push', 'equal? pop', 'check sig'],
    result: 'top = true → spend is valid',
  });
}

function scriptStackP2PKFigure() {
  const f = (o) => ({ ...o, fresh: true });
  return stackFigure({
    prefix: 'btc-stk1',
    groups: [
      { from: 0, to: 0, label: 'scriptSig', color: C.blue },
      { from: 2, to: 3, label: 'scriptPubKey', color: C.orangeDeep },
    ],
    tokens: [
      { label: ['<sig>'], kind: 'unlock' },
      { label: ['OP_CODE', 'SEPARATOR'], kind: 'sep' },
      { label: ['<pubKey>'], kind: 'lock' },
      { label: ['OP_CHECK', 'SIG'], kind: 'op' },
    ],
    stacks: [
      [f(SIG)],
      [SIG],
      [SIG, f({ label: 'pubKey', kind: 'lock' })],
      [f({ label: 'true', kind: 'ok' })],
    ],
    effects: ['push', 'mark', 'push', 'check sig'],
    result: 'top = true',
  });
}

// ---------------------------------------------------------------------------
// 5. Blocks and the chain
// ---------------------------------------------------------------------------

function blockChainFigure() {
  const W = 560;
  const H = 330;
  const BW = 168;
  const GAP = 20;
  const BY = 52;
  const HEAD = 22;
  const ROW = 20;
  const mk = markers('btc-chain', { orange: C.orange, gray: C.muted });
  let out = mk;

  const blocks = [
    { label: 'block n−1', hash: 'hash(n−1) = 0000…', prev: 'hash(n−2)' },
    { label: 'block n', hash: 'hash(n) = 0000…', prev: 'hash(n−1)' },
    { label: 'block n+1', hash: 'hash(n+1) = 0000…', prev: 'hash(n)' },
  ];
  const fields = ['nVersion', 'hashPrevBlock', 'hashMerkleRoot', 'nTime', 'nBits', 'nNonce'];

  blocks.forEach((b, i) => {
    const x = 12 + i * (BW + GAP);
    const h = HEAD + fields.length * ROW + 6;
    // Hash pill above
    out += rect(x + 8, 12, BW - 16, 20, { fill: C.orangeSoft, stroke: C.orange, rx: 10 });
    out += text(x + BW / 2, 26, b.hash, { size: 9.5, weight: 700, anchor: 'middle', fill: C.orangeDeep });
    out += line(x + BW / 2, 32, x + BW / 2, BY - 2, { stroke: C.orange, sw: 1, dash: '2 2' });

    out += rect(x, BY, BW, h, { stroke: C.ink, sw: 1.1 });
    out += rect(x, BY, BW, HEAD, { fill: C.ink, stroke: null, rx: 4 });
    out += rect(x, BY + HEAD - 4, BW, 4, { fill: C.ink, stroke: null, rx: 0 });
    out += text(x + 8, BY + 15, b.label, { size: 10.5, weight: 700, fill: C.paper });
    out += text(x + BW - 8, BY + 15, '80-byte header', { size: 8.5, anchor: 'end', fill: '#d1d5db' });
    const vals = ['1', b.prev, 'root(vtx)', 'Unix time', 'target', 'the winner'];
    fields.forEach((f, j) => {
      const y = BY + HEAD + j * ROW + 14;
      if (f === 'hashPrevBlock') out += rect(x + 3, y - 12, BW - 6, ROW - 2, { fill: C.orangeSoft, stroke: null, rx: 2 });
      if (f === 'hashMerkleRoot' && i === 1) out += rect(x + 3, y - 12, BW - 6, ROW - 2, { fill: C.wash, stroke: null, rx: 2 });
      out += text(x + 7, y, f, { size: 9, weight: 700, fill: C.ink });
      out += text(x + BW - 7, y, vals[j], { size: 9, anchor: 'end', fill: f === 'hashPrevBlock' ? C.orangeDeep : C.muted });
    });

    // hashPrevBlock → previous block's hash
    if (i > 0) {
      const py = BY + HEAD + 1 * ROW + 10;
      const prevX = 12 + (i - 1) * (BW + GAP);
      out += path(`M ${x + 2} ${py} C ${x - 14} ${py}, ${x - 10} 22, ${prevX + BW - 8 + 4} 22`, { stroke: C.orange, sw: 1.6, marker: 'btc-chain-orange' });
    }
  });

  out += text(12, BY + HEAD + fields.length * ROW + 24, 'hash = SHA-256(SHA-256(80-byte header)); proof-of-work makes it start with zeros', { size: 9.5, fill: C.text });

  // Merkle sketch under block n
  const mx = 12 + (BW + GAP) + BW / 2;
  const rootY = BY + HEAD + 2 * ROW + 10;
  const topY = 232;
  const baseY = 286;
  const txs = ['coinbase', 'tx 1', 'tx 2', 'tx 3'];
  const tw = 70;
  const span = txs.length * tw + (txs.length - 1) * 10;
  const tx0 = mx - span / 2;
  out += path(`M ${mx} ${rootY + 8} L ${mx} ${topY}`, { stroke: C.muted, sw: 1, dash: '3 3' });
  out += path(`M ${mx} ${topY} L ${tx0 + 20} ${baseY - 4} L ${tx0 + span - 20} ${baseY - 4} Z`, { stroke: C.faint, sw: 1, fill: C.wash });
  out += text(mx, topY + 32, 'BuildMerkleTree()', { size: 9.5, anchor: 'middle', weight: 700, fill: C.text });
  txs.forEach((t, k) => {
    const x = tx0 + k * (tw + 10);
    out += rect(x, baseY, tw, 22, { fill: k === 0 ? C.orangeSoft : C.paper, stroke: k === 0 ? C.orange : C.muted, rx: 3 });
    out += text(x + tw / 2, baseY + 15, t, { size: 9.5, weight: 700, anchor: 'middle', fill: k === 0 ? C.orangeDeep : C.text });
  });
  out += text(tx0 + span + 12, baseY + 15, 'vtx: the', { size: 9, fill: C.muted });
  out += text(tx0 + span + 12, baseY + 27, 'block body', { size: 9, fill: C.muted });

  return svgWrap(W, H, out);
}

// ---------------------------------------------------------------------------
// 6. Mining loop (BitcoinMiner)
// ---------------------------------------------------------------------------

function miningLoopFigure() {
  const W = 560;
  const H = 474;
  const mk = markers('btc-mine', { gray: C.muted, orange: C.orange, ink: C.ink });
  let out = mk;
  const X = 16;
  const BW = 336;
  const cx = X + BW / 2;

  const step = (y, h, title, body, o = {}) => {
    let s = rect(X, y, BW, h, { fill: o.fill ?? C.paper, stroke: o.stroke ?? C.ink, sw: 1.1 });
    s += text(X + 10, y + 16, title, { size: 10.5, weight: 700, fill: C.ink });
    s += lines(X + 10, y + 31, body, { size: 9.5, fill: C.text, lh: 13 });
    return s;
  };

  const boxes = [
    { y: 8, h: 50, title: '1  Pick the tip', body: ['pindexPrev = pindexBest', 'nBits = GetNextWorkRequired(pindexPrev)'] },
    { y: 74, h: 50, title: '2  Build the coinbase', body: ['vin[0]: null prevout; scriptSig: nBits, ++bnExtraNonce', 'vout[0]: <key.GetPubKey()> OP_CHECKSIG'] },
    { y: 140, h: 50, title: '3  Fill the block', body: ['add each mapTransactions entry that', 'ConnectInputs() accepts; total the fees'] },
    { y: 206, h: 63, title: '4  Fix the header', body: ['vout[0].nValue = GetBlockValue(nFees)', 'hashMerkleRoot = BuildMerkleTree()', 'nTime = now; nNonce = 1'] },
  ];
  boxes.forEach((b, i) => {
    out += step(b.y, b.h, b.title, b.body.filter(Boolean));
    if (i < boxes.length - 1) out += line(cx, b.y + b.h, cx, boxes[i + 1].y - 3, { stroke: C.ink, sw: 1.2, marker: 'btc-mine-ink' });
  });

  // Decision diamond
  const dy = 330;
  const hw = 120;
  const hh = 38;
  out += line(cx, 269, cx, dy - hh - 3, { stroke: C.ink, sw: 1.2, marker: 'btc-mine-ink' });
  out += `<polygon points="${cx},${dy - hh} ${cx + hw},${dy} ${cx},${dy + hh} ${cx - hw},${dy}" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="1.4"${VEC}/>`;
  out += text(cx, dy - 4, 'SHA-256²(header)', { size: 10.5, weight: 700, anchor: 'middle', fill: C.ink });
  out += text(cx, dy + 11, '≤ hashTarget ?', { size: 10.5, weight: 700, anchor: 'middle', fill: C.ink });

  // yes → ProcessBlock
  const rx = 380;
  out += line(cx + hw, dy, rx - 3, dy, { stroke: C.orange, sw: 1.6, marker: 'btc-mine-orange' });
  out += text(cx + hw + 8, dy - 6, 'yes', { size: 9.5, weight: 700, fill: C.orangeDeep });
  out += rect(rx, dy - 30, W - rx - 12, 60, { fill: C.orangeSoft, stroke: C.orange, sw: 1.2 });
  out += text(rx + 9, dy - 12, 'ProcessBlock(NULL, pblock)', { size: 9.5, weight: 700, fill: C.ink });
  out += lines(rx + 10, dy + 3, ['handled like a block from', 'a peer, then relayed by inv'], { size: 9, fill: C.text, lh: 13 });

  // no → ++nNonce
  const ny = dy + hh + 22;
  out += line(cx, dy + hh, cx, ny - 3, { stroke: C.ink, sw: 1.2, marker: 'btc-mine-ink' });
  out += text(cx + 8, dy + hh + 14, 'no', { size: 9.5, weight: 700, fill: C.text });
  out += rect(cx - 60, ny, 120, 26, { fill: C.paper, stroke: C.ink, sw: 1.1 });
  out += text(cx, ny + 17, '++nNonce', { size: 10.5, weight: 700, anchor: 'middle', fill: C.ink });
  // loop back up to the diamond's left vertex
  out += path(`M ${cx - 60} ${ny + 13} L ${X + 6} ${ny + 13} L ${X + 6} ${dy} L ${cx - hw - 3} ${dy}`, { stroke: C.ink, sw: 1.2, marker: 'btc-mine-ink' });

  // Side note on restarts
  out += rect(rx, ny - 22, W - rx - 12, 96, { fill: C.wash, stroke: C.rule, sw: 1 });
  out += lines(rx + 9, ny - 6, [
    'every 262,144 nonces',
    '(nNonce & 0x3ffff == 0):',
    '· refresh nTime',
    '· start over if the tip',
    '  changed, nNonce wrapped,',
    '  or new txs + 60 s passed',
  ], { size: 8.5, fill: C.text, lh: 12 });
  out += line(rx, ny + 13, cx + 63, ny + 13, { stroke: C.faint, sw: 1, dash: '2 2' });

  return svgWrap(W, H, out);
}

// ---------------------------------------------------------------------------
// 7. Difficulty: retarget clamp and epoch spiral
// ---------------------------------------------------------------------------

function retargetClampFigure() {
  const W = 560;
  const H = 300;
  const x0 = 62;
  const x1 = 540;
  const yTop = 22;
  const yBot = 214;
  const XMAX = 70;
  const YMAX = 4.5;
  const px = (d) => x0 + (d / XMAX) * (x1 - x0);
  const py = (v) => yBot - (v / YMAX) * (yBot - yTop);
  const T = TARGET_TIMESPAN / 86400; // 14 days
  let out = '';

  // Regions
  out += rect(x0, yTop, px(T) - x0, yBot - yTop, { fill: '#f6f8fe', stroke: null, rx: 0 });
  out += rect(px(T), yTop, x1 - px(T), yBot - yTop, { fill: '#fffaf5', stroke: null, rx: 0 });

  // Grid
  for (const v of [0.25, 1, 2, 3, 4]) {
    out += line(x0, py(v), x1, py(v), { stroke: C.rule, sw: 0.7, dash: v === 1 ? null : '2 3' });
    out += text(x0 - 6, py(v) + 3.5, v === 0.25 ? '¼×' : `${v}×`, { size: 9.5, anchor: 'end', fill: C.muted });
  }
  for (const [d, lab] of [[T / 4, '3.5'], [T, '14'], [T * 4, '56'], [70, '70']]) {
    out += line(px(d), yBot, px(d), yBot + 4, { stroke: C.muted, sw: 1 });
    out += text(px(d), yBot + 16, lab, { size: 9.5, anchor: 'middle', fill: C.text });
  }
  out += line(x0, yBot, x1, yBot, { stroke: C.ink, sw: 1.2 });
  out += line(x0, yTop, x0, yBot, { stroke: C.ink, sw: 1.2 });

  // Clamp curve: nActualTimespan clamped to [T/4, 4T], then target *= t / T
  const clamp = (d) => Math.min(Math.max(d, T / 4), T * 4) / T;
  let d = 'M';
  for (let t = 0; t <= XMAX; t += 0.25) d += ` ${px(t).toFixed(1)} ${py(clamp(t)).toFixed(1)}`;
  out += path(d, { stroke: C.orange, sw: 2.4 });
  out += circle(px(T), py(1), 4, { fill: C.ink });
  out += text(px(T) + 8, py(1) + 14, 'on schedule: 14 days → unchanged', { size: 9.5, fill: C.ink, halo: true });

  out += lines(x0 + 8, py(3.7), ['blocks came too fast', '→ smaller target,', '  harder'], { size: 9, fill: C.blue, lh: 12 });
  out += lines(x1 - 8, py(1.15), ['blocks came too slowly', '→ larger target, easier'], { size: 9, fill: C.orangeDeep, anchor: 'end', lh: 12 });
  out += text(px(T / 4), yBot + 29, 'floor ¼×', { size: 8.5, anchor: 'middle', fill: C.blue });
  out += text(px(T * 4), yBot + 29, 'ceiling 4×', { size: 8.5, anchor: 'middle', fill: C.orangeDeep });
  out += text((x0 + x1) / 2, yBot + 50, 'nActualTimespan: days the last 2,016 blocks took (2,015 intervals)', { size: 9.5, anchor: 'middle', fill: C.text });
  out += `<text x="16" y="${((yTop + yBot) / 2).toFixed(1)}" font-family="${FONT_MONO}" font-size="9.5" fill="${C.text}" text-anchor="middle" transform="rotate(-90 16 ${((yTop + yBot) / 2).toFixed(1)})">new target ÷ old target</text>`;
  out += text(x1, H - 10, 'new target is also capped at bnProofOfWorkLimit (the easiest allowed)', { size: 9, anchor: 'end', fill: C.muted });

  return svgWrap(W, H, out);
}

function epochSpiralFigure() {
  const W = 560;
  const H = 330;
  const ERAS = 5;
  const totalBlocks = ERAS * SUBSIDY_INTERVAL;
  const nEpochs = Math.ceil(totalBlocks / RETARGET_INTERVAL);
  const cx = 168;
  const cy = 165;
  const turns = 5.4;
  const thetaMax = turns * 2 * Math.PI;
  const rMin = 14;
  const rMax = 150;
  const b = (rMax - rMin) / thetaMax;
  const eraFill = [C.ink, C.orangeDeep, C.orange, '#fdba74', C.faint];
  let out = '';

  // Guide spiral
  let g = 'M';
  for (let k = 0; k <= 600; k++) {
    const th = (k / 600) * thetaMax;
    const r = rMin + b * th;
    g += ` ${(cx + r * Math.cos(th - Math.PI / 2)).toFixed(1)} ${(cy + r * Math.sin(th - Math.PI / 2)).toFixed(1)}`;
  }
  out += path(g, { stroke: C.rule, sw: 0.8 });

  // Equal arc-length placement: s(θ) ≈ rMin·θ + bθ²/2
  const sOf = (th) => rMin * th + (b * th * th) / 2;
  const sMax = sOf(thetaMax);
  const thetaFor = (s) => (-rMin + Math.sqrt(rMin * rMin + 2 * b * s)) / b;
  const pos = (i) => {
    const th = thetaFor((i / nEpochs) * sMax);
    const r = rMin + b * th;
    return { x: cx + r * Math.cos(th - Math.PI / 2), y: cy + r * Math.sin(th - Math.PI / 2), th, r };
  };

  for (let i = 0; i < nEpochs; i++) {
    const era = Math.min(ERAS - 1, Math.floor((i * RETARGET_INTERVAL) / SUBSIDY_INTERVAL));
    const p = pos(i);
    out += circle(p.x, p.y, 2.1, { fill: eraFill[era] });
  }

  // Halving ticks
  for (let k = 1; k < ERAS; k++) {
    const p = pos((k * SUBSIDY_INTERVAL) / RETARGET_INTERVAL);
    const ux = Math.cos(p.th - Math.PI / 2);
    const uy = Math.sin(p.th - Math.PI / 2);
    out += line(p.x - ux * 7, p.y - uy * 7, p.x + ux * 9, p.y + uy * 9, { stroke: C.ink, sw: 1.6 });
  }
  out += circle(cx, cy - rMin, 3.5, { fill: C.ink });
  out += text(cx + 6, cy - rMin - 6, 'genesis', { size: 9, fill: C.ink, halo: true });

  // Legend
  const lx = 346;
  out += text(lx, 30, 'one dot = one difficulty epoch', { size: 10.5, weight: 700, fill: C.ink });
  out += text(lx, 45, `${RETARGET_INTERVAL.toLocaleString('en-US')} blocks ≈ 2 weeks`, { size: 9.5, fill: C.text });
  out += text(lx, 74, `${(SUBSIDY_INTERVAL / RETARGET_INTERVAL).toFixed(2)} epochs per halving era`, { size: 9.5, fill: C.text });
  out += line(lx, 90, lx + 14, 90, { stroke: C.ink, sw: 1.6 });
  out += text(lx + 20, 93, 'subsidy halves', { size: 9.5, fill: C.text });
  for (let e = 0; e < ERAS; e++) {
    const y = 124 + e * 22;
    out += circle(lx + 6, y - 4, 5, { fill: eraFill[e] });
    const from = (e * SUBSIDY_INTERVAL).toLocaleString('en-US');
    out += text(lx + 18, y, `era ${e} · ${formatBtc(subsidyForEra(e))} BTC`, { size: 9.5, weight: 700, fill: C.ink });
    out += text(lx + 18, y + 11, e ? `after ${from} blocks` : 'from genesis', { size: 8.5, fill: C.muted });
  }
  out += text(lx, 250, `${nEpochs} epochs shown`, { size: 9, fill: C.muted });
  out += text(lx, 262, `(${totalBlocks.toLocaleString('en-US')} blocks)`, { size: 9, fill: C.muted });

  return svgWrap(W, H, out);
}

// ---------------------------------------------------------------------------
// 8. Subsidy steps and cumulative supply
// ---------------------------------------------------------------------------

function subsidySupplyFigure() {
  const W = 560;
  const H = 372;
  const ERAS = 7;
  const x0 = 54;
  const x1 = 524;
  const hMax = ERAS * SUBSIDY_INTERVAL;
  const px = (h) => x0 + (h / hMax) * (x1 - x0);
  let out = '';

  // Panel A: subsidy per block
  const aTop = 42;
  const aBot = 142;
  const pyA = (btc) => aBot - (btc / 50) * (aBot - aTop);
  out += text(14, 14, 'block subsidy (BTC)', { size: 10, weight: 700, fill: C.ink });
  for (const v of [0, 12.5, 25, 50]) {
    out += line(x0, pyA(v), x1, pyA(v), { stroke: C.rule, sw: 0.7, dash: v ? '2 3' : null });
    out += text(x0 - 6, pyA(v) + 3.5, String(v), { size: 9, anchor: 'end', fill: C.muted });
  }
  for (let e = 0; e < ERAS; e++) {
    const s = Number(subsidyForEra(e)) / 1e8;
    const xa = px(e * SUBSIDY_INTERVAL) + 2;
    const xb = px((e + 1) * SUBSIDY_INTERVAL) - 2;
    out += rect(xa, pyA(s), xb - xa, aBot - pyA(s), { fill: e === 0 ? C.orange : C.orangeSoft, stroke: C.orange, sw: 1, rx: 1 });
    out += text((xa + xb) / 2, pyA(s) - 5, formatBtc(subsidyForEra(e)), { size: 9.5, weight: 700, anchor: 'middle', fill: C.ink });
  }
  out += line(x0, aBot, x1, aBot, { stroke: C.ink, sw: 1.2 });

  // Panel B: cumulative supply
  const bTop = 200;
  const bBot = 310;
  const MAXB = 21e6;
  const pyB = (btc) => bBot - (btc / MAXB) * (bBot - bTop);
  out += text(14, 180, 'coins issued (millions of BTC)', { size: 10, weight: 700, fill: C.ink });
  for (const v of [0, 5e6, 10e6, 15e6]) {
    out += line(x0, pyB(v), x1, pyB(v), { stroke: C.rule, sw: 0.7, dash: v ? '2 3' : null });
    out += text(x0 - 6, pyB(v) + 3.5, String(v / 1e6), { size: 9, anchor: 'end', fill: C.muted });
  }
  const total = Number(SCHEDULE.total) / 1e8;
  out += line(x0, pyB(total), x1, pyB(total), { stroke: C.ink, sw: 1, dash: '5 3' });
  out += text(x0 - 6, pyB(total) + 3.5, '21', { size: 9, anchor: 'end', fill: C.ink, weight: 700 });
  out += text(x1, pyB(total) + 15, `limit: ${formatBtc(SCHEDULE.total)} BTC`, { size: 9.5, anchor: 'end', fill: C.ink, weight: 700, halo: true });

  let d = `M ${px(0).toFixed(1)} ${pyB(0).toFixed(1)}`;
  for (let e = 0; e < ERAS; e++) {
    const cum = Number(SCHEDULE.eras[e].cumulative) / 1e8;
    d += ` L ${px((e + 1) * SUBSIDY_INTERVAL).toFixed(1)} ${pyB(cum).toFixed(1)}`;
  }
  out += path(d, { stroke: C.orange, sw: 2.4 });
  for (let e = 0; e < 4; e++) {
    const cum = Number(SCHEDULE.eras[e].cumulative) / 1e8;
    const x = px((e + 1) * SUBSIDY_INTERVAL);
    out += circle(x, pyB(cum), 3, { fill: C.ink });
    const pct = (100 * cum) / total;
    out += text(x + 5, pyB(cum) + 14, `${+pct.toFixed(2)}%`, { size: 9, fill: C.text, halo: true });
  }
  out += line(x0, bBot, x1, bBot, { stroke: C.ink, sw: 1.2 });

  // Shared x axis: height + nominal date
  for (let e = 0; e <= ERAS; e++) {
    const h = e * SUBSIDY_INTERVAL;
    const x = px(h);
    out += line(x, bBot, x, bBot + 4, { stroke: C.muted, sw: 1 });
    out += text(x, bBot + 16, e === 0 ? '0' : `${(h / 1000).toLocaleString('en-US')}k`, { size: 9, anchor: 'middle', fill: C.text });
    out += text(x, bBot + 29, nominalDate(h), { size: 8.5, anchor: 'middle', fill: C.muted });
  }
  out += text(x1, H - 8, 'block height; dates are nominal, at exactly 10 minutes per block from genesis', { size: 8.5, anchor: 'end', fill: C.muted });

  return svgWrap(W, H, out);
}

/**
 * HTML table rows for the halving schedule. Keyed to the tip height that
 * GetBlockValue reads (nBestHeight), not the height of the block being valued.
 */
function halvingTableHtml() {
  const rows = SCHEDULE.eras.filter((e) => e.era <= 4 || e.era >= 32);
  const total = SCHEDULE.total;
  let html = '';
  let gapShown = false;
  for (const e of rows) {
    if (e.era >= 32 && !gapShown) {
      html += '\n        <tr><td>…</td><td>…</td><td>…</td><td>…</td></tr>';
      gapShown = true;
    }
    const pct = e.subsidy === 0n ? '100' : (Number((e.cumulative * 1000000n) / total) / 10000).toFixed(4).replace(/\.?0+$/, '');
    html += `
        <tr><td>${e.era}</td><td>${e.firstBlock.toLocaleString('en-US')}${e.subsidy === 0n ? '+' : `–${(e.firstBlock + SUBSIDY_INTERVAL - 1).toLocaleString('en-US')}`}</td><td><code>${formatBtc(e.subsidy, { trim: false })}</code></td><td>${formatBtc(e.cumulative)} (${pct}%)</td></tr>`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// 9. The network: IRC bootstrap and gossip
// ---------------------------------------------------------------------------

function nodeGlyph(x, y, label, o = {}) {
  const { fill = C.paper, stroke = C.ink, r = 18, sub = null } = o;
  let s = circle(x, y, r, { fill, stroke, sw: 1.4 });
  s += text(x, y + 4, label, { size: 9.5, weight: 700, anchor: 'middle', fill: o.color ?? C.ink });
  if (sub) s += text(x, y + r + 13, sub, { size: 9, anchor: 'middle', fill: C.muted });
  return s;
}

function bootstrapIrcFigure() {
  const W = 560;
  const H = 290;
  const mk = markers('btc-irc', { gray: C.muted, orange: C.orange, blue: C.blue });
  let out = mk;

  // IRC server
  const sx = 188;
  const sy = 26;
  const sw = 184;
  const sh = 120;
  out += rect(sx, sy, sw, sh, { fill: C.wash, stroke: C.muted, sw: 1.2, rx: 6 });
  out += text(sx + sw / 2, sy + 18, 'chat.freenode.net:6667', { size: 10.5, weight: 700, anchor: 'middle', fill: C.ink });
  out += text(sx + sw / 2, sy + 32, 'IRC channel #bitcoin', { size: 9.5, anchor: 'middle', fill: C.text });
  const nicks = ['u4Qk8xN2…', 'u7Hn3pVa…', 'uLm2Wd9e…', 'uR5tYc1b…'];
  nicks.forEach((n, i) => {
    const x = sx + 12 + (i % 2) * 84;
    const y = sy + 44 + Math.floor(i / 2) * 30;
    out += rect(x, y, 76, 22, { fill: C.paper, stroke: C.faint, rx: 11 });
    out += text(x + 38, y + 15, n, { size: 9, anchor: 'middle', fill: C.text });
  });

  // New node
  const nx = 62;
  const ny = 190;
  out += nodeGlyph(nx, ny, 'you', { fill: C.orangeSoft, stroke: C.orange, r: 22, color: C.orangeDeep, sub: 'new node' });

  // Peers
  const peers = [
    { x: 496, y: 60, ip: '192.0.2.17' },
    { x: 510, y: 178, ip: '198.51.100.4' },
    { x: 470, y: 236, ip: '203.0.113.9' },
  ];
  for (const p of peers) {
    out += nodeGlyph(p.x, p.y, 'node', { sub: `${p.ip}:8333` });
    out += path(`M ${p.x - 20} ${p.y} Q ${(p.x + sx + sw) / 2} ${(p.y + sy + sh / 2) / 2} ${sx + sw + 4} ${sy + sh / 2}`, { stroke: C.faint, sw: 1, dash: '3 3' });
  }

  // ① register + join
  out += path(`M ${nx + 8} ${ny - 22} C ${nx + 20} 120, ${sx - 60} 70, ${sx - 4} 70`, { stroke: C.blue, sw: 1.5, marker: 'btc-irc-blue' });
  out += lines(14, 52, ['① NICK u + Base58Check(ip,port)', '   JOIN #bitcoin, WHO #bitcoin'], { size: 9, fill: C.blue, lh: 12, halo: true });
  // ② replies
  out += path(`M ${sx + 20} ${sy + sh + 4} C ${sx + 10} 190, ${nx + 70} 196, ${nx + 26} ${ny + 2}`, { stroke: C.blue, sw: 1.5, dash: '5 3', marker: 'btc-irc-blue' });
  out += lines(sx + 30, sy + sh + 16, ['② nick list → DecodeAddress()', '   → mapAddresses (addr.dat)'], { size: 9, fill: C.blue, lh: 12, halo: true });
  // ③ direct TCP
  for (const p of peers.slice(1)) {
    out += path(hCurve(nx + 24, ny + 4, p.x - 22, p.y), { stroke: C.orange, sw: 2, marker: 'btc-irc-orange' });
  }
  out += lines(200, 252, ['③ ThreadOpenConnections2: direct TCP to', '   port 8333, random /24 first, ≤ 15 nodes'], { size: 9, fill: C.orangeDeep, lh: 12, halo: true });
  out += text(W - 12, 18, 'peers also announce themselves', { size: 8.5, anchor: 'end', fill: C.muted });

  return svgWrap(W, H, out);
}

function meshGossipFigure() {
  const W = 560;
  const H = 318;
  const cx = 214;
  const cy = 158;
  const rings = [0, 54, 100, 146];
  const counts = [1, 5, 11, 17];
  const SY = 0.92;
  const rand = mulberry32(2009);
  const nodes = [];
  rings.forEach((r, hop) => {
    const n = counts[hop];
    const phase = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const rr = r + (hop ? (rand() - 0.5) * 14 : 0);
      nodes.push({ hop, a, x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) * SY });
    }
  });
  const angDist = (p, q) => {
    const d = Math.abs(p.a - q.a) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  };
  const tree = [];
  const extra = [];
  for (const n of nodes) {
    if (n.hop === 0) continue;
    const parents = nodes.filter((m) => m.hop === n.hop - 1).sort((p, q) => angDist(p, n) - angDist(q, n));
    tree.push([parents[0], n]);
    if (parents[1] && rand() < 0.45) extra.push([parents[1], n]);
  }
  for (let hop = 1; hop < rings.length; hop++) {
    const ring = nodes.filter((m) => m.hop === hop).sort((p, q) => p.a - q.a);
    ring.forEach((m, i) => {
      if (rand() < 0.4) extra.push([m, ring[(i + 1) % ring.length]]);
    });
  }

  let out = markers('btc-mesh', { orange: C.orange });
  for (const r of rings.slice(1)) {
    out += `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${(r * SY).toFixed(1)}" fill="none" stroke="${C.wash}" stroke-width="10"/>`;
  }
  for (const [a, b] of extra) out += line(a.x, a.y, b.x, b.y, { stroke: C.rule, sw: 1 });
  for (const [a, b] of tree) {
    const k = 9 / Math.hypot(b.x - a.x, b.y - a.y);
    out += line(a.x, a.y, b.x - (b.x - a.x) * k, b.y - (b.y - a.y) * k, { stroke: C.orange, sw: 1.4, marker: 'btc-mesh-orange' });
  }
  const fills = [C.orangeDeep, C.orange, '#fdba74', '#ffedd5'];
  for (const n of nodes) {
    out += circle(n.x, n.y, n.hop === 0 ? 9 : 6, { fill: fills[n.hop], stroke: C.ink, sw: n.hop === 0 ? 1.4 : 0.8 });
  }
  out += text(cx, cy + 24, 'origin', { size: 9, anchor: 'middle', fill: C.ink, halo: true, weight: 700 });

  const lx = 392;
  out += text(lx, 34, 'one relay, hop by hop', { size: 10.5, weight: 700, fill: C.ink });
  const legend = ['origin: new tx or block', 'hop 1: direct peers', 'hop 2', 'hop 3'];
  legend.forEach((s, i) => {
    const y = 60 + i * 20;
    out += circle(lx + 6, y - 4, i === 0 ? 7 : 5, { fill: fills[i], stroke: C.ink, sw: 0.8 });
    out += text(lx + 20, y, s, { size: 9.5, fill: C.text });
  });
  out += line(lx, 152, lx + 20, 152, { stroke: C.orange, sw: 1.4, marker: 'btc-mesh-orange' });
  out += text(lx + 26, 155, 'first delivery', { size: 9.5, fill: C.text });
  out += line(lx, 172, lx + 20, 172, { stroke: C.rule, sw: 1 });
  out += text(lx + 26, 175, 'redundant link', { size: 9.5, fill: C.text });
  out += lines(lx, 206, [
    'each hop: inv (hash only)',
    '→ getdata if unknown',
    '→ tx or block',
    'nodes that already have it',
    'answer nothing, so the',
    'flood stops by itself',
  ], { size: 9, fill: C.muted, lh: 13 });

  return svgWrap(W, H, out);
}

// ---------------------------------------------------------------------------
// 10. Message sequence
// ---------------------------------------------------------------------------

function messageSequenceFigure() {
  const W = 560;
  const AX = 210;
  const BX = 470;
  const msgs = [
    { from: 'A', name: 'version', note: 'nVersion, nServices, nTime, addrYou', where: 'CNode() on connect' },
    { from: 'B', name: 'version', note: 'sent by both sides, no verack', where: '' },
    { from: 'A', name: 'addr · getaddr', note: 'our address if routable; send yours', where: 'ThreadOpenConnections2' },
    { from: 'B', name: 'addr', note: 'addresses B knows', where: '' },
    { from: 'A', name: 'getblocks', note: 'CBlockLocator, hashStop = 0', where: 'first full node only' },
    { from: 'B', name: 'inv', note: 'MSG_BLOCK hash for every later block', where: '' },
    { from: 'A', name: 'getdata', note: 'the hashes A lacks', where: '' },
    { from: 'B', name: 'block', note: 'one message per block', where: 'ProcessBlock()' },
    { divider: 'later, whenever B accepts something new' },
    { from: 'B', name: 'inv', note: 'MSG_TX hash', where: 'RelayMessage()' },
    { from: 'A', name: 'getdata', note: '', where: '' },
    { from: 'B', name: 'tx', note: 'from B\'s mapRelay', where: 'AcceptTransaction()' },
  ];
  const STEP = 30;
  const TOP = 50;
  const H = TOP + msgs.length * STEP + 16;
  const mk = markers('btc-seq', { ink: C.ink, orange: C.orange });
  let out = mk;

  out += rect(AX - 60, 8, 120, 26, { fill: C.orangeSoft, stroke: C.orange });
  out += text(AX, 25, 'Node A (new)', { size: 10.5, weight: 700, anchor: 'middle', fill: C.orangeDeep });
  out += rect(BX - 60, 8, 120, 26, { fill: C.ink, stroke: null });
  out += text(BX, 25, 'Node B (peer)', { size: 10.5, weight: 700, anchor: 'middle', fill: C.paper });
  out += line(AX, 34, AX, H - 6, { stroke: C.faint, sw: 1, dash: '3 3' });
  out += line(BX, 34, BX, H - 6, { stroke: C.faint, sw: 1, dash: '3 3' });

  msgs.forEach((m, i) => {
    const y = TOP + i * STEP + 12;
    if (m.divider) {
      out += line(12, y - 2, W - 12, y - 2, { stroke: C.rule, sw: 0.8 });
      out += text((AX + BX) / 2, y + 2, m.divider, { size: 9, anchor: 'middle', fill: C.muted, italic: true, halo: true });
      return;
    }
    const [x1, x2] = m.from === 'A' ? [AX, BX] : [BX, AX];
    const color = m.from === 'A' ? C.orange : C.ink;
    const dir = Math.sign(x2 - x1);
    out += line(x1, y + 4, x2 - dir * 3, y + 4, { stroke: color, sw: 1.4, marker: m.from === 'A' ? 'btc-seq-orange' : 'btc-seq-ink' });
    out += text((AX + BX) / 2, y - 1, m.name, { size: 10.5, weight: 700, anchor: 'middle', fill: m.from === 'A' ? C.orangeDeep : C.ink });
    if (m.note) out += text((AX + BX) / 2, y + 15, m.note, { size: 8.5, anchor: 'middle', fill: C.muted });
    if (m.where) out += text(AX - 10, y + 5, m.where, { size: 8.5, anchor: 'end', fill: C.text });
  });

  return svgWrap(W, H, out);
}

// ---------------------------------------------------------------------------
// 11. Fork and reorganization
// ---------------------------------------------------------------------------

function forkReorgFigure() {
  const W = 560;
  const H = 262;
  const BW = 54;
  const BH = 34;
  const SX = 66;
  const mk = markers('btc-fork', { gray: C.muted, ink: C.ink });
  let out = mk;
  const mainY = 104;
  const topY = 40;
  const botY = 168;
  const X = (i) => 14 + i * SX;

  const block = (i, y, label, style) => {
    const st = {
      common: { fill: C.wash, stroke: C.muted, color: C.ink },
      old: { fill: C.paper, stroke: C.faint, color: C.muted, dash: '4 3' },
      best: { fill: C.orangeSoft, stroke: C.orange, color: C.orangeDeep },
    }[style];
    return rect(X(i), y - BH / 2, BW, BH, { fill: st.fill, stroke: st.stroke, sw: 1.3, dash: st.dash })
      + text(X(i) + BW / 2, y + 4, label, { size: 10.5, weight: 700, anchor: 'middle', fill: st.color });
  };
  // child → parent pointers (hashPrevBlock)
  const link = (i1, y1, i2, y2, color = C.muted) => path(
    `M ${X(i1)} ${y1} C ${X(i1) - 12} ${y1}, ${X(i2) + BW + 12} ${y2}, ${X(i2) + BW + 3} ${y2}`,
    { stroke: color, sw: 1.3, marker: color === C.ink ? 'btc-fork-ink' : 'btc-fork-gray' },
  );

  out += block(0, mainY, '1', 'common');
  out += block(1, mainY, '2', 'common');
  out += block(2, mainY, '3', 'common');
  out += link(1, mainY, 0, mainY);
  out += link(2, mainY, 1, mainY);
  // Old branch
  out += block(3, topY, '4', 'old');
  out += block(4, topY, '5', 'old');
  out += link(3, topY, 2, mainY);
  out += link(4, topY, 3, topY);
  // New branch
  out += block(3, botY, "4'", 'best');
  out += block(4, botY, "5'", 'best');
  out += block(5, botY, "6'", 'best');
  out += link(3, botY, 2, mainY, C.ink);
  out += link(4, botY, 3, botY, C.ink);
  out += link(5, botY, 4, botY, C.ink);

  out += text(X(2) + BW / 2, mainY + 32, 'pfork', { size: 9.5, weight: 700, anchor: 'middle', fill: C.ink });
  out += text(X(4) + BW + 10, topY - 4, 'old pindexBest (height 5)', { size: 9.5, fill: C.muted });
  out += text(X(4) + BW + 10, topY + 10, 'DisconnectBlock: its txs go', { size: 9, fill: C.text });
  out += text(X(4) + BW + 10, topY + 22, 'to vResurrect → memory pool', { size: 9, fill: C.text });
  out += text(X(5) + BW + 10, botY - 4, 'new pindexBest', { size: 9.5, weight: 700, fill: C.orangeDeep });
  out += text(X(5) + BW + 10, botY + 10, 'height 6 > nBestHeight 5', { size: 9, fill: C.text });
  out += text(X(5) + BW + 10, botY + 22, 'ConnectBlock, oldest first', { size: 9, fill: C.text });

  out += line(14, H - 46, W - 14, H - 46, { stroke: C.rule, sw: 0.8 });
  out += lines(14, H - 28, [
    'Reorganize(txdb, pindexNew): walk both tips back to the fork, disconnect the',
    'old branch newest-first, connect the new branch oldest-first, then set the best chain.',
  ], { size: 9.5, fill: C.text, lh: 14 });

  return svgWrap(W, H, out);
}

// ---------------------------------------------------------------------------
// 12. Life of a payment
// ---------------------------------------------------------------------------

function paymentLifecycleFigure() {
  const W = 640;
  const H = 300;
  const LY = 104;
  const steps = [
    { t: 'Build', f: 'CreateTransaction', n: ['pick coins until they cover', 'amount + fee; change back to you'] },
    { t: 'Sign', f: 'SignSignature', n: ['one scriptSig per input,', 'checked with EvalScript'] },
    { t: 'Commit', f: 'CommitTransactionSpent', n: ['wallet marks the', 'coins it used as spent'] },
    { t: 'Broadcast', f: 'AcceptTransaction', n: ['into mapTransactions,', 'then inv to every peer'] },
    { t: 'Mine', f: 'BitcoinMiner', n: ['some node includes', 'it in a block'] },
    { t: 'Confirm', f: 'GetDepthInMainChain', n: ['each block on top', 'adds one confirmation'] },
  ];
  const M = 82;
  const span = (W - 2 * M) / (steps.length - 1);
  const mk = markers('btc-life', { ink: C.ink });
  let out = mk;
  out += line(M, LY, W - M, LY, { stroke: C.ink, sw: 1.4 });
  steps.forEach((s, i) => {
    const x = M + i * span;
    const above = i % 2 === 0;
    out += circle(x, LY, 13, { fill: i >= 4 ? C.orange : C.ink });
    out += text(x, LY + 4, String(i + 1), { size: 11, weight: 700, anchor: 'middle', fill: C.paper });
    const y0 = above ? LY - 76 : LY + 32;
    out += line(x, above ? LY - 14 : LY + 14, x, above ? y0 + 42 : y0 - 10, { stroke: C.faint, sw: 1 });
    out += text(x, y0, s.t, { size: 11, weight: 700, anchor: 'middle', fill: C.ink });
    out += text(x, y0 + 13, `${s.f}()`, { size: 9, anchor: 'middle', fill: i >= 4 ? C.orangeDeep : C.blue, weight: 700 });
    out += lines(x, y0 + 27, s.n, { size: 8.5, anchor: 'middle', fill: C.muted, lh: 11 });
  });
  out += text(14, LY - 100 + 8, 'your node', { size: 9, fill: C.muted, italic: true });
  out += text(W - 14, LY - 100 + 8, 'the network', { size: 9, anchor: 'end', fill: C.muted, italic: true });

  // Maturity ruler for generated coins
  const RY = 236;
  const r0 = 82;
  const r1 = W - 82;
  const MAX = 150;
  const rx = (d) => r0 + (d / MAX) * (r1 - r0);
  out += text(r0, RY - 26, 'generated coins wait longer', { size: 10, weight: 700, fill: C.ink });
  out += rect(r0, RY - 8, rx(100) - r0, 16, { fill: C.wash, stroke: C.faint, rx: 2 });
  out += rect(rx(100), RY - 8, rx(120) - rx(100), 16, { fill: C.orangeSoft, stroke: C.orange, rx: 2 });
  out += rect(rx(120), RY - 8, r1 - rx(120), 16, { fill: C.orange, stroke: C.orange, rx: 2 });
  for (const [d, lab] of [[0, 'mined'], [100, '100'], [120, '120']]) {
    out += line(rx(d), RY - 12, rx(d), RY + 12, { stroke: C.ink, sw: 1.2 });
    out += text(rx(d), RY + 26, lab, { size: 9.5, weight: 700, anchor: 'middle', fill: C.ink });
  }
  out += text(rx(50), RY + 4, 'consensus forbids spending', { size: 9, anchor: 'middle', fill: C.text });
  out += text(rx(100), RY + 40, 'COINBASE_MATURITY', { size: 8.5, anchor: 'middle', fill: C.muted });
  out += text(rx(120) + 4, RY + 40, 'wallet waits +20', { size: 8.5, fill: C.muted });
  out += text(r1, RY + 26, 'blocks deep', { size: 9, anchor: 'end', fill: C.muted });
  out += text((rx(120) + r1) / 2, RY + 4, 'spendable', { size: 9, anchor: 'middle', weight: 700, fill: C.paper });

  return svgWrap(W, H, out);
}

export function getBitcoinPrimerFigures() {
  return {
    utxoGraph: utxoGraphFigure(),
    txAnatomy: txAnatomyFigure(),
    scriptTemplates: scriptTemplatesFigure(),
    scriptStackP2PK: scriptStackP2PKFigure(),
    scriptStackP2PKH: scriptStackP2PKHFigure(),
    blockChain: blockChainFigure(),
    miningLoop: miningLoopFigure(),
    retargetClamp: retargetClampFigure(),
    epochSpiral: epochSpiralFigure(),
    subsidySupply: subsidySupplyFigure(),
    halvingTable: halvingTableHtml(),
    bootstrapIrc: bootstrapIrcFigure(),
    meshGossip: meshGossipFigure(),
    messageSequence: messageSequenceFigure(),
    forkReorg: forkReorgFigure(),
    paymentLifecycle: paymentLifecycleFigure(),
  };
}
