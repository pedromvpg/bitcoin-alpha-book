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

/**
 * Algebraic group-law formulas return the *sum* R = P ⊕ Q (already reflected).
 * The third curve intersection on the chord/tangent is R′ = (x, −y_R).
 */
function sumDistinct(x1, y1, x2, y2) {
  const lam = (y2 - y1) / (x2 - x1);
  const x = lam * lam - x1 - x2;
  const y = lam * (x1 - x) - y1;
  return { x, y, lam };
}

function sumDouble(x1, y1) {
  const lam = (3 * x1 * x1 + A) / (2 * y1);
  const x = lam * lam - 2 * x1;
  const y = lam * (x1 - x) - y1;
  return { x, y, lam };
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

/** Demo points — compact so constructions fit a readable zoom window */
const P_ADD = { x: 2, y: yUpper(2) };
const Q_ADD = { x: 3, y: yUpper(3) };
const R_ADD = sumDistinct(P_ADD.x, P_ADD.y, Q_ADD.x, Q_ADD.y); // P ⊕ Q
const RPRIME_ADD = { x: R_ADD.x, y: -R_ADD.y }; // third intersection on the chord

const P_DBL = { x: 2, y: yUpper(2) };
const R2_DBL = sumDouble(P_DBL.x, P_DBL.y); // 2P
const RPRIME_DBL = { x: R2_DBL.x, y: -R2_DBL.y };

/** Shared framing for op figures — room for labels without cropping */
const OP_VIEW = { xMin: -3.0, xMax: 4.4, yMin: -5.2, yMax: 7.2 };


/**
 * Stacked curve slices: y² = x³ + (7 + z) for integer z.
 * Each horizontal slice is one Weierstrass curve; z = 0 is secp256k1 (red).
 * Titles / legend live in HTML (build.js); SVG is diagram-only.
 */
function curveSpatialFigure() {
  const W = 720, H = 400;

  const PHI = Math.PI * 0.18;
  const EPS = Math.PI * 0.24;
  const cPhi = Math.cos(PHI), sPhi = Math.sin(PHI);
  const cEps = Math.cos(EPS), sEps = Math.sin(EPS);

  const SC = 22, CX = W * 0.44, CY = H * 0.56;

  function toSc(x, y, z) {
    const r = x * sPhi + y * cPhi;
    return {
      x: CX + (x * cPhi - y * sPhi) * SC,
      y: CY - (r * sEps + z * cEps) * SC,
    };
  }

  const X_MAX = 5.0, Y_CLIP = 5.0, STEPS = 320;
  const Z_LO = -8, Z_HI = 6;

  // Cool below z=0 (cyan family), warm above (orange family) — same language as torus figures
  function levelStyle(z) {
    if (z === 0) return { col: '#dc2626', w: 2.4, op: 1 };
    const t = z < 0 ? (z - Z_LO) / (0 - Z_LO) : (z - 0) / (Z_HI - 0); // 0 far → 1 near zero
    if (z < 0) {
      // deep blue → ECC cyan
      const u = 0.25 + 0.75 * t;
      return {
        col: `rgb(${Math.round(6 + 0 * u)}, ${Math.round(80 + 102 * u)}, ${Math.round(140 + 72 * u)})`,
        w: 0.7 + 0.7 * t,
        op: 0.28 + 0.62 * t,
      };
    }
    const u = 1 - t; // near zero brighter
    return {
      col: `rgb(${Math.round(180 + 69 * (1 - u))}, ${Math.round(90 + 25 * (1 - u))}, ${Math.round(20 + 5 * (1 - u))})`,
      w: 0.7 + 0.7 * (1 - u),
      op: 0.28 + 0.62 * (1 - u),
    };
  }

  function drawLevel(z) {
    const { col, w, op } = levelStyle(z);
    const b = 7 + z;
    const xMin = Math.max(-2.7, Math.cbrt(-b) + (b <= 0 ? 0.08 : 0));
    const upper = [], lower = [];
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + (i / STEPS) * (X_MAX - xMin);
      const y2 = x * x * x + b;
      if (y2 < 0) continue;
      const y = Math.sqrt(y2);
      if (y > Y_CLIP) continue;
      upper.push(toSc(x, y, z));
      lower.push(toSc(x, -y, z));
    }
    if (upper.length < 2) return '';
    const up = 'M ' + upper.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
    const lo = 'M ' + lower.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
    return `<path d="${up}" fill="none" stroke="${col}" stroke-width="${w.toFixed(2)}" opacity="${op.toFixed(2)}" stroke-linejoin="round"${VEC}/>` +
           `<path d="${lo}" fill="none" stroke="${col}" stroke-width="${w.toFixed(2)}" opacity="${op.toFixed(2)}" stroke-linejoin="round"${VEC}/>`;
  }

  // Painter order: far (low z) → near (high z), secp256k1 last
  let curvesSvg = '';
  for (let z = Z_LO; z <= Z_HI; z++) {
    if (z === 0) continue;
    curvesSvg += drawLevel(z);
  }
  curvesSvg += drawLevel(0);

  function seg(x1, y1, z1, x2, y2, z2, col = '#94a3b8', sw = 0.9, dash = '', marker = '') {
    const a = toSc(x1, y1, z1), b = toSc(x2, y2, z2);
    const da = dash ? ` stroke-dasharray="${dash}"` : '';
    const mk = marker ? ` marker-end="url(#${marker})"` : '';
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${col}" stroke-width="${sw}"${da}${mk}${VEC}/>`;
  }
  function lbl(x, y, z, txt, dx, dy) {
    const p = toSc(x, y, z);
    return `<text x="${(p.x + dx).toFixed(1)}" y="${(p.y + dy).toFixed(1)}" font-family="${FONT_MONO}" font-size="11" font-style="italic" fill="${STROKE.axisStrong}">${txt}</text>`;
  }

  // z = 0 plane (parallelogram) — makes the red slice read as “the” chart
  const planeCorners = [
    toSc(-2.4, -4.6, 0),
    toSc(5.0, -4.6, 0),
    toSc(5.0, 4.6, 0),
    toSc(-2.4, 4.6, 0),
  ];
  const planePts = planeCorners.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const plane = `
    <polygon points="${planePts}" fill="rgba(220,38,38,0.06)" stroke="#dc2626" stroke-width="0.7" opacity="0.85"${VEC}/>
    ${seg(-2.4, 0, 0, 5.0, 0, 0, '#dc2626', 0.55, '4,3')}
    ${lbl(5.05, 0, 0, 'z = 0', 6, -2)}`;

  const X0 = -2.6, Y0 = 5.0, Z0 = -9;
  const axes = `
    <defs>
      <marker id="ecc-arr-cs-x" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="0 0.5, 6 3, 0 5.5" fill="${STROKE.axisStrong}"/>
      </marker>
      <marker id="ecc-arr-cs-y" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="0 0.5, 6 3, 0 5.5" fill="${STROKE.axisStrong}"/>
      </marker>
      <marker id="ecc-arr-cs-z" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="0 0.5, 6 3, 0 5.5" fill="${STROKE.axisStrong}"/>
      </marker>
    </defs>
    ${seg(X0, 0, Z0, 5.4, 0, Z0, STROKE.axisStrong, 1.0, '', 'ecc-arr-cs-x')}
    ${seg(X0, -Y0, Z0, X0, Y0, Z0, STROKE.axisStrong, 1.0, '', 'ecc-arr-cs-y')}
    ${seg(X0, 0, Z0, X0, 0, 7.2, STROKE.axisStrong, 1.0, '', 'ecc-arr-cs-z')}
    ${lbl(5.55, 0, Z0, 'x', 0, 4)}
    ${lbl(X0, Y0 + 0.25, Z0, 'y', -2, 4)}
    ${lbl(X0, 0, 7.5, 'z', 5, 0)}`;

  // Tiny in-figure key (no floating white box) — full legend is HTML
  const keyX = W - 148, keyY = 22;
  const miniKey = `
    <line x1="${keyX}" y1="${keyY}" x2="${keyX + 18}" y2="${keyY}" stroke="#dc2626" stroke-width="2.4"${VEC}/>
    <text x="${keyX + 24}" y="${keyY + 3.5}" font-family="${FONT_MONO}" font-size="9.5" fill="#374151">secp256k1</text>
    <line x1="${keyX}" y1="${keyY + 16}" x2="${keyX + 18}" y2="${keyY + 16}" stroke="${ECC_CYAN}" stroke-width="1.5"${VEC}/>
    <text x="${keyX + 24}" y="${keyY + 19.5}" font-family="${FONT_MONO}" font-size="9.5" fill="#6b7280">z &lt; 0</text>
    <line x1="${keyX}" y1="${keyY + 32}" x2="${keyX + 18}" y2="${keyY + 32}" stroke="${ECC_ORANGE}" stroke-width="1.5"${VEC}/>
    <text x="${keyX + 24}" y="${keyY + 35.5}" font-family="${FONT_MONO}" font-size="9.5" fill="#6b7280">z &gt; 0</text>`;

  const body = `
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      ${axes}
      ${plane}
      ${curvesSvg}
      ${miniKey}
    </g>`;

  return svgWrap(W, H, body);
}

/** Toy prime field F_p, same cubic reduced mod p (cf. modular / torus pictures in ECC primers) */
const TOY_P = 17;
const ECC_ORANGE = '#f97316';
const ECC_CYAN = '#06b6d4';
const FONT_MONO = 'Basis Grotesque Mono Pro, monospace';

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
  const cell = 16;
  const leftPad = 36;
  const topPad = 12; // title lives in HTML caption (build.js)
  const rightPad = 58; // room for "y = p/2"
  const plot = p * cell;
  const w = leftPad + plot + rightPad;
  const h = topPad + plot + 36; // room for axis labels under the grid

  const toPx = (xv, yv) => ({
    x: leftPad + xv * cell + cell / 2,
    y: topPad + (p - 1 - yv) * cell + cell / 2,
  });

  let grid = '';
  for (let i = 0; i <= p; i++) {
    const x = leftPad + i * cell;
    const y = topPad + i * cell;
    grid += `<line x1="${x}" y1="${topPad}" x2="${x}" y2="${topPad + plot}" stroke="${STROKE.grid}" stroke-width="0.6"${VEC}/>`;
    grid += `<line x1="${leftPad}" y1="${y}" x2="${leftPad + plot}" y2="${y}" stroke="${STROKE.grid}" stroke-width="0.6"${VEC}/>`;
  }

  // Axis ticks at 0, 8, 16
  const tickVals = [0, 8, 16];
  let ticks = '';
  for (const t of tickVals) {
    const px = leftPad + t * cell + cell / 2;
    const py = topPad + (p - 1 - t) * cell + cell / 2;
    ticks += `<text x="${px.toFixed(1)}" y="${topPad + plot + 14}" font-family="${FONT_MONO}" font-size="9" text-anchor="middle" fill="${STROKE.axisStrong}">${t}</text>`;
    ticks += `<text x="${leftPad - 6}" y="${(py + 3).toFixed(1)}" font-family="${FONT_MONO}" font-size="9" text-anchor="end" fill="${STROKE.axisStrong}">${t}</text>`;
  }
  ticks += `<text x="${leftPad + plot / 2}" y="${topPad + plot + 26}" font-family="${FONT_MONO}" font-size="10" font-style="italic" text-anchor="middle" fill="${STROKE.axisStrong}">x</text>`;
  ticks += `<text x="${leftPad - 22}" y="${topPad + plot / 2}" font-family="${FONT_MONO}" font-size="10" font-style="italic" text-anchor="middle" fill="${STROKE.axisStrong}">y</text>`;

  const midY = topPad + (p / 2) * cell;
  const midLine = `
    <line x1="${leftPad}" y1="${midY}" x2="${leftPad + plot}" y2="${midY}" stroke="${ECC_ORANGE}" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.95"${VEC}/>
    <text x="${leftPad + plot + 6}" y="${midY + 4}" font-family="${FONT_MONO}" font-size="10" fill="${ECC_ORANGE}">y = p/2</text>`;

  let dots = '';
  for (const q of pts) {
    const c = toPx(q.x, q.y);
    dots += `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="3.6" fill="${STROKE.curve}"/>`;
  }

  // Title / legend live in HTML (build.js); SVG is diagram-only.
  const body = `
  <g stroke-linecap="round">${grid}${midLine}${dots}</g>
  ${ticks}`;

  return svgWrap(w, h, body);
}

function reflectionGuide(proj, x, yFrom, yTo, suffix) {
  const p1 = proj(x, yFrom);
  const p2 = proj(x, yTo);
  const xMid = (p1.x + p2.x) / 2;
  const yTop = Math.min(p1.y, p2.y) - 2;
  return `
    <defs>
      <marker id="ecc-arrow-${suffix}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
        <polygon points="0 0, 5 2.5, 0 5" fill="${ECC_ORANGE}"/>
      </marker>
    </defs>
    <path d="M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}"
      stroke="${ECC_ORANGE}" stroke-width="1.4" fill="none" stroke-dasharray="3 3" marker-end="url(#ecc-arrow-${suffix})"${VEC}/>
    <text x="${(xMid + 8).toFixed(2)}" y="${yTop.toFixed(2)}" font-family="${FONT_MONO}" font-size="9.5" fill="${ECC_ORANGE}">reflect</text>`;
}

/** Clip an infinite-ish line segment to the data view (keeps strokes inside the plot). */
function clipSegToView(x1, y1, x2, y2, view) {
  const { xMin, xMax, yMin, yMax } = view;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (
    clip(-dx, x1 - xMin) &&
    clip(dx, xMax - x1) &&
    clip(-dy, y1 - yMin) &&
    clip(dy, yMax - y1)
  ) {
    return {
      a: { x: x1 + t0 * dx, y: y1 + t0 * dy },
      b: { x: x1 + t1 * dx, y: y1 + t1 * dy },
    };
  }
  return null;
}

function curveAndAxes(proj, view, overhang = 0.35) {
  const { xMin, xMax, yMin, yMax } = view;
  const curveX0 = Math.max(Math.cbrt(-B) + 0.02, xMin);
  const { upper, lower } = sampleCurve(curveX0, xMax, 180);
  const x0 = proj(xMin - overhang, 0);
  const x1 = proj(xMax + overhang * 1.4, 0);
  const y0 = proj(0, yMin);
  const y1 = proj(0, yMax);
  return `
    <line x1="${y0.x.toFixed(2)}" y1="${y0.y.toFixed(2)}" x2="${y1.x.toFixed(2)}" y2="${y1.y.toFixed(2)}" stroke="${STROKE.axisStrong}" stroke-width="1.1" fill="none"${VEC}/>
    <line x1="${x0.x.toFixed(2)}" y1="${x0.y.toFixed(2)}" x2="${x1.x.toFixed(2)}" y2="${x1.y.toFixed(2)}" stroke="${STROKE.axisStrong}" stroke-width="1.45" fill="none"${VEC}/>
    <path d="${pathFromPoints(proj, upper)}" stroke="${STROKE.curve}" stroke-width="1.7" fill="none"${VEC}/>
    <path d="${pathFromPoints(proj, lower)}" stroke="${STROKE.curve}" stroke-width="1.7" fill="none"${VEC}/>
    <text x="${(x1.x - 1).toFixed(2)}" y="${(x1.y + 13).toFixed(2)}" font-family="${FONT_MONO}" font-size="11" font-style="italic" font-weight="600" text-anchor="end" fill="${STROKE.panelTitle}">x</text>
    <text x="${(y1.x + 7).toFixed(2)}" y="${(y1.y + 4).toFixed(2)}" font-family="${FONT_MONO}" font-size="11" font-style="italic" font-weight="600" fill="${STROKE.panelTitle}">y</text>`;
}

function pointAddFigure() {
  const view = OP_VIEW;
  const w = 680;
  const h = 300;
  const pad = 42;
  const proj = makeProjector(view.xMin, view.xMax, view.yMin, view.yMax, w, h, pad);

  // Chord through R′ and Q (contains P) — clipped so strokes stay in-frame
  const ext = clipSegToView(
    RPRIME_ADD.x - 1.2, RPRIME_ADD.y - R_ADD.lam * 1.2,
    Q_ADD.x + 0.8, Q_ADD.y + R_ADD.lam * 0.8,
    view,
  );

  const body = `
  <g stroke-linecap="round" stroke-linejoin="round">
    ${curveAndAxes(proj, view)}
    ${ext ? `<path d="${linePath(proj, ext.a.x, ext.a.y, ext.b.x, ext.b.y)}" stroke="${ECC_CYAN}" stroke-width="1.55" fill="none" stroke-dasharray="5 4"${VEC}/>` : ''}
    ${reflectionGuide(proj, RPRIME_ADD.x, RPRIME_ADD.y, R_ADD.y, 'add')}
    ${dot(proj, P_ADD.x, P_ADD.y, 4.5)}
    ${dot(proj, Q_ADD.x, Q_ADD.y, 4.5)}
    ${dot(proj, RPRIME_ADD.x, RPRIME_ADD.y, 4.5)}
    ${dot(proj, R_ADD.x, R_ADD.y, 4.5)}
    ${label(proj, P_ADD.x, P_ADD.y, 'P', -16, -8)}
    ${label(proj, Q_ADD.x, Q_ADD.y, 'Q', 7, -8)}
    ${label(proj, RPRIME_ADD.x, RPRIME_ADD.y, "R′", 8, 14)}
    ${label(proj, R_ADD.x, R_ADD.y, 'R = P ⊕ Q', 8, -8, 10)}
  </g>`;

  return svgWrap(w, h, body);
}

function pointDoubleFigure() {
  const view = OP_VIEW;
  const w = 680;
  const h = 300;
  const pad = 42;
  const proj = makeProjector(view.xMin, view.xMax, view.yMin, view.yMax, w, h, pad);

  const { lam } = R2_DBL;
  const ext = clipSegToView(
    P_DBL.x - 3.2, P_DBL.y - lam * 3.2,
    P_DBL.x + 2.4, P_DBL.y + lam * 2.4,
    view,
  );

  const body = `
  <g stroke-linecap="round" stroke-linejoin="round">
    ${curveAndAxes(proj, view)}
    ${ext ? `<path d="${linePath(proj, ext.a.x, ext.a.y, ext.b.x, ext.b.y)}" stroke="${STROKE.tangent}" stroke-width="1.55" fill="none" stroke-dasharray="5 4"${VEC}/>` : ''}
    ${reflectionGuide(proj, RPRIME_DBL.x, RPRIME_DBL.y, R2_DBL.y, 'dbl')}
    ${dot(proj, P_DBL.x, P_DBL.y, 4.5)}
    ${dot(proj, RPRIME_DBL.x, RPRIME_DBL.y, 4.5)}
    ${dot(proj, R2_DBL.x, R2_DBL.y, 4.5)}
    ${label(proj, P_DBL.x, P_DBL.y, 'P', -16, -8)}
    ${label(proj, RPRIME_DBL.x, RPRIME_DBL.y, "R′", 8, 14)}
    ${label(proj, R2_DBL.x, R2_DBL.y, '2P = P ⊕ P', 8, -8, 10)}
  </g>`;

  return svgWrap(w, h, body);
}

/**
 * Jimmy Song–style overview: addition, doubling, inverse → 𝒪, subtraction.
 * Small 2×2 grid of the same real curve with the essential construction in each cell.
 */
function pointOpsGridFigure() {
  const COLS = 2;
  const ROWS = 2;
  const pw = 310;
  const ph = 210;
  const gapX = 18;
  const gapY = 22;
  const titleH = 18;
  const W = COLS * pw + (COLS - 1) * gapX;
  const H = ROWS * (ph + titleH) + (ROWS - 1) * gapY;
  const view = OP_VIEW;
  const pad = 28;

  const panels = [
    {
      title: '(a)  Addition  P ⊕ Q',
      draw: (proj) => {
        const ext = clipSegToView(
          RPRIME_ADD.x - 1.0, RPRIME_ADD.y - R_ADD.lam * 1.0,
          Q_ADD.x + 0.6, Q_ADD.y + R_ADD.lam * 0.6,
          view,
        );
        return `
          ${ext ? `<path d="${linePath(proj, ext.a.x, ext.a.y, ext.b.x, ext.b.y)}" stroke="${ECC_CYAN}" stroke-width="1.35" fill="none" stroke-dasharray="4 3"${VEC}/>` : ''}
          ${reflectionGuide(proj, RPRIME_ADD.x, RPRIME_ADD.y, R_ADD.y, 'g-add')}
          ${dot(proj, P_ADD.x, P_ADD.y, 3.6)}
          ${dot(proj, Q_ADD.x, Q_ADD.y, 3.6)}
          ${dot(proj, RPRIME_ADD.x, RPRIME_ADD.y, 3.6)}
          ${dot(proj, R_ADD.x, R_ADD.y, 3.6)}
          ${label(proj, P_ADD.x, P_ADD.y, 'P', -14, -6, 10)}
          ${label(proj, Q_ADD.x, Q_ADD.y, 'Q', 6, -6, 10)}
          ${label(proj, RPRIME_ADD.x, RPRIME_ADD.y, "R′", 6, 12, 10)}
          ${label(proj, R_ADD.x, R_ADD.y, 'R', 6, -6, 10)}`;
      },
    },
    {
      title: '(b)  Doubling  2P = P ⊕ P',
      draw: (proj) => {
        const { lam } = R2_DBL;
        const ext = clipSegToView(
          P_DBL.x - 3.0, P_DBL.y - lam * 3.0,
          P_DBL.x + 2.2, P_DBL.y + lam * 2.2,
          view,
        );
        return `
          ${ext ? `<path d="${linePath(proj, ext.a.x, ext.a.y, ext.b.x, ext.b.y)}" stroke="${STROKE.tangent}" stroke-width="1.35" fill="none" stroke-dasharray="4 3"${VEC}/>` : ''}
          ${reflectionGuide(proj, RPRIME_DBL.x, RPRIME_DBL.y, R2_DBL.y, 'g-dbl')}
          ${dot(proj, P_DBL.x, P_DBL.y, 3.6)}
          ${dot(proj, RPRIME_DBL.x, RPRIME_DBL.y, 3.6)}
          ${dot(proj, R2_DBL.x, R2_DBL.y, 3.6)}
          ${label(proj, P_DBL.x, P_DBL.y, 'P', -14, -6, 10)}
          ${label(proj, RPRIME_DBL.x, RPRIME_DBL.y, "R′", 6, 12, 10)}
          ${label(proj, R2_DBL.x, R2_DBL.y, '2P', 6, -6, 10)}`;
      },
    },
    {
      title: '(c)  Inverse  P ⊕ (−P) = 𝒪',
      draw: (proj) => {
        const P = P_DBL;
        const nP = { x: P.x, y: -P.y };
        const top = proj(P.x, view.yMax - 0.15);
        const bot = proj(P.x, view.yMin + 0.15);
        return `
          <line x1="${top.x.toFixed(2)}" y1="${top.y.toFixed(2)}" x2="${bot.x.toFixed(2)}" y2="${bot.y.toFixed(2)}"
            stroke="${ECC_CYAN}" stroke-width="1.35" fill="none" stroke-dasharray="4 3"${VEC}/>
          ${dot(proj, P.x, P.y, 3.6)}
          ${dot(proj, nP.x, nP.y, 3.6)}
          ${label(proj, P.x, P.y, 'P', 8, -6, 10)}
          ${label(proj, nP.x, nP.y, '−P', 8, 12, 10)}
          <text x="${top.x.toFixed(2)}" y="${(top.y + 14).toFixed(2)}" font-family="${FONT_MONO}" font-size="12" font-weight="600" text-anchor="middle" fill="${STROKE.panelTitle}">𝒪</text>`;
      },
    },
    {
      title: '(d)  Subtraction  P − Q = P ⊕ (−Q)',
      draw: (proj) => {
        const P = P_ADD;
        const Q = Q_ADD;
        const nQ = { x: Q.x, y: -Q.y };
        const S = sumDistinct(P.x, P.y, nQ.x, nQ.y);
        const Sp = { x: S.x, y: -S.y };
        const ext = clipSegToView(
          Sp.x - 0.8, Sp.y - S.lam * 0.8,
          nQ.x + 0.5, nQ.y + S.lam * 0.5,
          view,
        );
        return `
          ${ext ? `<path d="${linePath(proj, ext.a.x, ext.a.y, ext.b.x, ext.b.y)}" stroke="${ECC_CYAN}" stroke-width="1.35" fill="none" stroke-dasharray="4 3"${VEC}/>` : ''}
          ${reflectionGuide(proj, Sp.x, Sp.y, S.y, 'g-sub')}
          ${dot(proj, P.x, P.y, 3.6)}
          ${dot(proj, Q.x, Q.y, 3.2)}
          ${dot(proj, nQ.x, nQ.y, 3.6)}
          ${dot(proj, Sp.x, Sp.y, 3.6)}
          ${dot(proj, S.x, S.y, 3.6)}
          ${label(proj, P.x, P.y, 'P', -14, -6, 10)}
          ${label(proj, Q.x, Q.y, 'Q', 6, -6, 9)}
          ${label(proj, nQ.x, nQ.y, '−Q', 6, 12, 10)}
          ${label(proj, S.x, S.y, 'P−Q', 6, -6, 10)}`;
      },
    },
  ];

  let body = '';
  panels.forEach((panel, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const ox = col * (pw + gapX);
    const oy = row * (ph + titleH + gapY);
    const proj = makeProjector(view.xMin, view.xMax, view.yMin, view.yMax, pw, ph, pad);
    // Offset projector into panel
    const base = proj;
    const off = (x, y) => {
      const p = base(x, y);
      return { x: p.x + ox, y: p.y + oy + titleH };
    };
    body += `
      <text x="${(ox + 4).toFixed(1)}" y="${(oy + 12).toFixed(1)}" font-family="${FONT_MONO}" font-size="11" font-weight="600" fill="${STROKE.panelTitle}">${panel.title}</text>
      <g stroke-linecap="round" stroke-linejoin="round">
        ${curveAndAxes(off, view, 0.25)}
        ${panel.draw(off)}
      </g>`;
  });

  return svgWrap(W, H, body);
}

/**
 * Torus figure — shows how F_p wraps in both x and y to form a torus topology.
 * Left: flat F_p scatter with identified edges highlighted.
 * Right: 3D torus with curve points mapped by (x/p, y/p) → (θ, φ).
 */
function torusFigure() {
  const W = 760, H = 300;
  const p = TOY_P;
  const curvePts = toyCurvePoints(p);

  /* ── LEFT PANEL: flat F_p grid ──────────────────────────────────────── */
  const cell = 9;
  const flatW = p * cell;
  const FX = 16, FY = 28;

  let flatGrid = '';
  for (let i = 0; i <= p; i++) {
    flatGrid += `<line x1="${FX + i * cell}" y1="${FY}" x2="${FX + i * cell}" y2="${FY + flatW}" stroke="#e5e7eb" stroke-width="0.6"/>`;
    flatGrid += `<line x1="${FX}" y1="${FY + i * cell}" x2="${FX + flatW}" y2="${FY + i * cell}" stroke="#e5e7eb" stroke-width="0.6"/>`;
  }
  // Identified edges: a = top/bottom (orange/latitude), b = left/right (cyan/longitude)
  const orangeEdge = `stroke="${ECC_ORANGE}" stroke-width="1.8" stroke-dasharray="3 2"`;
  const cyanEdge = `stroke="${ECC_CYAN}" stroke-width="1.8" stroke-dasharray="3 2"`;
  flatGrid += `<line x1="${FX}" y1="${FY}" x2="${FX + flatW}" y2="${FY}" ${orangeEdge}/>`;
  flatGrid += `<line x1="${FX}" y1="${FY + flatW}" x2="${FX + flatW}" y2="${FY + flatW}" ${orangeEdge}/>`;
  flatGrid += `<line x1="${FX}" y1="${FY}" x2="${FX}" y2="${FY + flatW}" ${cyanEdge}/>`;
  flatGrid += `<line x1="${FX + flatW}" y1="${FY}" x2="${FX + flatW}" y2="${FY + flatW}" ${cyanEdge}/>`;

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

  const SC_t = 30, TCX = W * 0.70, TCY = H * 0.48;
  function toScT(x, y, z) {
    const pr = projT(x, y, z);
    return { x: TCX + pr.sx * SC_t, y: TCY + pr.sy * SC_t, d: pr.d };
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
    const lit = 0.48 + 0.52 * f.ndl;
    const rv = Math.min(255, Math.round(218 * lit));
    const gv = Math.min(255, Math.round(222 * lit));
    const bv = Math.min(255, Math.round(230 * lit));
    const sr = Math.min(255, Math.round(rv * 0.78));
    const sg = Math.min(255, Math.round(gv * 0.80));
    const sb = Math.min(255, Math.round(bv * 0.82));
    torusMesh += `<polygon points="${pts}" fill="rgb(${rv},${gv},${bv})" stroke="rgb(${sr},${sg},${sb})" stroke-width="0.35"/>`;
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
  const AX = FX + flatW + 22, AY = FY + flatW / 2;
  const arrow = `
    <path d="M ${AX} ${AY} L ${AX + 34} ${AY}" stroke="#666" stroke-width="1.4" fill="none" marker-end="url(#ecc-arrow-tor)"/>
    <text x="${AX + 2}" y="${AY - 6}" font-family="${FONT_MONO}" font-size="10" fill="#555">identify</text>
    <text x="${AX + 2}" y="${AY + 16}" font-family="${FONT_MONO}" font-size="10" fill="#555">both pairs</text>`;

  // Titles live in HTML captions (build.js); SVG keeps only diagram + edge keys.
  const body = `
    <defs>
      <marker id="ecc-arrow-tor" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
        <polygon points="0 0, 5 2.5, 0 5" fill="#666"/>
      </marker>
    </defs>

    ${flatGrid}
    ${flatDots}

    <text x="${FX}" y="${FY + flatW + 16}" font-family="${FONT_MONO}" font-size="10" fill="${ECC_ORANGE}">a — top = bottom  (→ latitude)</text>
    <text x="${FX}" y="${FY + flatW + 30}" font-family="${FONT_MONO}" font-size="10" fill="${ECC_CYAN}">b — left = right  (→ longitude)</text>

    ${arrow}

    ${torusMesh}
    <polyline points="${lonPts.join(' ')}" fill="none" stroke="${ECC_ORANGE}" stroke-width="1.6" stroke-dasharray="4 3"/>
    <polyline points="${merPts.join(' ')}" fill="none" stroke="${ECC_CYAN}" stroke-width="1.6" stroke-dasharray="4 3"/>
    ${torusDots}`;

  return svgWrap(W, H, body);
}

/** Shared orthographic projector for lit meshes (same camera as torusFigure). */
function makeMeshProjector(cx, cy, scale) {
  const PHI = 0.42, EPS = 0.52;
  const cP = Math.cos(PHI), sP = Math.sin(PHI);
  const cE = Math.cos(EPS), sE = Math.sin(EPS);
  return (x, y, z) => {
    const r = x * sP + y * cP;
    return {
      x: cx + (x * cP - y * sP) * scale,
      y: cy - (r * sE + z * cE) * scale,
      d: r * cE - z * sE,
    };
  };
}

/** Painter's-algorithm lit quad mesh from a (nu+1)×(nv+1) vertex grid. */
function renderLitGrid(TV, nu, nv) {
  const faces = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = TV[i][j], b = TV[i + 1][j], c = TV[i + 1][j + 1], d = TV[i][j + 1];
      const dc = (a.d + b.d + c.d + d.d) / 4;
      const nx = (a.nx + b.nx + c.nx + d.nx) / 4;
      const ny = (a.ny + b.ny + c.ny + d.ny) / 4;
      const nz = (a.nz + b.nz + c.nz + d.nz) / 4;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const [lx, ly, lz] = [0.30, -0.20, 0.93];
      const ndl = Math.abs((nx / nl) * lx + (ny / nl) * ly + (nz / nl) * lz);
      faces.push({ a, b, c, d, dc, ndl });
    }
  }
  faces.sort((a, b) => b.dc - a.dc);
  let mesh = '';
  for (const f of faces) {
    const pts = [f.a, f.b, f.c, f.d].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    // Soft cool grey fill; mesh strokes stay crisp (full-opacity grey lines)
    const lit = 0.48 + 0.52 * f.ndl;
    const rv = Math.min(255, Math.round(218 * lit));
    const gv = Math.min(255, Math.round(222 * lit));
    const bv = Math.min(255, Math.round(230 * lit));
    const sr = Math.min(255, Math.round(rv * 0.78));
    const sg = Math.min(255, Math.round(gv * 0.80));
    const sb = Math.min(255, Math.round(bv * 0.82));
    mesh += `<polygon points="${pts}" fill="rgb(${rv},${gv},${bv})" stroke="rgb(${sr},${sg},${sb})" stroke-width="0.35"/>`;
  }
  return mesh;
}

function projectPolyline(toSc, pts3) {
  return pts3.map(p => {
    const s = toSc(p.x, p.y, p.z);
    return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
  }).join(' ');
}

function meshSquare(cx, cy, scale = 22) {
  const toSc = makeMeshProjector(cx, cy, scale);
  const N = 10;
  const TV = [];
  for (let i = 0; i <= N; i++) {
    const row = [];
    for (let j = 0; j <= N; j++) {
      const u = i / N, v = j / N;
      const x = (u - 0.5) * 2.2, y = (v - 0.5) * 2.2, z = 0;
      const s = toSc(x, y, z);
      row.push({ ...s, nx: 0, ny: 0, nz: 1 });
    }
    TV.push(row);
  }
  const mesh = renderLitGrid(TV, N, N);
  const top = [], bot = [], left = [], right = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    top.push({ x: (t - 0.5) * 2.2, y: -1.1, z: 0 });
    bot.push({ x: (t - 0.5) * 2.2, y: 1.1, z: 0 });
    left.push({ x: -1.1, y: (t - 0.5) * 2.2, z: 0 });
    right.push({ x: 1.1, y: (t - 0.5) * 2.2, z: 0 });
  }
  return `${mesh}
    <polyline points="${projectPolyline(toSc, top)}" fill="none" stroke="${ECC_ORANGE}" stroke-width="1.8" stroke-dasharray="3 2"/>
    <polyline points="${projectPolyline(toSc, bot)}" fill="none" stroke="${ECC_ORANGE}" stroke-width="1.8" stroke-dasharray="3 2"/>
    <polyline points="${projectPolyline(toSc, left)}" fill="none" stroke="${ECC_CYAN}" stroke-width="1.8" stroke-dasharray="3 2"/>
    <polyline points="${projectPolyline(toSc, right)}" fill="none" stroke="${ECC_CYAN}" stroke-width="1.8" stroke-dasharray="3 2"/>`;
}

function meshCylinder(cx, cy, scale = 18) {
  const toSc = makeMeshProjector(cx, cy, scale);
  const NU = 28, NV = 12;
  const R = 0.85, H = 2.4;
  const TV = [];
  for (let i = 0; i <= NU; i++) {
    const row = [];
    for (let j = 0; j <= NV; j++) {
      const theta = (i / NU) * 2 * Math.PI;
      const h = -H / 2 + (j / NV) * H;
      const x = R * Math.cos(theta), y = h, z = R * Math.sin(theta);
      const s = toSc(x, y, z);
      row.push({ ...s, nx: Math.cos(theta), ny: 0, nz: Math.sin(theta) });
    }
    TV.push(row);
  }
  const mesh = renderLitGrid(TV, NU, NV);
  // Glue a: free ends are b (cyan); a is an orange seam along the cylinder (end → end).
  const endTop = [], endBot = [], alongA = [];
  for (let i = 0; i <= 48; i++) {
    const th = (i / 48) * 2 * Math.PI;
    endTop.push({ x: R * Math.cos(th), y: H / 2, z: R * Math.sin(th) });
    endBot.push({ x: R * Math.cos(th), y: -H / 2, z: R * Math.sin(th) });
  }
  for (let j = 0; j <= 24; j++) {
    const h = -H / 2 + (j / 24) * H;
    alongA.push({ x: R, y: h, z: 0 });
  }
  return `${mesh}
    <polyline points="${projectPolyline(toSc, endTop)}" fill="none" stroke="${ECC_CYAN}" stroke-width="1.7" stroke-dasharray="3 2"/>
    <polyline points="${projectPolyline(toSc, endBot)}" fill="none" stroke="${ECC_CYAN}" stroke-width="1.7" stroke-dasharray="3 2"/>
    <polyline points="${projectPolyline(toSc, alongA)}" fill="none" stroke="${ECC_ORANGE}" stroke-width="1.7" stroke-dasharray="3 2"/>`;
}

function meshBentTube(cx, cy, scale = 16) {
  const toSc = makeMeshProjector(cx, cy, scale);
  const bendR = 1.35, tubeR = 0.55;
  const NU = 28, NV = 14;
  const TV = [];
  for (let i = 0; i <= NU; i++) {
    const row = [];
    // U opening upward: θ from π → 2π
    const u = Math.PI + (i / NU) * Math.PI;
    const ccx = bendR * Math.cos(u);
    const ccy = bendR * Math.sin(u);
    const tx = -Math.sin(u), ty = Math.cos(u), tz = 0;
    const nx0 = Math.cos(u), ny0 = Math.sin(u), nz0 = 0;
    const bx = 0, by = 0, bz = 1;
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 * Math.PI;
      const nxx = Math.cos(v) * nx0 + Math.sin(v) * bx;
      const nyy = Math.cos(v) * ny0 + Math.sin(v) * by;
      const nzz = Math.cos(v) * nz0 + Math.sin(v) * bz;
      const x = ccx + tubeR * nxx;
      const y = ccy + tubeR * nyy;
      const z = 0 + tubeR * nzz;
      const s = toSc(x, y, z);
      row.push({ ...s, nx: nxx, ny: nyy, nz: nzz, _tx: tx, _ty: ty, _tz: tz });
    }
    TV.push(row);
  }
  const mesh = renderLitGrid(TV, NU, NV);
  // Open ends = b (cyan), ready for glue b; orange a runs along the outer bend.
  const endL = [], endR = [], alongA = [];
  for (let j = 0; j <= 32; j++) {
    const v = (j / 32) * 2 * Math.PI;
    for (const [u, arr] of [[Math.PI, endL], [2 * Math.PI, endR]]) {
      const ccx = bendR * Math.cos(u), ccy = bendR * Math.sin(u);
      const nx0 = Math.cos(u), ny0 = Math.sin(u);
      arr.push({
        x: ccx + tubeR * (Math.cos(v) * nx0),
        y: ccy + tubeR * (Math.cos(v) * ny0),
        z: tubeR * Math.sin(v),
      });
    }
  }
  for (let i = 0; i <= 40; i++) {
    const u = Math.PI + (i / 40) * Math.PI;
    alongA.push({
      x: (bendR + tubeR) * Math.cos(u),
      y: (bendR + tubeR) * Math.sin(u),
      z: 0,
    });
  }
  return `${mesh}
    <polyline points="${projectPolyline(toSc, alongA)}" fill="none" stroke="${ECC_ORANGE}" stroke-width="1.7" stroke-dasharray="3 2"/>
    <polyline points="${projectPolyline(toSc, endL)}" fill="none" stroke="${ECC_CYAN}" stroke-width="1.7" stroke-dasharray="3 2"/>
    <polyline points="${projectPolyline(toSc, endR)}" fill="none" stroke="${ECC_CYAN}" stroke-width="1.7" stroke-dasharray="3 2"/>`;
}

function meshTorus(cx, cy, scale = 14) {
  const toSc = makeMeshProjector(cx, cy, scale);
  const R_t = 3.0, r_t = 1.35;
  const NU = 36, NV = 18;
  function xyz(theta, phi) {
    return {
      x: (R_t + r_t * Math.cos(phi)) * Math.cos(theta),
      y: (R_t + r_t * Math.cos(phi)) * Math.sin(theta),
      z: r_t * Math.sin(phi),
    };
  }
  const TV = [];
  for (let i = 0; i <= NU; i++) {
    const row = [];
    for (let j = 0; j <= NV; j++) {
      const theta = (i / NU) * 2 * Math.PI;
      const phi = (j / NV) * 2 * Math.PI;
      const wp = xyz(theta, phi);
      const s = toSc(wp.x, wp.y, wp.z);
      row.push({
        ...s,
        nx: Math.cos(phi) * Math.cos(theta),
        ny: Math.cos(phi) * Math.sin(theta),
        nz: Math.sin(phi),
      });
    }
    TV.push(row);
  }
  const mesh = renderLitGrid(TV, NU, NV);
  const lon = [], mer = [];
  for (let i = 0; i <= 64; i++) lon.push(xyz((i / 64) * 2 * Math.PI, 0));
  for (let j = 0; j <= 48; j++) mer.push(xyz(0, (j / 48) * 2 * Math.PI));
  return `${mesh}
    <polyline points="${projectPolyline(toSc, lon)}" fill="none" stroke="${ECC_ORANGE}" stroke-width="1.7" stroke-dasharray="3 2"/>
    <polyline points="${projectPolyline(toSc, mer)}" fill="none" stroke="${ECC_CYAN}" stroke-width="1.7" stroke-dasharray="3 2"/>`;
}

function planeToTorusChrome(idSuffix) {
  const F = `font-family="${FONT_MONO}"`;
  const defs = `<defs>
    <marker id="ptt-arr-a-${idSuffix}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <polygon points="0 0.5, 7 3.5, 0 6.5" fill="${ECC_ORANGE}"/>
    </marker>
    <marker id="ptt-arr-b-${idSuffix}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <polygon points="0 0.5, 7 3.5, 0 6.5" fill="${ECC_CYAN}"/>
    </marker>
    <marker id="ptt-arr-step-${idSuffix}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <polygon points="0 0.5, 7 3.5, 0 6.5" fill="#9ca3af"/>
    </marker>
  </defs>`;
  function stepArrow(x1, x2, y, label, color) {
    const mx = (x1 + x2) / 2;
    return `
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#cbd5e1" stroke-width="1.4" marker-end="url(#ptt-arr-step-${idSuffix})"/>
      <text x="${mx}" y="${y - 7}" ${F} font-size="9" text-anchor="middle" fill="${color}">${label}</text>`;
  }
  return { F, defs, stepArrow };
}

/** Flat square → torus, all lit mesh. Titles are HTML captions in build.js. */
function planeToTorusFigure() {
  const W = 760, H = 220;
  const { F, defs, stepArrow } = planeToTorusChrome('msh');
  const cap = `${F} font-size="8.5" text-anchor="middle" fill="#6b7280"`;

  const AY = 100;
  const square = `
    ${meshSquare(80, 98, 28)}
    <text x="80" y="158" ${F} font-size="12" font-style="italic" text-anchor="middle" fill="${ECC_ORANGE}">a</text>
    <text x="36" y="100" ${F} font-size="12" font-style="italic" text-anchor="middle" fill="${ECC_CYAN}">b</text>
    <text x="124" y="100" ${F} font-size="12" font-style="italic" text-anchor="middle" fill="${ECC_CYAN}">b</text>
    <text x="80" y="178" ${cap}>flat square</text>`;
  const arr1 = stepArrow(128, 158, AY, 'glue a', ECC_ORANGE);

  const cylinder = `
    ${meshCylinder(230, 95, 22)}
    <text x="230" y="178" ${cap}>cylinder (a glued)</text>`;
  const arr2 = stepArrow(278, 308, AY, 'bend', '#94a3b8');

  const bent = `
    ${meshBentTube(385, 110, 28)}
    <text x="385" y="178" ${cap}>bent tube</text>`;
  const arr3 = stepArrow(448, 478, AY, 'glue b', ECC_CYAN);

  const torus = `
    ${meshTorus(620, 95, 15)}
    <text x="620" y="178" ${cap}>torus (a and b glued)</text>`;

  return svgWrap(W, H, `
    ${defs}
    ${square}${arr1}${cylinder}${arr2}${bent}${arr3}${torus}`);
}

export function getEccPrimerFigures() {
  return {
    curveSpatial: curveSpatialFigure(),
    finiteFieldToy: finiteFieldToyFigure(),
    planeToTorus: planeToTorusFigure(),
    torus: torusFigure(),
    pointAdd: pointAddFigure(),
    pointDouble: pointDoubleFigure(),
    pointOpsGrid: pointOpsGridFigure(),
  };
}
