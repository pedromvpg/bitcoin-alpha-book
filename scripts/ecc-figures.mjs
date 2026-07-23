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

/** One F_p scatter panel at origin (ox, oy); plot is size×size. */
function finiteFieldPanelSvg(p, ox, oy, size, {
  showGrid = true,
  gridStep = 1,
  tickVals = null,
  dotR = null,
  title = '',
  subtitle = '',
} = {}) {
  const pts = toyCurvePoints(p);
  const cell = size / p;
  const r = dotR ?? Math.max(0.55, Math.min(3.4, cell * 0.38));
  const toPx = (xv, yv) => ({
    x: ox + xv * cell + cell / 2,
    y: oy + (p - 1 - yv) * cell + cell / 2,
  });

  let grid = '';
  if (showGrid) {
    const step = Math.max(1, gridStep | 0);
    for (let i = 0; i <= p; i += step) {
      const x = ox + i * cell;
      const y = oy + i * cell;
      grid += `<line x1="${x.toFixed(2)}" y1="${oy}" x2="${x.toFixed(2)}" y2="${(oy + size).toFixed(2)}" stroke="${STROKE.grid}" stroke-width="0.5"${VEC}/>`;
      grid += `<line x1="${ox}" y1="${y.toFixed(2)}" x2="${(ox + size).toFixed(2)}" y2="${y.toFixed(2)}" stroke="${STROKE.grid}" stroke-width="0.5"${VEC}/>`;
    }
    // Always draw outer frame
    grid += `<rect x="${ox}" y="${oy}" width="${size}" height="${size}" fill="none" stroke="${STROKE.axisStrong}" stroke-width="0.9"${VEC}/>`;
  } else {
    grid += `<rect x="${ox}" y="${oy}" width="${size}" height="${size}" fill="none" stroke="${STROKE.axisStrong}" stroke-width="0.9"${VEC}/>`;
  }

  const midY = oy + (p / 2) * cell;
  const midLine = `<line x1="${ox}" y1="${midY.toFixed(2)}" x2="${(ox + size).toFixed(2)}" y2="${midY.toFixed(2)}" stroke="${ECC_ORANGE}" stroke-width="1.1" stroke-dasharray="3 2" opacity="0.95"${VEC}/>`;

  let dots = '';
  for (const q of pts) {
    const c = toPx(q.x, q.y);
    dots += `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${STROKE.curve}"/>`;
  }

  let ticks = '';
  if (tickVals && tickVals.length) {
    for (const t of tickVals) {
      if (t < 0 || t >= p) continue;
      const px = ox + t * cell + cell / 2;
      const py = oy + (p - 1 - t) * cell + cell / 2;
      ticks += `<text x="${px.toFixed(1)}" y="${(oy + size + 12).toFixed(1)}" font-family="${FONT_MONO}" font-size="8" text-anchor="middle" fill="${STROKE.axisStrong}">${t}</text>`;
      ticks += `<text x="${(ox - 5).toFixed(1)}" y="${(py + 3).toFixed(1)}" font-family="${FONT_MONO}" font-size="8" text-anchor="end" fill="${STROKE.axisStrong}">${t}</text>`;
    }
  }

  const cap = title
    ? `<text x="${(ox + size / 2).toFixed(1)}" y="${(oy - 8).toFixed(1)}" font-family="${FONT_MONO}" font-size="10" font-weight="600" text-anchor="middle" fill="${STROKE.panelTitle}">${title}</text>`
    : '';
  const sub = subtitle
    ? `<text x="${(ox + size / 2).toFixed(1)}" y="${(oy + size + (tickVals ? 26 : 14)).toFixed(1)}" font-family="${FONT_MONO}" font-size="9" text-anchor="middle" fill="${STROKE.axisStrong}">${subtitle}</text>`
    : '';

  return `${cap}${grid}${midLine}${dots}${ticks}${sub}`;
}

function finiteFieldToyFigure() {
  const p = TOY_P;
  const cell = 16;
  const leftPad = 36;
  const topPad = 12;
  const rightPad = 58;
  const plot = p * cell;
  const w = leftPad + plot + rightPad;
  const h = topPad + plot + 36;

  const body = `
  <g stroke-linecap="round">
    ${finiteFieldPanelSvg(p, leftPad, topPad, plot, {
      showGrid: true,
      tickVals: [0, 8, 16],
      dotR: 3.6,
    })}
    <text x="${leftPad + plot + 6}" y="${(topPad + (p / 2) * cell + 4).toFixed(1)}" font-family="${FONT_MONO}" font-size="10" fill="${ECC_ORANGE}">y = p/2</text>
    <text x="${leftPad + plot / 2}" y="${topPad + plot + 30}" font-family="${FONT_MONO}" font-size="10" font-style="italic" text-anchor="middle" fill="${STROKE.axisStrong}">x</text>
    <text x="${leftPad - 22}" y="${topPad + plot / 2}" font-family="${FONT_MONO}" font-size="10" font-style="italic" text-anchor="middle" fill="${STROKE.axisStrong}">y</text>
  </g>`;

  return svgWrap(w, h, body);
}

/**
 * Scale ladder: toy F_17 → denser F_251 → secp256k1 faked density.
 * Same curve y² = x³ + 7; orange midline = negation mirror.
 */
function finiteFieldScaleFigure() {
  const W = 740;
  const H = 290;
  const plot = 200;
  const top = 28;
  const gap = 28;
  const x0 = 36;
  const x1 = x0 + plot + gap;
  const x2 = x1 + plot + gap;

  const n17 = toyCurvePoints(17).length;
  const n251 = toyCurvePoints(251).length;

  const panelA = finiteFieldPanelSvg(17, x0, top, plot, {
    showGrid: true,
    tickVals: [0, 8, 16],
    dotR: 3.2,
    title: '𝔽₁₇',
    subtitle: `${n17} curve points`,
  });

  const panelB = finiteFieldPanelSvg(251, x1, top, plot, {
    showGrid: true,
    gridStep: 25,
    tickVals: [0, 125, 250],
    dotR: 1.05,
    title: '𝔽₂₅₁',
    subtitle: `${n251} curve points`,
  });

  // Panel C: fake a near-continuous field (secp256k1 cannot be plotted literally).
  // Seeded uniform scatter + mirror across midline — avoid lattice/hash Moire.
  const ox = x2;
  const oy = top;
  const midY = oy + plot / 2;
  const pad = 2;
  const seam = 1.4; // keep a thin clear band so the orange midline reads
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let stipple = '';
  const nDots = 14000; // upper half; mirrored → ~28000 visible
  for (let k = 0; k < nDots; k++) {
    const x = ox + pad + rand() * (plot - 2 * pad);
    const yTop = oy + pad + rand() * (midY - oy - pad - seam);
    const yBot = oy + plot - (yTop - oy);
    const op = 0.62 + 0.35 * rand();
    const rr = 0.48 + 0.32 * rand();
    stipple += `<circle cx="${x.toFixed(2)}" cy="${yTop.toFixed(2)}" r="${rr.toFixed(2)}" fill="${STROKE.curve}" opacity="${op.toFixed(2)}"/>`;
    stipple += `<circle cx="${x.toFixed(2)}" cy="${yBot.toFixed(2)}" r="${rr.toFixed(2)}" fill="${STROKE.curve}" opacity="${op.toFixed(2)}"/>`;
  }
  const clipId = 'ff-scale-secp-clip';
  const panelC = `
    <defs>
      <clipPath id="${clipId}"><rect x="${ox}" y="${oy}" width="${plot}" height="${plot}"/></clipPath>
    </defs>
    <text x="${(ox + plot / 2).toFixed(1)}" y="${(oy - 8).toFixed(1)}" font-family="${FONT_MONO}" font-size="10" font-weight="600" text-anchor="middle" fill="${STROKE.panelTitle}">secp256k1</text>
    <rect x="${ox}" y="${oy}" width="${plot}" height="${plot}" fill="#fff" stroke="${STROKE.axisStrong}" stroke-width="0.9"${VEC}/>
    <g clip-path="url(#${clipId})">${stipple}</g>
    <line x1="${ox + 1}" y1="${midY}" x2="${ox + plot - 1}" y2="${midY}" stroke="#fff" stroke-width="2.4"${VEC}/>
    <line x1="${ox + 1}" y1="${midY}" x2="${ox + plot - 1}" y2="${midY}" stroke="${ECC_ORANGE}" stroke-width="1.2" stroke-dasharray="3 2"${VEC}/>
    <text x="${(ox + plot / 2).toFixed(1)}" y="${(oy + plot + 14).toFixed(1)}" font-family="${FONT_MONO}" font-size="9" text-anchor="middle" fill="${STROKE.axisStrong}">p ≈ 2²⁵⁶ · ~10⁷⁷ pts (schematic)</text>`;

  const arrows = `
    <defs>
      <marker id="ff-scale-arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="0 0.5, 6 3, 0 5.5" fill="${STROKE.axisStrong}"/>
      </marker>
    </defs>
    <line x1="${x0 + plot + 6}" y1="${top + plot / 2}" x2="${x1 - 6}" y2="${top + plot / 2}" stroke="${STROKE.axis}" stroke-width="1.1" marker-end="url(#ff-scale-arr)"${VEC}/>
    <line x1="${x1 + plot + 6}" y1="${top + plot / 2}" x2="${x2 - 6}" y2="${top + plot / 2}" stroke="${STROKE.axis}" stroke-width="1.1" marker-end="url(#ff-scale-arr)"${VEC}/>`;

  const body = `
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <g stroke-linecap="round">
      ${panelA}
      ${panelB}
      ${panelC}
      ${arrows}
    </g>`;

  return svgWrap(W, H, body);
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
  const pw = 360;
  const ph = 245;
  const gapX = 22;
  const gapY = 56;
  const titleH = 38; // room under panel titles
  const padTop = 12;
  const padBot = 16;
  const W = COLS * pw + (COLS - 1) * gapX;
  const H = padTop + ROWS * (ph + titleH) + (ROWS - 1) * gapY + padBot;
  const view = OP_VIEW;
  const pad = 30;

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
    const oy = padTop + row * (ph + titleH + gapY);
    const proj = makeProjector(view.xMin, view.xMax, view.yMin, view.yMax, pw, ph, pad);
    // Offset projector into panel
    const base = proj;
    const off = (x, y) => {
      const p = base(x, y);
      return { x: p.x + ox, y: p.y + oy + titleH };
    };
    body += `
      <text x="${(ox + pw / 2).toFixed(1)}" y="${(oy + 12).toFixed(1)}" font-family="${FONT_MONO}" font-size="11" font-weight="600" text-anchor="middle" fill="${STROKE.panelTitle}">${panel.title}</text>
      <g stroke-linecap="round" stroke-linejoin="round">
        ${curveAndAxes(off, view, 0.25)}
        ${panel.draw(off)}
      </g>`;
  });

  return svgWrap(W, H, body);
}

/**
 * Torus figure — F_p grid → stroke-mesh torus (same camera/style as curve family
 * and plane→torus). Curve points map (x/p, y/p) → (θ, φ).
 * Edge colors match plane→torus: a = cyan (latitude), b = red (longitude).
 */
function torusFigure() {
  const p = TOY_P;
  const curvePts = toyCurvePoints(p);
  const ECC_RED = '#dc2626';
  const F = `font-family="${FONT_MONO}"`;

  /* ── LEFT: flat F_p grid ─────────────────────────────────────────────── */
  const cell = 15;
  const flatW = p * cell;
  const FX = 18, FY = 22;

  let flatGrid = '';
  for (let i = 0; i <= p; i++) {
    flatGrid += `<line x1="${FX + i * cell}" y1="${FY}" x2="${FX + i * cell}" y2="${FY + flatW}" stroke="#cbd5e1" stroke-width="0.7" opacity="0.85"${VEC}/>`;
    flatGrid += `<line x1="${FX}" y1="${FY + i * cell}" x2="${FX + flatW}" y2="${FY + i * cell}" stroke="#cbd5e1" stroke-width="0.7" opacity="0.85"${VEC}/>`;
  }
  const aEdge = `stroke="${ECC_CYAN}" stroke-width="2.1" stroke-dasharray="4 3" fill="none"${VEC}`;
  const bEdge = `stroke="${ECC_RED}" stroke-width="2.1" stroke-dasharray="4 3" fill="none"${VEC}`;
  flatGrid += `<line x1="${FX}" y1="${FY}" x2="${FX + flatW}" y2="${FY}" ${aEdge}/>`;
  flatGrid += `<line x1="${FX}" y1="${FY + flatW}" x2="${FX + flatW}" y2="${FY + flatW}" ${aEdge}/>`;
  flatGrid += `<line x1="${FX}" y1="${FY}" x2="${FX}" y2="${FY + flatW}" ${bEdge}/>`;
  flatGrid += `<line x1="${FX + flatW}" y1="${FY}" x2="${FX + flatW}" y2="${FY + flatW}" ${bEdge}/>`;

  let flatDots = '';
  for (const q of curvePts) {
    const cx = FX + q.x * cell + cell / 2;
    const cy = FY + (p - 1 - q.y) * cell + cell / 2;
    flatDots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.0" fill="${ECC_RED}"/>`;
  }

  const flatKey = `
    <text x="${FX}" y="${FY + flatW + 28}" ${F} font-size="12" fill="${ECC_CYAN}" stroke="#ffffff" stroke-width="3" paint-order="stroke fill">a — top = bottom  (→ latitude)</text>
    <text x="${FX}" y="${FY + flatW + 46}" ${F} font-size="12" fill="${ECC_RED}" stroke="#ffffff" stroke-width="3" paint-order="stroke fill">b — left = right  (→ longitude)</text>`;

  /* ── Arrow + RIGHT: stroke-only torus ────────────────────────────────── */
  const R = 1.55, r = 0.58;
  const AX = FX + flatW + 22;
  const arrowLen = 100;
  // Keep torus clear of the arrow tip (outer radius ≈ (R+r)*scale)
  const torusScale = 70;
  const TCX = AX + arrowLen + 168;
  const TCY = FY + flatW * 0.40;
  const toSc = makeSpatialProjector(TCX, TCY, torusScale);
  const sample = (u, v) => {
    const theta = u * 2 * Math.PI;
    const phi = v * 2 * Math.PI;
    return {
      x: (R + r * Math.cos(phi)) * Math.cos(theta),
      y: (R + r * Math.cos(phi)) * Math.sin(theta),
      z: r * Math.sin(phi),
    };
  };
  const torusMesh = strokeParametricGrid(toSc, sample, 32, 16, {
    stroke: '#64748b',
    sw: 0.75,
    opNear: 0.88,
    opFar: 0.14,
  });

  const lon = [], mer = [];
  for (let i = 0; i <= 72; i++) lon.push(sample(i / 72, 0));
  for (let j = 0; j <= 48; j++) mer.push(sample(0, j / 48));

  const dotData = curvePts.map((q) => {
    const wp = sample(q.x / p, q.y / p);
    return { ...toSc(wp.x, wp.y, wp.z) };
  });
  const depths = dotData.map((d) => d.d);
  const dMin = Math.min(...depths);
  const dMax = Math.max(...depths);
  const span = Math.max(1e-6, dMax - dMin);
  dotData.sort((a, b) => a.d - b.d);
  let torusDots = '';
  let maxX = FX + flatW;
  let maxY = FY + flatW + 56; // room for a/b key under the grid
  let minY = FY;
  for (const pt of dotData) {
    const t = (pt.d - dMin) / span;
    const op = (0.35 + 0.65 * t).toFixed(2);
    const rad = (4.4 + 1.5 * t).toFixed(1);
    torusDots += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${rad}" fill="${ECC_RED}" opacity="${op}"/>`;
    maxX = Math.max(maxX, pt.x + 8);
    maxY = Math.max(maxY, pt.y + 8);
    minY = Math.min(minY, pt.y - 8);
  }
  for (let i = 0; i <= 16; i++) {
    for (let j = 0; j <= 8; j++) {
      const wp = sample(i / 16, j / 8);
      const pt = toSc(wp.x, wp.y, wp.z);
      maxX = Math.max(maxX, pt.x + 6);
      maxY = Math.max(maxY, pt.y + 6);
      minY = Math.min(minY, pt.y - 6);
    }
  }

  const AY = FY + flatW / 2;
  const midX = AX + arrowLen / 2;
  const labelGap = 38; // clear zone so the shaft never crosses the words
  const arrow = `
    <defs>
      <marker id="ecc-arrow-tor" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="0 0.5, 6 3, 0 5.5" fill="${STROKE.axisStrong}"/>
      </marker>
    </defs>
    <line x1="${AX}" y1="${AY}" x2="${(midX - labelGap).toFixed(1)}" y2="${AY}" stroke="${STROKE.axis}" stroke-width="1.25"${VEC}/>
    <line x1="${(midX + labelGap).toFixed(1)}" y1="${AY}" x2="${AX + arrowLen}" y2="${AY}" stroke="${STROKE.axis}" stroke-width="1.25" marker-end="url(#ecc-arrow-tor)"${VEC}/>
    <text x="${midX.toFixed(1)}" y="${(AY - 5).toFixed(1)}" ${F} font-size="10.5" text-anchor="middle" fill="${STROKE.axisStrong}" stroke="#ffffff" stroke-width="3.5" paint-order="stroke fill">identify</text>
    <text x="${midX.toFixed(1)}" y="${(AY + 11).toFixed(1)}" ${F} font-size="10.5" text-anchor="middle" fill="${STROKE.axisStrong}" stroke="#ffffff" stroke-width="3.5" paint-order="stroke fill">both pairs</text>`;

  const pad = 16;
  const W = Math.ceil(maxX + pad);
  const yShift = minY < pad ? pad - minY : 0;
  const H = Math.ceil(maxY + yShift + pad);

  const body = `
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <g stroke-linecap="round" stroke-linejoin="round" transform="translate(0,${yShift.toFixed(1)})">
      ${flatGrid}
      ${flatDots}
      ${flatKey}
      ${arrow}
      ${torusMesh}
      ${strokeHighlight(toSc, lon, ECC_CYAN, 2.1)}
      ${strokeHighlight(toSc, mer, ECC_RED, 2.1)}
      ${torusDots}
    </g>`;

  return svgWrap(W, H, body);
}

/**
 * Same camera as curveSpatialFigure — stroke-only parametric surfaces
 * (no lit filled quads). Depth fades like the z-family curve opacity.
 */
const SPATIAL_PHI = Math.PI * 0.18;
const SPATIAL_EPS = Math.PI * 0.24;

function makeSpatialProjector(cx, cy, scale) {
  const cP = Math.cos(SPATIAL_PHI), sP = Math.sin(SPATIAL_PHI);
  const cE = Math.cos(SPATIAL_EPS), sE = Math.sin(SPATIAL_EPS);
  return (x, y, z) => {
    const r = x * sP + y * cP;
    return {
      x: cx + (x * cP - y * sP) * scale,
      y: cy - (r * sE + z * cE) * scale,
      d: r * cE - z * sE,
    };
  };
}

function spatialPath(toSc, pts3) {
  if (pts3.length < 2) return '';
  const mapped = pts3.map((p) => toSc(p.x, p.y, p.z));
  return {
    d: 'M ' + mapped.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L '),
    depth: mapped.reduce((s, p) => s + p.d, 0) / mapped.length,
  };
}

/** Iso-parameter strokes sorted far→near; opacity fades with depth. */
function strokeParametricGrid(toSc, sample, nu, nv, {
  stroke = '#94a3b8',
  sw = 0.75,
  opNear = 0.88,
  opFar = 0.22,
} = {}) {
  const curves = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const pts = [];
    for (let j = 0; j <= nv; j++) pts.push(sample(u, j / nv));
    const sp = spatialPath(toSc, pts);
    if (sp.d) curves.push(sp);
  }
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const pts = [];
    for (let i = 0; i <= nu; i++) pts.push(sample(i / nu, v));
    const sp = spatialPath(toSc, pts);
    if (sp.d) curves.push(sp);
  }
  if (curves.length === 0) return '';
  const depths = curves.map((c) => c.depth);
  const dMin = Math.min(...depths);
  const dMax = Math.max(...depths);
  const span = Math.max(1e-6, dMax - dMin);
  curves.sort((a, b) => a.depth - b.depth); // far first
  let out = '';
  for (const c of curves) {
    const t = (c.depth - dMin) / span; // 0 far → 1 near
    const op = opFar + (opNear - opFar) * t;
    out += `<path d="${c.d}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${op.toFixed(2)}" stroke-linejoin="round"${VEC}/>`;
  }
  return out;
}

function strokeHighlight(toSc, pts3, color, sw = 1.7) {
  const sp = spatialPath(toSc, pts3);
  if (!sp.d) return '';
  return `<path d="${sp.d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round"${VEC}/>`;
}

function meshSquareStroke(cx, cy, scale = 26, {
  aColor = ECC_CYAN,
  bColor = '#dc2626',
  /** Degrees about local z (only used by the plane→torus flat-square panel). */
  rotZDeg = 0,
  /** Draw edge letters a / b next to midpoints (flat-square panel). */
  edgeLabels = false,
} = {}) {
  const toSc = makeSpatialProjector(cx, cy, scale);
  const half = 1.15;
  const rad = (rotZDeg * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const rot = (x, y, z = 0) => ({
    x: x * c - y * s,
    y: x * s + y * c,
    z,
  });
  const sample = (u, v) => {
    const x = (u - 0.5) * 2 * half;
    const y = (v - 0.5) * 2 * half;
    return rot(x, y, 0);
  };
  const mesh = strokeParametricGrid(toSc, sample, 12, 12, {
    stroke: '#64748b',
    sw: 0.75,
    opNear: 0.78,
    opFar: 0.35,
  });
  // Edge polylines in unrotated frame, then rot — a = top/bottom, b = left/right
  const top = [], bot = [], left = [], right = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    top.push(rot((t - 0.5) * 2 * half, -half, 0));
    bot.push(rot((t - 0.5) * 2 * half, half, 0));
    left.push(rot(-half, (t - 0.5) * 2 * half, 0));
    right.push(rot(half, (t - 0.5) * 2 * half, 0));
  }
  const corners = [
    rot(-half, -half, 0),
    rot(half, -half, 0),
    rot(half, half, 0),
    rot(-half, half, 0),
  ].map((p) => toSc(p.x, p.y, p.z));
  const planePts = corners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  let labels = '';
  if (edgeLabels) {
    const mid = (pts) => {
      const m = pts[Math.floor(pts.length / 2)];
      return toSc(m.x, m.y, m.z);
    };
    const center = toSc(0, 0, 0);
    const place = (pts, letter, color) => {
      const p = mid(pts);
      let dx = p.x - center.x;
      let dy = p.y - center.y;
      const len = Math.hypot(dx, dy) || 1;
      dx = (dx / len) * 22;
      dy = (dy / len) * 22;
      const lx = p.x + dx;
      const ly = p.y + dy;
      return `<text x="${lx.toFixed(1)}" y="${(ly + 5.5).toFixed(1)}" font-family="${FONT_MONO}" font-size="18" font-weight="700" text-anchor="middle" fill="${color}" stroke="#ffffff" stroke-width="3.5" paint-order="stroke fill">${letter}</text>`;
    };
    // After rotZ+camera: bot→left (a), left→bottom (b)
    labels = `
      ${place(bot, 'a', aColor)}
      ${place(left, 'b', bColor)}`;
  }

  return `
    <polygon points="${planePts}" fill="rgba(100,116,139,0.05)" stroke="none"/>
    ${mesh}
    ${strokeHighlight(toSc, top, aColor, 2.35)}
    ${strokeHighlight(toSc, bot, aColor, 2.35)}
    ${strokeHighlight(toSc, left, bColor, 2.35)}
    ${strokeHighlight(toSc, right, bColor, 2.35)}
    ${labels}`;
}

function meshCylinderStroke(cx, cy, scale = 22) {
  const toSc = makeSpatialProjector(cx, cy, scale);
  const R = 0.85, H = 2.35;
  const sample = (u, v) => {
    const theta = u * 2 * Math.PI;
    const h = -H / 2 + v * H;
    return { x: R * Math.cos(theta), y: h, z: R * Math.sin(theta) };
  };
  const mesh = strokeParametricGrid(toSc, sample, 24, 10, {
    stroke: '#64748b',
    sw: 0.65,
    opNear: 0.82,
    opFar: 0.2,
  });
  const endTop = [], endBot = [], alongA = [];
  for (let i = 0; i <= 56; i++) {
    const th = (i / 56) * 2 * Math.PI;
    endTop.push({ x: R * Math.cos(th), y: H / 2, z: R * Math.sin(th) });
    endBot.push({ x: R * Math.cos(th), y: -H / 2, z: R * Math.sin(th) });
  }
  for (let j = 0; j <= 28; j++) {
    const h = -H / 2 + (j / 28) * H;
    alongA.push({ x: R, y: h, z: 0 });
  }
  return `${mesh}
    ${strokeHighlight(toSc, endTop, '#dc2626')}
    ${strokeHighlight(toSc, endBot, '#dc2626')}
    ${strokeHighlight(toSc, alongA, ECC_CYAN)}`;
}

/**
 * Intermediate: flat square rolled into an open trough — a-edges approach
 * but do not meet yet (not a closed cylinder).
 */
function meshRollingStroke(cx, cy, scale = 24) {
  const toSc = makeSpatialProjector(cx, cy, scale);
  const R = 1.05;
  const H = 2.35;
  // Open arc ~220° — lips (a) face each other across a gap
  const th0 = Math.PI * 0.35;
  const span = Math.PI * 1.30;
  const sample = (u, v) => {
    const theta = th0 + u * span;
    const h = -H / 2 + v * H;
    return { x: R * Math.cos(theta), y: h, z: R * Math.sin(theta) };
  };
  const mesh = strokeParametricGrid(toSc, sample, 20, 10, {
    stroke: '#64748b',
    sw: 0.7,
    opNear: 0.82,
    opFar: 0.22,
  });
  const a0 = [], a1 = [], bBot = [], bTop = [];
  for (let j = 0; j <= 28; j++) {
    const h = -H / 2 + (j / 28) * H;
    a0.push({ x: R * Math.cos(th0), y: h, z: R * Math.sin(th0) });
    a1.push({ x: R * Math.cos(th0 + span), y: h, z: R * Math.sin(th0 + span) });
  }
  for (let i = 0; i <= 40; i++) {
    const theta = th0 + (i / 40) * span;
    bBot.push({ x: R * Math.cos(theta), y: -H / 2, z: R * Math.sin(theta) });
    bTop.push({ x: R * Math.cos(theta), y: H / 2, z: R * Math.sin(theta) });
  }
  return `${mesh}
    ${strokeHighlight(toSc, a0, ECC_CYAN, 2.0)}
    ${strokeHighlight(toSc, a1, ECC_CYAN, 2.0)}
    ${strokeHighlight(toSc, bBot, '#dc2626', 2.0)}
    ${strokeHighlight(toSc, bTop, '#dc2626', 2.0)}`;
}

function meshBentTubeStroke(cx, cy, scale = 20) {
  const toSc = makeSpatialProjector(cx, cy, scale);
  const bendR = 1.35, tubeR = 0.52;
  const sample = (u, v) => {
    // U opening upward: θ from π → 2π
    const theta = Math.PI + u * Math.PI;
    const phi = v * 2 * Math.PI;
    const ccx = bendR * Math.cos(theta);
    const ccy = bendR * Math.sin(theta);
    const nx0 = Math.cos(theta), ny0 = Math.sin(theta);
    return {
      x: ccx + tubeR * Math.cos(phi) * nx0,
      y: ccy + tubeR * Math.cos(phi) * ny0,
      z: tubeR * Math.sin(phi),
    };
  };
  const mesh = strokeParametricGrid(toSc, sample, 22, 12, {
    stroke: '#64748b',
    sw: 0.65,
    opNear: 0.82,
    opFar: 0.18,
  });
  const endL = [], endR = [], alongA = [];
  for (let j = 0; j <= 40; j++) {
    const phi = (j / 40) * 2 * Math.PI;
    for (const [theta, arr] of [[Math.PI, endL], [2 * Math.PI, endR]]) {
      const ccx = bendR * Math.cos(theta), ccy = bendR * Math.sin(theta);
      const nx0 = Math.cos(theta), ny0 = Math.sin(theta);
      arr.push({
        x: ccx + tubeR * Math.cos(phi) * nx0,
        y: ccy + tubeR * Math.cos(phi) * ny0,
        z: tubeR * Math.sin(phi),
      });
    }
  }
  for (let i = 0; i <= 48; i++) {
    const theta = Math.PI + (i / 48) * Math.PI;
    alongA.push({
      x: (bendR + tubeR) * Math.cos(theta),
      y: (bendR + tubeR) * Math.sin(theta),
      z: 0,
    });
  }
  return `${mesh}
    ${strokeHighlight(toSc, alongA, ECC_CYAN)}
    ${strokeHighlight(toSc, endL, '#dc2626')}
    ${strokeHighlight(toSc, endR, '#dc2626')}`;
}

function meshTorusStroke(cx, cy, scale = 14) {
  const toSc = makeSpatialProjector(cx, cy, scale);
  const R = 1.55, r = 0.58;
  const sample = (u, v) => {
    const theta = u * 2 * Math.PI;
    const phi = v * 2 * Math.PI;
    return {
      x: (R + r * Math.cos(phi)) * Math.cos(theta),
      y: (R + r * Math.cos(phi)) * Math.sin(theta),
      z: r * Math.sin(phi),
    };
  };
  const mesh = strokeParametricGrid(toSc, sample, 28, 14, {
    stroke: '#64748b',
    sw: 0.6,
    opNear: 0.85,
    opFar: 0.16,
  });
  const lon = [], mer = [];
  for (let i = 0; i <= 72; i++) {
    const theta = (i / 72) * 2 * Math.PI;
    lon.push(sample(theta / (2 * Math.PI), 0));
  }
  for (let j = 0; j <= 48; j++) {
    const phi = (j / 48) * 2 * Math.PI;
    mer.push(sample(0, phi / (2 * Math.PI)));
  }
  return `${mesh}
    ${strokeHighlight(toSc, lon, ECC_CYAN, 1.8)}
    ${strokeHighlight(toSc, mer, '#dc2626', 1.8)}`;
}

function planeToTorusChrome(idSuffix) {
  const F = `font-family="${FONT_MONO}"`;
  const defs = `<defs>
    <marker id="ptt-arr-step-${idSuffix}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <polygon points="0 0.5, 6 3, 0 5.5" fill="${STROKE.axisStrong}"/>
    </marker>
  </defs>`;
  function stepArrow(x1, y1, x2, y2, label, color) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    const lx = vertical ? mx + 14 : mx;
    const ly = vertical ? my + 4 : my - 8;
    const anchor = vertical ? 'start' : 'middle';
    return `
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE.axis}" stroke-width="1.15" marker-end="url(#ptt-arr-step-${idSuffix})"${VEC}/>
      <text x="${lx}" y="${ly}" ${F} font-size="10" text-anchor="${anchor}" fill="${color}">${label}</text>`;
  }
  return { F, defs, stepArrow };
}

/** Flat square → rolling → cylinder → bent → torus (single row, stroke camera). */
function planeToTorusFigure() {
  const N = 5;
  const pw = 188;
  const ph = 148;
  const gapX = 14;
  const W = N * pw + (N - 1) * gapX;
  const H = ph;
  const { defs } = planeToTorusChrome('spatial');
  const F = `font-family="${FONT_MONO}"`;
  const cap = `${F} font-size="10" text-anchor="middle" fill="#4b5563"`;
  const ECC_RED = '#dc2626';

  // Geometry high; caption sits snug under the lowest mesh stroke
  const cellCx = (i) => i * (pw + gapX) + pw / 2;
  const geomCy = 68;
  const capY = 134;

  const panels = [
    {
      scale: 34,
      draw: (cx, cy, scale) => `
        ${meshSquareStroke(cx, cy, scale, { aColor: ECC_CYAN, bColor: ECC_RED, rotZDeg: 90, edgeLabels: true })}
        <text x="${cx}" y="${capY}" ${cap}>flat square</text>`,
    },
    {
      scale: 30,
      draw: (cx, cy, scale) => `
        ${meshRollingStroke(cx, cy, scale)}
        <text x="${cx}" y="${capY}" ${cap}>rolling (a closing)</text>`,
    },
    {
      scale: 28,
      draw: (cx, cy, scale) => `
        ${meshCylinderStroke(cx, cy, scale)}
        <text x="${cx}" y="${capY}" ${cap}>cylinder (a glued)</text>`,
    },
    {
      scale: 30,
      draw: (cx, cy, scale) => `
        ${meshBentTubeStroke(cx, cy, scale)}
        <text x="${cx}" y="${capY}" ${cap}>bent tube</text>`,
    },
    {
      scale: 26,
      draw: (cx, cy, scale) => `
        ${meshTorusStroke(cx, cy, scale)}
        <text x="${cx}" y="${capY}" ${cap}>torus (a and b glued)</text>`,
    },
  ];

  let cells = '';
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    cells += p.draw(cellCx(i), geomCy, p.scale);
  }

  const body = `
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      ${defs}
      ${cells}
    </g>`;

  return svgWrap(W, H, body);
}

export function getEccPrimerFigures() {
  return {
    curveSpatial: curveSpatialFigure(),
    finiteFieldToy: finiteFieldToyFigure(),
    finiteFieldScale: finiteFieldScaleFigure(),
    planeToTorus: planeToTorusFigure(),
    torus: torusFigure(),
    pointAdd: pointAddFigure(),
    pointDouble: pointDoubleFigure(),
    pointOpsGrid: pointOpsGridFigure(),
  };
}
