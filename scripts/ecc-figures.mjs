/**
 * SVG diagrams for the ECC primer: real affine curve y² = x³ + 7 (a=0, b=7).
 * Includes a schematic “spatial” view (affine chart / slice metaphor) and a toy
 * F_p scatter inspired by modular/torus visualizations in embedded ECC primers.
 */

const A = 0;
const B = 7;

const STROKE = {
  curve: '#222',
  axis: '#9ca3af',
  axisStrong: '#6b7280',
  line: '#2563eb',
  tangent: '#7c3aed',
  point: '#111',
  grid: '#e5e7eb',
  guide: '#94a3b8',
  panelTitle: '#374151',
};

/** Crisp strokes when SVG is scaled (e.g. print/PDF) */
const VEC = ' vector-effect="non-scaling-stroke"';

function arrowDefs(suffix) {
  const id = `ecc-arrow-${suffix}`;
  return `
  <defs>
    <marker id="${id}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
      <polygon points="0 0, 5 2.5, 0 5" fill="${STROKE.guide}"/>
    </marker>
  </defs>`;
}

/** y² = x³ + ax + b over ℝ */
function yUpper(x) {
  const v = x * x * x + A * x + B;
  if (v < 0) return null;
  return Math.sqrt(v);
}

/** Third intersection of line through P and Q; P ≠ Q, x1 ≠ x2 */
function thirdPointDistinct(x1, y1, x2, y2) {
  const lam = (y2 - y1) / (x2 - x1);
  const x3 = lam * lam - x1 - x2;
  const y3 = lam * (x1 - x3) - y1;
  return { x: x3, y: y3, lam };
}

/** Third point for tangent at P (doubling) */
function thirdPointDouble(x1, y1) {
  const lam = (3 * x1 * x1 + A) / (2 * y1);
  const x3 = lam * lam - 2 * x1;
  const y3 = lam * (x1 - x3) - y1;
  return { x: x3, y: y3, lam };
}

function sampleCurve(xMin, xMax, steps) {
  const upper = [];
  const lower = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    const yu = yUpper(x);
    if (yu == null) continue;
    upper.push({ x, y: yu });
    lower.push({ x, y: -yu });
  }
  return { upper, lower };
}

function makeProjector(xMin, xMax, yMin, yMax, width, height, pad) {
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const sx = plotW / (xMax - xMin);
  const sy = plotH / (yMax - yMin);
  const scale = Math.min(sx, sy);
  const usedW = (xMax - xMin) * scale;
  const usedH = (yMax - yMin) * scale;
  const ox = pad + (plotW - usedW) / 2;
  const oy = pad + (plotH - usedH) / 2;

  return (x, y) => ({
    x: ox + (x - xMin) * scale,
    y: oy + (yMax - y) * scale,
  });
}

/** Skewed “chart in space”: same (x,y) mapped with shear + depth cue */
function makeShearProjector(xMin, xMax, yMin, yMax, ox, oy, sx, sy, shx, shy) {
  return (x, y) => ({
    x: ox + (x - xMin) * sx + (y - yMin) * shx,
    y: oy - (y - yMin) * sy - (x - xMin) * shy,
  });
}

function pathFromPoints(proj, pts) {
  if (pts.length === 0) return '';
  const [p0, ...rest] = pts;
  const q0 = proj(p0.x, p0.y);
  let d = `M ${q0.x.toFixed(2)} ${q0.y.toFixed(2)}`;
  for (const p of rest) {
    const q = proj(p.x, p.y);
    d += ` L ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
  }
  return d;
}

function linePath(proj, x1, y1, x2, y2) {
  const p1 = proj(x1, y1);
  const p2 = proj(x2, y2);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

function axesPath(proj, xMin, xMax, yMin, yMax) {
  const x0 = proj(0, yMin);
  const x1 = proj(0, yMax);
  const yAxis = `M ${x0.x.toFixed(2)} ${x0.y.toFixed(2)} L ${x1.x.toFixed(2)} ${x1.y.toFixed(2)}`;
  const y0 = proj(xMin, 0);
  const y1 = proj(xMax, 0);
  const xAxis = `M ${y0.x.toFixed(2)} ${y0.y.toFixed(2)} L ${y1.x.toFixed(2)} ${y1.y.toFixed(2)}`;
  return `${yAxis} ${xAxis}`;
}

function svgWrap(width, height, body, ariaHidden = true) {
  const ah = ariaHidden ? ' aria-hidden="true"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"${ah}>${body}</svg>`;
}

function dot(proj, x, y, r = 3.5) {
  const p = proj(x, y);
  return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r}" fill="${STROKE.point}"/>`;
}

function label(proj, x, y, text, dx = 6, dy = -6, size = 11) {
  const p = proj(x, y);
  return `<text x="${(p.x + dx).toFixed(2)}" y="${(p.y + dy).toFixed(2)}" font-family="Basis Grotesque Mono Pro, monospace" font-size="${size}" fill="${STROKE.panelTitle}">${text}</text>`;
}

/** Points on y² = x³ + 7 for construction diagrams */
const P_ADD = { x: 3, y: yUpper(3) };
const Q_ADD = { x: 5, y: yUpper(5) };
const RPRIME_ADD = thirdPointDistinct(P_ADD.x, P_ADD.y, Q_ADD.x, Q_ADD.y);
const R_ADD = { x: RPRIME_ADD.x, y: -RPRIME_ADD.y };

const P_DBL = { x: 2, y: yUpper(2) };
const RPRIME_DBL = thirdPointDouble(P_DBL.x, P_DBL.y);
const R2_DBL = { x: RPRIME_DBL.x, y: -RPRIME_DBL.y };

const X_MIN = -2.35;
const X_MAX = 8.25;
const Y_EXT = 14;

/**
 * 3-D surface  z = y² − x³ − 7  with orthographic projection + painter's algorithm.
 * The elliptic curve y² = x³ + 7 is the zero-contour where the surface crosses z = 0.
 */
/**
 * Stacked curve slices: y² = x³ + (7 + z) for z = −8…+8, step 2.
 * Each horizontal slice is one curve of the family; z = 0 is secp256k1 (red).
 */
function curveSpatialFigure() {
  const W = 700, H = 420;

  const PHI = Math.PI * 0.20;  // ~36° azimuth
  const EPS = Math.PI * 0.22;  // ~40° elevation — more foreshortening on z
  const cPhi = Math.cos(PHI), sPhi = Math.sin(PHI);
  const cEps = Math.cos(EPS), sEps = Math.sin(EPS);

  const SC = 20, CX = W * 0.42, CY = H * 0.58;

  function toSc(x, y, z) {
    const r = x * sPhi + y * cPhi;
    return {
      x: CX + (x * cPhi - y * sPhi) * SC,
      y: CY - (r * sEps + z * cEps) * SC,
    };
  }

  const X_MAX = 5.0, Y_CLIP = 5.2, STEPS = 280;

  // Z levels: −10…+6, step 1 — more slices below z=0. Draw bottom-to-top (back-to-front).
  const levels = [
    { z: -10, col: 'rgb(12,28,100)',   w: 0.65, op: 0.28 },
    { z:  -9, col: 'rgb(18,40,130)',   w: 0.70, op: 0.33 },
    { z:  -8, col: 'rgb(26,54,158)',   w: 0.75, op: 0.38 },
    { z:  -7, col: 'rgb(35,68,178)',   w: 0.82, op: 0.43 },
    { z:  -6, col: 'rgb(45,80,190)',   w: 0.9,  op: 0.50 },
    { z:  -5, col: 'rgb(60,105,205)',  w: 1.0,  op: 0.57 },
    { z:  -4, col: 'rgb(80,135,215)',  w: 1.1,  op: 0.64 },
    { z:  -3, col: 'rgb(110,160,220)', w: 1.2,  op: 0.72 },
    { z:  -2, col: 'rgb(140,185,225)', w: 1.3,  op: 0.80 },
    { z:  -1, col: 'rgb(175,205,235)', w: 1.4,  op: 0.88 },
    { z:   1, col: 'rgb(240,195,100)', w: 1.4,  op: 0.88 },
    { z:   2, col: 'rgb(235,170,70)',  w: 1.3,  op: 0.80 },
    { z:   3, col: 'rgb(228,145,50)',  w: 1.2,  op: 0.72 },
    { z:   4, col: 'rgb(220,118,35)',  w: 1.1,  op: 0.64 },
    { z:   5, col: 'rgb(208,90,25)',   w: 1.0,  op: 0.57 },
    { z:   6, col: 'rgb(192,60,15)',   w: 0.9,  op: 0.50 },
  ];

  function drawLevel(z, col, w, op) {
    const b = 7 + z;
    const xMin = Math.max(-2.7, Math.cbrt(-b) + (b <= 0 ? 0.08 : 0));
    const upper = [], lower = [];
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + (i / STEPS) * (X_MAX - xMin);
      const y2 = x * x * x + b;
      if (y2 < 0) continue;
      const y = Math.sqrt(y2);
      if (y > Y_CLIP) continue;
      upper.push(toSc(x,  y, z));
      lower.push(toSc(x, -y, z));
    }
    if (upper.length < 2) return '';
    const up = 'M ' + upper.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
    const lo = 'M ' + lower.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
    return `<path d="${up}" fill="none" stroke="${col}" stroke-width="${w}" opacity="${op}" stroke-linejoin="round"/>` +
           `<path d="${lo}" fill="none" stroke="${col}" stroke-width="${w}" opacity="${op}" stroke-linejoin="round"/>`;
  }

  // Draw non-zero levels first (back-to-front by z), then z=0 on top
  let curvesSvg = '';
  for (const lv of levels) curvesSvg += drawLevel(lv.z, lv.col, lv.w, lv.op);
  curvesSvg += drawLevel(0, '#dc2626', 2.6, 1.0);

  // Axes
  function seg(x1,y1,z1,x2,y2,z2,col='#aaa',sw=0.8,dash=''){
    const a=toSc(x1,y1,z1), b=toSc(x2,y2,z2);
    const da = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${col}" stroke-width="${sw}"${da}/>`;
  }
  function lbl(x,y,z,txt,dx,dy){
    const p=toSc(x,y,z);
    return `<text x="${(p.x+dx).toFixed(1)}" y="${(p.y+dy).toFixed(1)}" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" font-style="italic" fill="#555">${txt}</text>`;
  }

  const X0 = -2.8, Y0 = 5.5, Z0 = -11;
  const axes = `
    ${seg(X0, 0, Z0, 5.4, 0, Z0, '#999', 0.9)}
    ${seg(X0, -Y0, Z0, X0, Y0, Z0, '#999', 0.9)}
    ${seg(X0, 0, Z0, X0, 0, 7, '#999', 0.9)}
    ${lbl(5.5, 0, Z0, 'x', 0, 4)}
    ${lbl(X0, Y0+0.3, Z0, 'y', 0, 4)}
    ${lbl(X0, 0, 7.3, 'z', 4, 0)}
    ${seg(X0, 0, 0, 5.2, 0, 0, '#3b82f6', 0.5, '3,3')}`;

  // Legend — top-right, clear of y-axis and curves
  const LX = W - 258, LY = 44;
  const legend = `
    <rect x="${LX-4}" y="${LY-16}" width="248" height="90" rx="3" fill="rgba(255,255,255,0.96)" stroke="#ddd" stroke-width="0.8"/>
    <line x1="${LX+2}" y1="${LY}" x2="${LX+22}" y2="${LY}" stroke="#dc2626" stroke-width="2.5"/>
    <text x="${LX+28}" y="${LY+4}" font-family="Basis Grotesque Mono Pro, monospace" font-size="9.5" fill="#222">z = 0  secp256k1: y² = x³ + 7</text>
    <line x1="${LX+2}" y1="${LY+22}" x2="${LX+22}" y2="${LY+22}" stroke="rgb(80,135,215)" stroke-width="1.5" opacity="0.8"/>
    <text x="${LX+28}" y="${LY+26}" font-family="Basis Grotesque Mono Pro, monospace" font-size="9.5" fill="#555">z &lt; 0  y² = x³ + (7+z),  smaller b</text>
    <line x1="${LX+2}" y1="${LY+44}" x2="${LX+22}" y2="${LY+44}" stroke="rgb(228,145,50)" stroke-width="1.5" opacity="0.8"/>
    <text x="${LX+28}" y="${LY+48}" font-family="Basis Grotesque Mono Pro, monospace" font-size="9.5" fill="#555">z &gt; 0  y² = x³ + (7+z),  larger b</text>
    <text x="${LX+2}" y="${LY+68}" font-family="Basis Grotesque Mono Pro, monospace" font-size="8.5" fill="#999">17 slices, Δz = 1</text>`;

  const body = `
    <text x="12" y="18" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" font-weight="700" fill="#111">y² = x³ + (7+z)  —  curve family along z</text>
    <text x="12" y="32" font-family="Basis Grotesque Mono Pro, monospace" font-size="9" fill="#6b7280">Each slice is y² = x³ + b for b = 7+z; secp256k1 (red) lives at z = 0</text>
    ${legend}
    ${axes}
    ${curvesSvg}`;

  return svgWrap(W, H, body);
}

/** Toy prime field F_p, same cubic reduced mod p (cf. modular / torus pictures in ECC primers) */
const TOY_P = 17;

function mod(n, p) {
  let r = n % p;
  if (r < 0) r += p;
  return r;
}

function toyCurvePoints(p = TOY_P) {
  const pts = [];
  const sq = new Map();
  for (let y = 0; y < p; y++) sq.set(mod(y * y, p), y);
  for (let x = 0; x < p; x++) {
    const rhs = mod(x * x * x + B, p);
    if (!sq.has(rhs)) continue;
    const y0 = sq.get(rhs);
    pts.push({ x, y: y0 });
    const y1 = mod(-y0, p);
    if (y1 !== y0) pts.push({ x, y: y1 });
  }
  return pts;
}

function finiteFieldToyFigure() {
  const p = TOY_P;
  const pts = toyCurvePoints(p);
  const cell = 7;
  const pad = 36;
  const plot = p * cell;
  const w = pad + plot + pad + 168;
  const h = pad + plot + 56;

  const toPx = (xv, yv) => ({
    x: pad + xv * cell + cell / 2,
    y: pad + (p - 1 - yv) * cell + cell / 2,
  });

  let grid = '';
  for (let i = 0; i <= p; i++) {
    const x = pad + i * cell;
    const y = pad + i * cell;
    grid += `<line x1="${x}" y1="${pad}" x2="${x}" y2="${pad + plot}" stroke="${STROKE.grid}" stroke-width="0.6"${VEC}/>`;
    grid += `<line x1="${pad}" y1="${y}" x2="${pad + plot}" y2="${y}" stroke="${STROKE.grid}" stroke-width="0.6"${VEC}/>`;
  }

  const midY = pad + (p / 2) * cell;
  const midLine = `<line x1="${pad}" y1="${midY}" x2="${pad + plot}" y2="${midY}" stroke="#fb923c" stroke-width="1" stroke-dasharray="4 3" opacity="0.9"${VEC}/>`;

  let dots = '';
  for (const q of pts) {
    const c = toPx(q.x, q.y);
    dots += `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="3.2" fill="${STROKE.curve}"/>`;
  }

  const axX = pad + plot + 20;
  const note = `
    <text x="${axX}" y="${pad + 14}" font-family="Basis Grotesque Mono Pro, monospace" font-size="13" font-weight="700" fill="${STROKE.panelTitle}">Modular picture (toy field)</text>
    <text x="${axX}" y="${pad + 32}" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" fill="#444">Prime p = ${p}. Integer pairs (x, y) with</text>
    <text x="${axX}" y="${pad + 46}" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" fill="#444">y² ≡ x³ + 7 (mod p).</text>
    <text x="${axX}" y="${pad + 66}" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" fill="#444">Negation (x, y) ↦ (x, −y) is reflection</text>
    <text x="${axX}" y="${pad + 80}" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" fill="#444">across y = ${p}/2 (orange). With modulus,</text>
    <text x="${axX}" y="${pad + 94}" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" fill="#444">edges identify like a torus—unlike ℝ².</text>
  `;

  const title = `<text x="${pad}" y="${pad - 12}" font-family="Basis Grotesque Mono Pro, monospace" font-size="13" font-weight="700" fill="${STROKE.panelTitle}">F₁₇ (schematic grid)</text>`;

  const body = `
  ${title}
  <g stroke-linecap="round">${grid}${midLine}${dots}</g>
  ${note}
  <text x="${pad}" y="${h - 18}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" fill="#9ca3af">Not secp256k1’s field—only illustrates wrapping & symmetry.</text>`;

  return svgWrap(w, h, body);
}

function reflectionGuide(proj, x, yA, yB, suffix) {
  const p1 = proj(x, yA);
  const p2 = proj(x, yB);
  const xMid = (p1.x + p2.x) / 2;
  const yTop = Math.min(p1.y, p2.y) - 2;
  return `
    <path d="M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}"
      stroke="${STROKE.guide}" stroke-width="1.2" fill="none" stroke-dasharray="3 3" marker-end="url(#ecc-arrow-${suffix})"${VEC}/>
    <text x="${(xMid + 8).toFixed(2)}" y="${yTop.toFixed(2)}" font-family="Basis Grotesque Mono Pro, monospace" font-size="9.5" fill="${STROKE.guide}">reflect</text>`;
}

function pointAddFigure() {
  const yMin = -Y_EXT;
  const yMax = Y_EXT;
  const w = 520;
  const h = 252;
  const pad = 32;
  const proj = makeProjector(X_MIN, X_MAX, yMin, yMax, w, h, pad);
  const { upper, lower } = sampleCurve(Math.cbrt(-B) + 0.02, X_MAX, 220);

  const line = (t) => ({
    x: P_ADD.x + t * (Q_ADD.x - P_ADD.x),
    y: P_ADD.y + t * (Q_ADD.y - P_ADD.y),
  });
  const t0 = -0.42;
  const t1 = 1.48;
  const L0 = line(t0);
  const L1 = line(t1);

  const body = `
  ${arrowDefs('add')}
  <g stroke-linecap="round" stroke-linejoin="round">
    <path d="${axesPath(proj, X_MIN, X_MAX, yMin, yMax)}" stroke="${STROKE.axis}" stroke-width="1" fill="none"${VEC}/>
    <path d="${pathFromPoints(proj, upper)}" stroke="${STROKE.curve}" stroke-width="1.7" fill="none"${VEC}/>
    <path d="${pathFromPoints(proj, lower)}" stroke="${STROKE.curve}" stroke-width="1.7" fill="none"${VEC}/>
    <path d="${linePath(proj, L0.x, L0.y, L1.x, L1.y)}" stroke="${STROKE.line}" stroke-width="1.35" fill="none" stroke-dasharray="5 4"${VEC}/>
    ${reflectionGuide(proj, RPRIME_ADD.x, RPRIME_ADD.y, R_ADD.y, 'add')}
    ${dot(proj, P_ADD.x, P_ADD.y)}
    ${dot(proj, Q_ADD.x, Q_ADD.y)}
    ${dot(proj, RPRIME_ADD.x, RPRIME_ADD.y)}
    ${dot(proj, R_ADD.x, R_ADD.y)}
    ${label(proj, P_ADD.x, P_ADD.y, 'P', -20, -5)}
    ${label(proj, Q_ADD.x, Q_ADD.y, 'Q', -2, 16)}
    ${label(proj, RPRIME_ADD.x, RPRIME_ADD.y, "R′", 8, -10)}
    ${label(proj, R_ADD.x, R_ADD.y, 'R = P ⊕ Q', 8, 6, 10)}
    <text x="${w - pad - 2}" y="${h - pad + 4}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" font-style="italic" text-anchor="end" fill="${STROKE.axisStrong}">x</text>
    <text x="${pad + 2}" y="${pad + 10}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" font-style="italic" fill="${STROKE.axisStrong}">y</text>
  </g>`;

  return svgWrap(w, h, body);
}

function pointDoubleFigure() {
  const yMin = -Y_EXT;
  const yMax = Y_EXT;
  const w = 520;
  const h = 252;
  const pad = 32;
  const proj = makeProjector(X_MIN, X_MAX, yMin, yMax, w, h, pad);
  const { upper, lower } = sampleCurve(Math.cbrt(-B) + 0.02, X_MAX, 220);

  const { lam } = RPRIME_DBL;
  const span = 5.5;
  const L0 = { x: P_DBL.x - span, y: P_DBL.y - lam * span };
  const L1 = { x: P_DBL.x + span, y: P_DBL.y + lam * span };

  const body = `
  ${arrowDefs('dbl')}
  <g stroke-linecap="round" stroke-linejoin="round">
    <path d="${axesPath(proj, X_MIN, X_MAX, yMin, yMax)}" stroke="${STROKE.axis}" stroke-width="1" fill="none"${VEC}/>
    <path d="${pathFromPoints(proj, upper)}" stroke="${STROKE.curve}" stroke-width="1.7" fill="none"${VEC}/>
    <path d="${pathFromPoints(proj, lower)}" stroke="${STROKE.curve}" stroke-width="1.7" fill="none"${VEC}/>
    <path d="${linePath(proj, L0.x, L0.y, L1.x, L1.y)}" stroke="${STROKE.tangent}" stroke-width="1.35" fill="none"${VEC}/>
    ${reflectionGuide(proj, RPRIME_DBL.x, RPRIME_DBL.y, R2_DBL.y, 'dbl')}
    ${dot(proj, P_DBL.x, P_DBL.y)}
    ${dot(proj, RPRIME_DBL.x, RPRIME_DBL.y)}
    ${dot(proj, R2_DBL.x, R2_DBL.y)}
    ${label(proj, P_DBL.x, P_DBL.y, 'P', -18, -6)}
    ${label(proj, RPRIME_DBL.x, RPRIME_DBL.y, "R′", 8, -8)}
    ${label(proj, R2_DBL.x, R2_DBL.y, '2P = P ⊕ P', 8, 6, 10)}
    <text x="${w - pad - 2}" y="${h - pad + 4}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" font-style="italic" text-anchor="end" fill="${STROKE.axisStrong}">x</text>
    <text x="${pad + 2}" y="${pad + 10}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" font-style="italic" fill="${STROKE.axisStrong}">y</text>
  </g>`;

  return svgWrap(w, h, body);
}

/**
 * Torus figure — shows how F_p wraps in both x and y to form a torus topology.
 * Left: flat F_p scatter with identified edges highlighted.
 * Right: 3D torus with curve points mapped by (x/p, y/p) → (θ, φ).
 */
function torusFigure() {
  const W = 760, H = 330;
  const p = TOY_P;
  const curvePts = toyCurvePoints(p);

  /* ── LEFT PANEL: flat F_p grid ──────────────────────────────────────── */
  const cell = 9, flatPad = 36;
  const flatW = p * cell;
  const FX = 16, FY = H - flatPad - flatW;

  let flatGrid = '';
  for (let i = 0; i <= p; i++) {
    flatGrid += `<line x1="${FX + i*cell}" y1="${FY}" x2="${FX + i*cell}" y2="${FY+flatW}" stroke="#e5e7eb" stroke-width="0.6"/>`;
    flatGrid += `<line x1="${FX}" y1="${FY + i*cell}" x2="${FX+flatW}" y2="${FY + i*cell}" stroke="#e5e7eb" stroke-width="0.6"/>`;
  }
  // Identified edges (same-colour pairs will be glued)
  const orangeEdge = `stroke="#f97316" stroke-width="1.8" stroke-dasharray="3 2"`;
  const cyanEdge   = `stroke="#06b6d4" stroke-width="1.8" stroke-dasharray="3 2"`;
  flatGrid += `<line x1="${FX}" y1="${FY}" x2="${FX+flatW}" y2="${FY}" ${orangeEdge}/>`;
  flatGrid += `<line x1="${FX}" y1="${FY+flatW}" x2="${FX+flatW}" y2="${FY+flatW}" ${orangeEdge}/>`;
  flatGrid += `<line x1="${FX}" y1="${FY}" x2="${FX}" y2="${FY+flatW}" ${cyanEdge}/>`;
  flatGrid += `<line x1="${FX+flatW}" y1="${FY}" x2="${FX+flatW}" y2="${FY+flatW}" ${cyanEdge}/>`;

  // Curve dots
  let flatDots = '';
  for (const q of curvePts) {
    const cx = FX + q.x * cell + cell / 2;
    const cy = FY + (p - 1 - q.y) * cell + cell / 2;
    flatDots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.6" fill="#dc2626"/>`;
  }

  /* ── RIGHT PANEL: 3-D torus ─────────────────────────────────────────── */
  const R_t = 3.0, r_t = 1.35;  // major / minor radii

  const PHI_t = 0.42, EPS_t = 0.52;
  const cPt = Math.cos(PHI_t), sPt = Math.sin(PHI_t);
  const cEt = Math.cos(EPS_t), sEt = Math.sin(EPS_t);

  function projT(x, y, z) {
    const r = x * sPt + y * cPt;
    return { sx: x * cPt - y * sPt, sy: -(r * sEt + z * cEt), d: r * cEt - z * sEt };
  }

  const SC_t = 32, TCX = W * 0.70, TCY = H * 0.50;
  function toScT(x, y, z) {
    const p = projT(x, y, z);
    return { x: TCX + p.sx * SC_t, y: TCY + p.sy * SC_t, d: p.d };
  }

  function torusXYZ(theta, phi) {
    return {
      x: (R_t + r_t * Math.cos(phi)) * Math.cos(theta),
      y: (R_t + r_t * Math.cos(phi)) * Math.sin(theta),
      z: r_t * Math.sin(phi),
    };
  }

  // Build torus surface mesh
  const NT = 52, NP_t = 26;
  const TV = [];
  for (let i = 0; i <= NT; i++) {
    const row = [];
    for (let j = 0; j <= NP_t; j++) {
      const theta = (i / NT) * 2 * Math.PI;
      const phi   = (j / NP_t) * 2 * Math.PI;
      const wp = torusXYZ(theta, phi);
      const s  = toScT(wp.x, wp.y, wp.z);
      // Analytic torus normal
      const nx = Math.cos(phi) * Math.cos(theta);
      const ny = Math.cos(phi) * Math.sin(theta);
      const nz = Math.sin(phi);
      row.push({ ...s, nx, ny, nz });
    }
    TV.push(row);
  }

  const tFaces = [];
  for (let i = 0; i < NT; i++) {
    for (let j = 0; j < NP_t; j++) {
      const a = TV[i][j], b = TV[i+1][j], c = TV[i+1][j+1], d = TV[i][j+1];
      const dc = (a.d + b.d + c.d + d.d) / 4;
      const nx = (a.nx+b.nx+c.nx+d.nx)/4, ny = (a.ny+b.ny+c.ny+d.ny)/4, nz = (a.nz+b.nz+c.nz+d.nz)/4;
      const nl = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      const [lx, ly, lz] = [0.30, -0.20, 0.93];
      const ndl = Math.abs((nx/nl)*lx + (ny/nl)*ly + (nz/nl)*lz);
      tFaces.push({ a, b, c, d, dc, ndl });
    }
  }
  tFaces.sort((a, b) => b.dc - a.dc);

  let torusMesh = '';
  for (const f of tFaces) {
    const pts = [f.a, f.b, f.c, f.d].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const lit = 0.28 + 0.72 * f.ndl;
    const rv = Math.min(255, Math.round(200 * lit));
    const gv = Math.min(255, Math.round(215 * lit));
    const bv = Math.min(255, Math.round(235 * lit));
    const sv = Math.round(rv * 0.82);
    torusMesh += `<polygon points="${pts}" fill="rgb(${rv},${gv},${bv})" stroke="rgb(${sv},${Math.round(gv*0.82)},${Math.round(bv*0.82)})" stroke-width="0.3"/>`;
  }

  // Reference circles: longitude (orange) and meridian (cyan)
  const lonPts = [], merPts = [];
  for (let i = 0; i <= 80; i++) {
    const theta = (i / 80) * 2 * Math.PI;
    const wp = torusXYZ(theta, 0);
    const s = toScT(wp.x, wp.y, wp.z);
    lonPts.push(`${s.x.toFixed(1)},${s.y.toFixed(1)}`);
  }
  for (let j = 0; j <= 60; j++) {
    const phi = (j / 60) * 2 * Math.PI;
    const wp = torusXYZ(0, phi);
    const s = toScT(wp.x, wp.y, wp.z);
    merPts.push(`${s.x.toFixed(1)},${s.y.toFixed(1)}`);
  }

  // Curve dots mapped onto torus surface
  const dotData = curvePts.map(q => {
    const theta = (q.x / p) * 2 * Math.PI;
    const phi   = (q.y / p) * 2 * Math.PI;
    const wp = torusXYZ(theta, phi);
    return toScT(wp.x, wp.y, wp.z);
  });
  dotData.sort((a, b) => b.d - a.d);
  const dRange = R_t + r_t;
  let torusDots = '';
  for (const pt of dotData) {
    const alpha = (0.30 + 0.70 * Math.min(1, Math.max(0, (pt.d + dRange) / (2 * dRange)))).toFixed(2);
    torusDots += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.2" fill="#dc2626" opacity="${alpha}"/>`;
  }

  /* ── Arrow between panels ────────────────────────────────────────────── */
  const AX = FX + flatW + 22, AY = H / 2 - 10;
  const arrow = `
    <path d="M ${AX} ${AY} L ${AX+34} ${AY}" stroke="#666" stroke-width="1.4" fill="none" marker-end="url(#ecc-arrow-tor)"/>
    <text x="${AX+2}" y="${AY-6}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" fill="#555">identify</text>
    <text x="${AX+2}" y="${AY+16}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" fill="#555">both pairs</text>`;

  const body = `
    <defs>
      <marker id="ecc-arrow-tor" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
        <polygon points="0 0, 5 2.5, 0 5" fill="#666"/>
      </marker>
    </defs>

    <text x="12" y="18" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" font-weight="600" fill="#111">From flat grid to torus: modular wrapping in both axes</text>

    ${flatGrid}
    ${flatDots}

    <text x="${FX}" y="${FY - 20}" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" font-weight="700" fill="#374151">𝔽₁₇  (p = 17)</text>
    <text x="${FX}" y="${FY - 7}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" fill="#555">● = y² ≡ x³ + 7 (mod 17)</text>
    <text x="${FX}" y="${FY + flatW + 15}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" fill="#f97316">— top = bottom  (wrap → latitude)</text>
    <text x="${FX}" y="${FY + flatW + 28}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" fill="#06b6d4">— left = right  (wrap → longitude)</text>

    ${arrow}

    ${torusMesh}
    <polyline points="${lonPts.join(' ')}" fill="none" stroke="#f97316" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.75"/>
    <polyline points="${merPts.join(' ')}" fill="none" stroke="#06b6d4" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.75"/>
    ${torusDots}

    <text x="${TCX - 55}" y="${H - 16}" font-family="Basis Grotesque Mono Pro, monospace" font-size="11" font-weight="700" fill="#374151">Torus  (𝔽₁₇ curve points mapped)</text>
    <text x="${TCX - 55}" y="${H - 4}" font-family="Basis Grotesque Mono Pro, monospace" font-size="10" fill="#555">secp256k1 uses p ≈ 2²⁵⁶ — same topology, incomprehensibly larger</text>`;

  return svgWrap(W, H, body);
}

/**
 * Step-by-step: flat square → cylinder → torus.
 * Shows edge identification with labelled arrows (a, b).
 */
function planeToTorusFigure() {
  const W = 700, H = 208;
  const F = `font-family="Basis Grotesque Mono Pro, monospace"`;

  const defs = `<defs>
    <marker id="ptt-arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <polygon points="0 0.5, 7 4, 0 7.5" fill="#222"/>
    </marker>
    <marker id="ptt-arr-step" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <polygon points="0 0.5, 7 4, 0 7.5" fill="#666"/>
    </marker>
  </defs>`;

  // Arrow at midpoint of edge (from 60% toward 40%)
  function edgeArr(x1, y1, x2, y2) {
    const ax = x1 + 0.60*(x2-x1), ay = y1 + 0.60*(y2-y1);
    const bx = x1 + 0.40*(x2-x1), by = y1 + 0.40*(y2-y1);
    return `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#222" stroke-width="1.6" marker-end="url(#ptt-arr)"/>`;
  }

  // ── 1. Square ──────────────────────────────────────────────────────────────
  const SX = 28, SY = 44, SW = 96, SH = 96;
  const square = `
    <rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" fill="#f4f4f4" stroke="#222" stroke-width="1.5"/>
    ${edgeArr(SX+SW, SY,    SX,    SY)}
    ${edgeArr(SX+SW, SY+SH, SX,    SY+SH)}
    ${edgeArr(SX,    SY+SH, SX,    SY)}
    ${edgeArr(SX+SW, SY+SH, SX+SW, SY)}
    <text x="${SX+SW/2}" y="${SY-8}"      ${F} font-size="14" font-style="italic" text-anchor="middle" fill="#222">a</text>
    <text x="${SX+SW/2}" y="${SY+SH+17}"  ${F} font-size="14" font-style="italic" text-anchor="middle" fill="#222">a</text>
    <text x="${SX-14}"   y="${SY+SH/2+5}" ${F} font-size="14" font-style="italic" text-anchor="middle" fill="#222">b</text>
    <text x="${SX+SW+14}" y="${SY+SH/2+5}" ${F} font-size="14" font-style="italic" text-anchor="middle" fill="#222">b</text>
    <text x="${SX+SW/2}" y="${SY+SH+32}" ${F} font-size="9" text-anchor="middle" fill="#aaa">flat square</text>`;

  // ── Arrow 1 ────────────────────────────────────────────────────────────────
  const A1X = SX + SW + 12, AY = SY + SH/2;
  const arr1 = `
    <line x1="${A1X}" y1="${AY}" x2="${A1X+24}" y2="${AY}" stroke="#888" stroke-width="1.5" marker-end="url(#ptt-arr-step)"/>
    <text x="${A1X+12}" y="${AY-8}" ${F} font-size="9" text-anchor="middle" fill="#888">glue a</text>`;

  // ── 2. Cylinder ────────────────────────────────────────────────────────────
  const CX = 210, CYT = 53, CH = 88, CRX = 27, CRY = 11, CYB = CYT + CH;
  const cylinder = `
    <line x1="${CX-CRX}" y1="${CYT}" x2="${CX-CRX}" y2="${CYB}" stroke="#222" stroke-width="1.5"/>
    <line x1="${CX+CRX}" y1="${CYT}" x2="${CX+CRX}" y2="${CYB}" stroke="#222" stroke-width="1.5"/>
    <ellipse cx="${CX}" cy="${CYT}" rx="${CRX}" ry="${CRY}" fill="none" stroke="#222" stroke-width="1.5"/>
    <ellipse cx="${CX}" cy="${CYB}" rx="${CRX}" ry="${CRY}" fill="none" stroke="#222" stroke-width="1.5" stroke-dasharray="5,3"/>
    ${edgeArr(CX+8, CYT-CRY+5, CX-8, CYT-CRY+5)}
    ${edgeArr(CX+8, CYB+CRY-5, CX-8, CYB+CRY-5)}
    <text x="${CX+CRX+7}" y="${CYT+5}"  ${F} font-size="14" font-style="italic" fill="#222">b</text>
    <text x="${CX+CRX+7}" y="${CYB+5}"  ${F} font-size="14" font-style="italic" fill="#222">b</text>
    <text x="${CX}" y="${CYB+CRY+20}" ${F} font-size="9" text-anchor="middle" fill="#aaa">cylinder (a→a)</text>`;

  // ── Arrow 2 ────────────────────────────────────────────────────────────────
  const A2X = CX + CRX + 14;
  const arr2 = `
    <line x1="${A2X}" y1="${AY}" x2="${A2X+24}" y2="${AY}" stroke="#888" stroke-width="1.5" marker-end="url(#ptt-arr-step)"/>
    <text x="${A2X+12}" y="${AY-8}" ${F} font-size="9" text-anchor="middle" fill="#888">glue b</text>`;

  // ── 3. Bent cylinder (C-shape) ─────────────────────────────────────────────
  // A U-shaped tube with matching open ends facing each other
  const BX = 335, BY = 104;
  // The U-shape: outer arc (large) + inner arc (small) + two tubes
  const BR = 36; // bend radius (center of tube follows this arc)
  const Br = 14; // tube radius
  const bk = 0.42; // foreshortening for tube cross-section ellipses
  // Outer bend arc (bottom of U) — concave up
  // The U spans from left top (BX-BR, BY-40) going around to right top (BX+BR, BY-40)
  const btop = BY - 62;
  const bent = `
    <!-- tube outer wall -->
    <path d="M${BX-BR-Br},${btop} Q${BX-BR-Br},${BY+Br} ${BX},${BY+Br} Q${BX+BR+Br},${BY+Br} ${BX+BR+Br},${btop}"
          fill="none" stroke="#222" stroke-width="1.5"/>
    <!-- tube inner wall -->
    <path d="M${BX-BR+Br},${btop} Q${BX-BR+Br},${BY-Br} ${BX},${BY-Br} Q${BX+BR-Br},${BY-Br} ${BX+BR-Br},${btop}"
          fill="none" stroke="#222" stroke-width="1.5"/>
    <!-- left open end (top-left) — ellipse -->
    <ellipse cx="${BX-BR}" cy="${btop}" rx="${Br}" ry="${Br*bk}" fill="none" stroke="#222" stroke-width="1.5"/>
    <!-- right open end (top-right) — ellipse, dashed (far side) -->
    <ellipse cx="${BX+BR}" cy="${btop}" rx="${Br}" ry="${Br*bk}" fill="none" stroke="#222" stroke-width="1.5"/>
    <!-- b-arrows on open ends pointing same direction (to be identified) -->
    ${edgeArr(BX-BR+6, btop-Br*bk+3.5, BX-BR-6, btop-Br*bk+3.5)}
    ${edgeArr(BX+BR+6, btop-Br*bk+3.5, BX+BR-6, btop-Br*bk+3.5)}
    <text x="${BX-BR}" y="${btop-Br*bk-6}" ${F} font-size="11" font-style="italic" text-anchor="middle" fill="#222">b</text>
    <text x="${BX+BR}" y="${btop-Br*bk-6}" ${F} font-size="11" font-style="italic" text-anchor="middle" fill="#222">b</text>
    <text x="${BX}" y="${BY+Br+20}" ${F} font-size="9" text-anchor="middle" fill="#aaa">bent tube (a→a, bend)</text>`;

  // ── Arrow 3 ────────────────────────────────────────────────────────────────
  const A3X = BX + BR + Br + 14;
  const arr3 = `
    <line x1="${A3X}" y1="${AY}" x2="${A3X+24}" y2="${AY}" stroke="#888" stroke-width="1.5" marker-end="url(#ptt-arr-step)"/>
    <text x="${A3X+12}" y="${AY-8}" ${F} font-size="9" text-anchor="middle" fill="#888">glue b</text>`;

  // ── 4. Torus schematic ─────────────────────────────────────────────────────
  const TX = 596, TY = 102;
  const Rmaj = 56, Rmin = 21, kT = 0.44;
  const oRx = Rmaj + Rmin, oRy = (Rmaj + Rmin) * kT;  // 77, 33.9
  const iRx = Rmaj - Rmin, iRy = (Rmaj - Rmin) * kT;  // 35, 15.4
  const tubeRy = (Rmin * kT).toFixed(2);               // half-height of tube cross-section ellipse

  // Even-odd donut fill
  const donutFill = `M ${TX-oRx},${TY} A ${oRx},${oRy} 0 1 1 ${TX+oRx},${TY} A ${oRx},${oRy} 0 1 1 ${TX-oRx},${TY} Z ` +
                    `M ${TX-iRx},${TY} A ${iRx},${iRy} 0 1 1 ${TX+iRx},${TY} A ${iRx},${iRy} 0 1 1 ${TX-iRx},${TY} Z`;

  const torus = `
    <!-- filled donut body -->
    <path d="${donutFill}" fill="#efefef" fill-rule="evenodd" stroke="none"/>
    <!-- outer ring -->
    <ellipse cx="${TX}" cy="${TY}" rx="${oRx}" ry="${oRy}" fill="none" stroke="#222" stroke-width="1.5"/>
    <!-- inner hole -->
    <ellipse cx="${TX}" cy="${TY}" rx="${iRx}" ry="${iRy}" fill="none" stroke="#222" stroke-width="1.5"/>
    <!-- left near-side tube arc (lower half-ellipse, visible) -->
    <path d="M ${TX-Rmaj-Rmin},${TY} A ${Rmin},${tubeRy} 0 0 1 ${TX-Rmaj+Rmin},${TY}"
          fill="none" stroke="#222" stroke-width="1.5"/>
    <!-- right near-side tube arc -->
    <path d="M ${TX+Rmaj-Rmin},${TY} A ${Rmin},${tubeRy} 0 0 1 ${TX+Rmaj+Rmin},${TY}"
          fill="none" stroke="#222" stroke-width="1.5"/>
    <!-- left far-side arc (upper half-ellipse, hidden) -->
    <path d="M ${TX-Rmaj-Rmin},${TY} A ${Rmin},${tubeRy} 0 0 0 ${TX-Rmaj+Rmin},${TY}"
          fill="none" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
    <!-- right far-side arc -->
    <path d="M ${TX+Rmaj-Rmin},${TY} A ${Rmin},${tubeRy} 0 0 0 ${TX+Rmaj+Rmin},${TY}"
          fill="none" stroke="#bbb" stroke-width="1.2" stroke-dasharray="5,3"/>
    <text x="${TX}" y="${TY+oRy+20}" ${F} font-size="9" text-anchor="middle" fill="#aaa">torus (a and b glued)</text>`;

  const body = `
    ${defs}
    <text x="14" y="18" ${F} font-size="11" font-weight="700" fill="#111">From flat square to torus: identifying opposite edges</text>
    ${square}
    ${arr1}
    ${cylinder}
    ${arr2}
    ${bent}
    ${arr3}
    ${torus}`;

  return svgWrap(W, H, body);
}

export function getEccPrimerFigures() {
  return {
    curveSpatial: curveSpatialFigure(),
    finiteFieldToy: finiteFieldToyFigure(),
    planeToTorus: planeToTorusFigure(),
    torus: torusFigure(),
    pointAdd: pointAddFigure(),
    pointDouble: pointDoubleFigure(),
  };
}
