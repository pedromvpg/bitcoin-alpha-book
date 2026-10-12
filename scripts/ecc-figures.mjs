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
  grid: '#d9dde3',
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"${ah}>${body}</svg>`;
}

function dot(proj, x, y, r = 3.5) {
  const p = proj(x, y);
  return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r}" fill="${STROKE.point}"/>`;
}

function label(proj, x, y, text, dx = 6, dy = -6, size = 11, anchor = 'start') {
  const p = proj(x, y);
  return `<text x="${(p.x + dx).toFixed(2)}" y="${(p.y + dy).toFixed(2)}" font-family="Basis Grotesque Mono Pro, monospace" font-size="${size}" font-weight="600" text-anchor="${anchor}" fill="${STROKE.panelTitle}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke fill">${text}</text>`;
}

/** Demo points — compact so constructions fit a readable zoom window */
const P_ADD = { x: 2, y: yUpper(2) };
const Q_ADD = { x: 3, y: yUpper(3) };
const R_ADD = sumDistinct(P_ADD.x, P_ADD.y, Q_ADD.x, Q_ADD.y); // P ⊕ Q
const RPRIME_ADD = { x: R_ADD.x, y: -R_ADD.y }; // third intersection on the chord

const P_DBL = { x: 2, y: yUpper(2) };
const R2_DBL = sumDouble(P_DBL.x, P_DBL.y); // 2P
const RPRIME_DBL = { x: R2_DBL.x, y: -R2_DBL.y };

/** x of the curve's nose (where y = 0) */
const NOSE_X = Math.cbrt(-B);

/** Subtraction demo: P − Q = P ⊕ (−Q) lands at (1.08, 2.88), inside the view */
const P_SUB = { x: -1.8, y: yUpper(-1.8) };
const Q_SUB = { x: 2.6, y: yUpper(2.6) };

/** Shared framing for op figures — symmetric in y so the curve's mirror reads */
const OP_VIEW = { xMin: -2.8, xMax: 4.2, yMin: -6.8, yMax: 6.8 };


/**
 * Stacked curve slices: y² = x³ + (7 + z) for integer z.
 * Oblique projection — each slice keeps its upright shape (x right, y up) and
 * z recedes diagonally up-right, so every curve reads as an elliptic curve.
 * z = 0 is secp256k1 (red). Titles live in HTML (build.js).
 */
function curveSpatialFigure() {
  const W = 770, H = 700;
  const SC = 34;                 // px per unit in x and y
  const KX = 10, KY = -7;       // px offset per unit of z (depth up-right)
  const CX = 300, CY = 350;      // screen position of the origin at z = 0
  const toSc = (x, y, z) => ({ x: CX + x * SC + z * KX, y: CY - y * SC + z * KY });

  const X_MAX = 4.6, Y_CLIP = 8.4;
  const Z_LO = -6, Z_HI = 6, Z_STEP = 1;
  const F = `font-family="${FONT_MONO}"`;

  // Cool below z=0 (cyan family), warm above (orange family) — same language as torus figures
  function levelStyle(z) {
    if (z === 0) return { col: '#dc2626', w: 3.0, op: 1 };
    const near = z < 0 ? (z - Z_LO) / (0 - Z_LO) : (Z_HI - z) / Z_HI; // 1 next to z = 0
    const col = z < 0 ? ECC_CYAN : ECC_ORANGE;
    return { col, w: 1.1 + 0.6 * near, op: 0.35 + 0.55 * near };
  }

  function drawLevel(z) {
    const { col, w, op } = levelStyle(z);
    const pts = curveLoopPoints(7 + z, X_MAX, Y_CLIP, 200);
    if (pts.length < 2) return '';
    const d = 'M ' + pts.map((p) => {
      const q = toSc(p.x, p.y, z);
      return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    }).join(' L ');
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w.toFixed(2)}" opacity="${op.toFixed(2)}" stroke-linejoin="round"${VEC}/>`;
  }

  function seg(a, b, col, sw, extra = '') {
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${col}" stroke-width="${sw}"${extra}${VEC}/>`;
  }

  // Painter order: far (high z, drawn up-right/behind) → near; secp256k1 drawn last
  let curvesSvg = '';
  // z ≥ −6 keeps b = 7 + z > 0, so the singular cusp b = 0 (z = −7) never appears
  for (let z = Z_HI; z >= Z_LO; z -= Z_STEP) {
    if (z === 0) continue;
    curvesSvg += drawLevel(z);
  }

  // z = 0 frame — makes the red slice read as "the" chart
  const fr = [toSc(-2.4, -Y_CLIP - 0.3, 0), toSc(X_MAX + 0.3, -Y_CLIP - 0.3, 0), toSc(X_MAX + 0.3, Y_CLIP + 0.3, 0), toSc(-2.4, Y_CLIP + 0.3, 0)];
  const frame = `<polygon points="${fr.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="rgba(220,38,38,0.05)" stroke="#dc2626" stroke-width="0.9" opacity="0.7"${VEC}/>`;

  const arrow = (id) => `<marker id="${id}" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0.5, 9 4.5, 0 8.5" fill="${STROKE.axisStrong}"/></marker>`;
  const o = toSc(0, 0, 0);
  const xEnd = toSc(X_MAX + 0.9, 0, 0);
  const yEnd = toSc(0, Y_CLIP + 1.0, 0);
  const zEnd = toSc(0, 0, Z_HI + 5);
  const zStart = toSc(0, 0, Z_LO - 3);
  const axes = `
    <defs>${arrow('ecc-arr-cs')}</defs>
    ${seg(toSc(-2.6, 0, 0), xEnd, STROKE.axisStrong, 1.2, ' marker-end="url(#ecc-arr-cs)"')}
    ${seg(toSc(0, -Y_CLIP - 0.6, 0), yEnd, STROKE.axisStrong, 1.2, ' marker-end="url(#ecc-arr-cs)"')}
    ${seg(zStart, zEnd, STROKE.axisStrong, 1.2, ' marker-end="url(#ecc-arr-cs)"')}
    <text x="${(xEnd.x + 8).toFixed(1)}" y="${(xEnd.y + 6).toFixed(1)}" ${F} font-size="18" font-style="italic" fill="${STROKE.panelTitle}">x</text>
    <text x="${(yEnd.x - 18).toFixed(1)}" y="${(yEnd.y + 6).toFixed(1)}" ${F} font-size="18" font-style="italic" fill="${STROKE.panelTitle}">y</text>
    <text x="${(zEnd.x + 8).toFixed(1)}" y="${(zEnd.y + 2).toFixed(1)}" ${F} font-size="18" font-style="italic" fill="${STROKE.panelTitle}">z</text>`;

  const zLbl = toSc(X_MAX + 0.3, -Y_CLIP - 0.3, 0);
  const planeLabel = `<text x="${(zLbl.x + 8).toFixed(1)}" y="${(zLbl.y + 4).toFixed(1)}" ${F} font-size="15" fill="#dc2626">z = 0</text>`;

  const keyX = 520, keyY = 60;
  const keyRow = (i, col, sw, txt, fill) => `
    <line x1="${keyX}" y1="${keyY + i * 32}" x2="${keyX + 30}" y2="${keyY + i * 32}" stroke="${col}" stroke-width="${sw}"${VEC}/>
    <text x="${keyX + 40}" y="${keyY + i * 32 + 6}" ${F} font-size="19" fill="${fill}">${txt}</text>`;
  const key = keyRow(0, '#dc2626', 3, 'secp256k1 (b = 7)', '#374151')
    + keyRow(1, ECC_CYAN, 2, 'z &lt; 0 (b &lt; 7)', '#4b5563')
    + keyRow(2, ECC_ORANGE, 2, 'z &gt; 0 (b &gt; 7)', '#4b5563');

  const body = `
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      ${curvesSvg}
      ${frame}
      ${axes}
      ${drawLevel(0)}
      ${planeLabel}
      ${key}
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

/** "𝔽" with a real subscript (Unicode subscript digits fall back to tiny glyphs) */
function fieldLabel(p) {
  return `𝔽<tspan baseline-shift="sub" font-size="70%">${p}</tspan>`;
}

/**
 * One F_p scatter panel at origin (ox, oy); plot is size×size.
 * Integer coordinates 0…p−1 sit on grid intersections; the orange midline is
 * y = p/2, the mirror for negation (x, y) ↦ (x, p − y).
 */
function finiteFieldPanelSvg(p, ox, oy, size, {
  gridStep = 1,
  tickVals = null,
  dotR = null,
  title = '',
  subtitle = '',
  font = 13,
} = {}) {
  const pts = toyCurvePoints(p);
  const inset = size / (p + 1) / 2 + 2; // keep edge dots off the frame
  const cell = (size - 2 * inset) / (p - 1);
  const r = dotR ?? Math.max(0.55, Math.min(4, cell * 0.3));
  const toPx = (xv, yv) => ({
    x: ox + inset + xv * cell,
    y: oy + size - inset - yv * cell,
  });
  const F = `font-family="${FONT_MONO}"`;

  let grid = '';
  const step = Math.max(1, gridStep | 0);
  for (let i = 0; i < p; i += step) {
    const a = toPx(i, 0);
    grid += `<line x1="${a.x.toFixed(2)}" y1="${oy}" x2="${a.x.toFixed(2)}" y2="${oy + size}" stroke="${STROKE.grid}" stroke-width="0.6"${VEC}/>`;
    const c = toPx(0, i);
    grid += `<line x1="${ox}" y1="${c.y.toFixed(2)}" x2="${ox + size}" y2="${c.y.toFixed(2)}" stroke="${STROKE.grid}" stroke-width="0.6"${VEC}/>`;
  }
  grid += `<rect x="${ox}" y="${oy}" width="${size}" height="${size}" fill="none" stroke="${STROKE.axisStrong}" stroke-width="1"${VEC}/>`;

  const midY = toPx(0, p / 2).y;
  const midLine = `<line x1="${ox}" y1="${midY.toFixed(2)}" x2="${ox + size}" y2="${midY.toFixed(2)}" stroke="${ECC_ORANGE}" stroke-width="1.4"${VEC}/>`;

  let dots = '';
  for (const q of pts) {
    const c = toPx(q.x, q.y);
    dots += `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${STROKE.curve}"/>`;
  }

  let ticks = '';
  if (tickVals && tickVals.length) {
    for (const t of tickVals) {
      if (t < 0 || t >= p) continue;
      const c = toPx(t, t);
      ticks += `<text x="${c.x.toFixed(1)}" y="${(oy + size + font + 4).toFixed(1)}" ${F} font-size="${font}" text-anchor="middle" fill="${STROKE.axisStrong}">${t}</text>`;
      ticks += `<text x="${(ox - 6).toFixed(1)}" y="${(c.y + font * 0.35).toFixed(1)}" ${F} font-size="${font}" text-anchor="end" fill="${STROKE.axisStrong}">${t}</text>`;
    }
  }

  const cap = title
    ? `<text x="${(ox + size / 2).toFixed(1)}" y="${(oy - 12).toFixed(1)}" ${F} font-size="${font + 4}" font-weight="600" text-anchor="middle" fill="${STROKE.panelTitle}">${title}</text>`
    : '';
  const sub = subtitle
    ? `<text x="${(ox + size / 2).toFixed(1)}" y="${(oy + size + (tickVals ? 2 * font + 12 : font + 6)).toFixed(1)}" ${F} font-size="${font}" text-anchor="middle" fill="${STROKE.axisStrong}">${subtitle}</text>`
    : '';

  return `${cap}${grid}${midLine}${dots}${ticks}${sub}`;
}

function finiteFieldToyFigure() {
  const p = TOY_P;
  const plot = 400;
  const leftPad = 58;
  const topPad = 14;
  const rightPad = 96;
  const w = leftPad + plot + rightPad;
  const h = topPad + plot + 58;
  const F = `font-family="${FONT_MONO}"`;
  const inset = plot / (p + 1) / 2 + 2;
  const midY = topPad + plot - inset - (p / 2) * ((plot - 2 * inset) / (p - 1));

  const body = `
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <g stroke-linecap="round">
    ${finiteFieldPanelSvg(p, leftPad, topPad, plot, {
      tickVals: [0, 4, 8, 12, 16],
      dotR: 4,
      font: 16,
    })}
    <text x="${leftPad + plot + 10}" y="${(midY + 6).toFixed(1)}" ${F} font-size="17" fill="${ECC_ORANGE}">y = p/2</text>
    <text x="${leftPad + plot / 2}" y="${topPad + plot + 50}" ${F} font-size="18" font-style="italic" text-anchor="middle" fill="${STROKE.panelTitle}">x</text>
    <text x="${leftPad - 44}" y="${topPad + plot / 2 + 6}" ${F} font-size="18" font-style="italic" text-anchor="middle" fill="${STROKE.panelTitle}">y</text>
  </g>`;

  return svgWrap(w, h, body);
}

/**
 * Scale ladder: toy F_17 → denser F_251 → secp256k1 faked density.
 * Same curve y² = x³ + 7; orange midline = negation mirror.
 */
function finiteFieldScaleFigure() {
  const plot = 236;
  const top = 40;
  const gap = 96;
  const x0 = 46;
  const x1 = x0 + plot + gap;
  const x2 = x1 + plot + gap;
  const W = x2 + plot + 34;
  const H = top + plot + 76;
  const FONT = 19;
  const F = `font-family="${FONT_MONO}"`;

  const n17 = toyCurvePoints(17).length;
  const n251 = toyCurvePoints(251).length;

  const panelA = finiteFieldPanelSvg(17, x0, top, plot, {
    tickVals: [0, 8, 16],
    dotR: 3.2,
    title: fieldLabel(17),
    subtitle: `${n17} points`,
    font: FONT,
  });

  const panelB = finiteFieldPanelSvg(251, x1, top, plot, {
    gridStep: 25,
    tickVals: [0, 125, 250],
    dotR: 1.3,
    title: fieldLabel(251),
    subtitle: `${n251} points`,
    font: FONT,
  });

  // Panel C: fake a near-continuous field (secp256k1 cannot be plotted literally).
  // Seeded uniform scatter mirrored across the midline. Dots are tiny filled
  // squares batched into a few <path>s: zero-length round-cap strokes are
  // dropped by Chrome's PDF backend, and one <circle> each bloats the HTML.
  const ox = x2;
  const oy = top;
  const midY = oy + plot / 2;
  const pad = 2;
  const seam = 2;
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Coordinates are written in tenths of a px inside a scale(0.1) group with
  // relative moves, so ~50k dots stay well under 1 MB of HTML.
  const nDots = 25000; // upper half; mirrored → ~50000 visible
  const SIZES = [5, 7, 9]; // tenths of a px
  const OPAC = [0.55, 0.75, 0.95];
  const buckets = SIZES.map(() => OPAC.map(() => ({ d: [], cx: 0, cy: 0 })));
  const put = (b, x, y, sz) => {
    const X = Math.round(x * 10 - sz / 2);
    const Y = Math.round(y * 10 - sz / 2);
    b.d.push(`m${X - b.cx} ${Y - b.cy}h${sz}v${sz}h-${sz}z`);
    b.cx = X; // after z the current point is back at the subpath start
    b.cy = Y;
  };
  for (let k = 0; k < nDots; k++) {
    const x = ox + pad + rand() * (plot - 2 * pad);
    const yTop = oy + pad + rand() * (midY - oy - pad - seam);
    const yBot = oy + plot - (yTop - oy);
    const b = buckets[Math.floor(rand() * SIZES.length)][Math.floor(rand() * OPAC.length)];
    const sz = SIZES[buckets.findIndex((row) => row.includes(b))];
    put(b, x, yTop, sz);
    put(b, x, yBot, sz);
  }
  let stipple = '<g transform="scale(0.1)">';
  buckets.forEach((row) => row.forEach((b, oi) => {
    stipple += `<path d="M0 0${b.d.join('')}" fill="${STROKE.curve}" opacity="${OPAC[oi]}"/>`;
  }));
  stipple += '</g>';
  const clipId = 'ff-scale-secp-clip';
  const panelC = `
    <defs>
      <clipPath id="${clipId}"><rect x="${ox}" y="${oy}" width="${plot}" height="${plot}"/></clipPath>
    </defs>
    <text x="${(ox + plot / 2).toFixed(1)}" y="${(oy - 12).toFixed(1)}" ${F} font-size="${FONT + 4}" font-weight="600" text-anchor="middle" fill="${STROKE.panelTitle}">secp256k1</text>
    <rect x="${ox}" y="${oy}" width="${plot}" height="${plot}" fill="#fff"/>
    <g clip-path="url(#${clipId})">${stipple}</g>
    <rect x="${ox}" y="${oy}" width="${plot}" height="${plot}" fill="none" stroke="${STROKE.axisStrong}" stroke-width="1"${VEC}/>
    <line x1="${ox + 1}" y1="${midY}" x2="${ox + plot - 1}" y2="${midY}" stroke="#fff" stroke-width="3"${VEC}/>
    <line x1="${ox + 1}" y1="${midY}" x2="${ox + plot - 1}" y2="${midY}" stroke="${ECC_ORANGE}" stroke-width="1.4"${VEC}/>
    <text x="${(ox + plot / 2).toFixed(1)}" y="${(oy + plot + FONT + 4).toFixed(1)}" ${F} font-size="${FONT}" text-anchor="middle" fill="${STROKE.axisStrong}">p ≈ 2<tspan baseline-shift="super" font-size="70%">256</tspan></text>
    <text x="${(ox + plot / 2).toFixed(1)}" y="${(oy + plot + 2 * FONT + 12).toFixed(1)}" ${F} font-size="${FONT}" text-anchor="middle" fill="${STROKE.axisStrong}">~10<tspan baseline-shift="super" font-size="70%">77</tspan> points (schematic)</text>`;

  // Arrows sit in the gaps, clear of panel B's left-hand tick labels
  const ay = top + plot / 2;
  const arrows = `
    <defs>
      <marker id="ff-scale-arr" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
        <polygon points="0 0.5, 9 4.5, 0 8.5" fill="${STROKE.axisStrong}"/>
      </marker>
    </defs>
    <line x1="${x0 + plot + 6}" y1="${ay}" x2="${x1 - 52}" y2="${ay}" stroke="${STROKE.axisStrong}" stroke-width="1.4" marker-end="url(#ff-scale-arr)"${VEC}/>
    <line x1="${x1 + plot + 8}" y1="${ay}" x2="${x2 - 8}" y2="${ay}" stroke="${STROKE.axisStrong}" stroke-width="1.4" marker-end="url(#ff-scale-arr)"${VEC}/>`;

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

function reflectionGuide(proj, x, yFrom, yTo, suffix, { labelSide = 'left', size = 11, labelX = null } = {}) {
  const p1 = proj(x, yFrom);
  const p2 = proj(x, yTo);
  // Stop short of both dots so the arrowhead never sits on a point
  const dir = Math.sign(p2.y - p1.y) || 1;
  const yA = p1.y + dir * 9;
  const yB = p2.y - dir * 11;
  const yMid = (p1.y + p2.y) / 2;
  const left = labelSide === 'left';
  // labelX (data units) lets a label sit clear of the curve, e.g. left of the nose
  const lx = labelX != null ? proj(labelX, 0).x : p1.x + (left ? -16 : 16);
  return `
    <defs>
      <marker id="ecc-arrow-${suffix}" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
        <polygon points="0 0.5, 7 3.5, 0 6.5" fill="${ECC_ORANGE}"/>
      </marker>
    </defs>
    <path d="M ${p1.x.toFixed(2)} ${yA.toFixed(2)} L ${p2.x.toFixed(2)} ${yB.toFixed(2)}"
      stroke="${ECC_ORANGE}" stroke-width="1.6" fill="none" marker-end="url(#ecc-arrow-${suffix})"${VEC}/>
    <text x="${lx.toFixed(2)}" y="${(yMid - 10).toFixed(2)}" font-family="${FONT_MONO}" font-size="${size}" text-anchor="${left ? 'end' : 'start'}" fill="${ECC_ORANGE}" ${HALO}>reflect</text>`;
}

/** White outline behind text so labels stay legible where they meet strokes */
const HALO = 'stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke fill"';

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

/** Full line through (x, y) with slope lam, clipped to the view */
function slopeLine(proj, x, y, lam, view, color, sw = 1.6) {
  const span = 50;
  const seg = clipSegToView(x - span, y - lam * span, x + span, y + lam * span, view);
  if (!seg) return '';
  return `<path d="${linePath(proj, seg.a.x, seg.a.y, seg.b.x, seg.b.y)}" stroke="${color}" stroke-width="${sw}" fill="none"${VEC}/>`;
}

/**
 * y² = x³ + b as ONE continuous path: lower branch (far → nose), through the
 * exact root (∛−b, 0), then upper branch (nose → far). Samples cluster near the
 * root (x = x₀ + t²·span) so the nose is smooth; |y| is clipped to yLimit.
 */
function curveLoopPoints(b, xLimit, yLimit, steps = 240) {
  const x0 = Math.cbrt(-b);
  const xTop = Math.min(xLimit, Math.cbrt(yLimit * yLimit - b));
  if (!(xTop > x0)) return [];
  const upper = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + t * t * (xTop - x0);
    upper.push({ x, y: Math.sqrt(Math.max(0, x * x * x + b)) });
  }
  upper[0].y = 0;
  const lower = upper.slice(1).reverse().map((p) => ({ x: p.x, y: -p.y }));
  return [...lower, ...upper];
}

function curvePath(proj, view, b = B) {
  const yLim = Math.min(view.yMax, -view.yMin);
  return pathFromPoints(proj, curveLoopPoints(b, view.xMax, yLim));
}

function curveAndAxes(proj, view, overhang = 0.35) {
  const { xMin, xMax, yMin, yMax } = view;
  const x0 = proj(xMin - overhang, 0);
  const x1 = proj(xMax + overhang * 1.4, 0);
  const y0 = proj(0, yMin);
  const y1 = proj(0, yMax);
  return `
    <line x1="${y0.x.toFixed(2)}" y1="${y0.y.toFixed(2)}" x2="${y1.x.toFixed(2)}" y2="${y1.y.toFixed(2)}" stroke="${STROKE.axis}" stroke-width="1.1" fill="none"${VEC}/>
    <line x1="${x0.x.toFixed(2)}" y1="${x0.y.toFixed(2)}" x2="${x1.x.toFixed(2)}" y2="${x1.y.toFixed(2)}" stroke="${STROKE.axis}" stroke-width="1.1" fill="none"${VEC}/>
    <path d="${curvePath(proj, view)}" stroke="${STROKE.curve}" stroke-width="2.2" fill="none"${VEC}/>
    <text x="${(x1.x - 1).toFixed(2)}" y="${(x1.y + 18).toFixed(2)}" font-family="${FONT_MONO}" font-size="15" font-style="italic" font-weight="600" text-anchor="end" fill="${STROKE.panelTitle}">x</text>
    <text x="${(y1.x + 9).toFixed(2)}" y="${(y1.y + 12).toFixed(2)}" font-family="${FONT_MONO}" font-size="15" font-style="italic" font-weight="600" fill="${STROKE.panelTitle}">y</text>`;
}

/**
 * Jimmy Song–style overview: addition, doubling, inverse → 𝒪, subtraction.
 * 2×2 grid of the same real curve with the essential construction in each cell.
 * Every construction point is checked against the view at build time.
 */
function pointOpsGridFigure() {
  const COLS = 2;
  const ROWS = 2;
  const pw = 440;
  const ph = 560;
  const gapX = 40;
  const gapY = 44;
  const titleH = 34;
  const W = COLS * pw + (COLS - 1) * gapX;
  const H = ROWS * (ph + titleH) + (ROWS - 1) * gapY;
  const view = OP_VIEW;
  const pad = 22;
  const LBL = 20;
  const DOT = 5.6;

  const assertInView = (name, pts) => {
    for (const [k, p] of Object.entries(pts)) {
      const ok = p.x > view.xMin + 0.2 && p.x < view.xMax - 0.2
        && p.y > view.yMin + 0.2 && p.y < view.yMax - 0.2;
      if (!ok) throw new Error(`ecc-figures: ${name} point ${k} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) is outside the view`);
    }
  };

  const panels = [
    {
      title: '(a)  Addition  P ⊕ Q',
      draw: (proj) => {
        assertInView('addition', { P: P_ADD, Q: Q_ADD, R: R_ADD, Rp: RPRIME_ADD });
        return `
          ${slopeLine(proj, P_ADD.x, P_ADD.y, R_ADD.lam, view, ECC_CYAN)}
          ${reflectionGuide(proj, RPRIME_ADD.x, RPRIME_ADD.y, R_ADD.y, 'g-add', { labelSide: 'left', size: 16, labelX: NOSE_X - 0.2 })}
          ${dot(proj, P_ADD.x, P_ADD.y, DOT)}
          ${dot(proj, Q_ADD.x, Q_ADD.y, DOT)}
          ${dot(proj, RPRIME_ADD.x, RPRIME_ADD.y, DOT)}
          ${dot(proj, R_ADD.x, R_ADD.y, DOT)}
          ${label(proj, P_ADD.x, P_ADD.y, 'P', 12, 18, LBL)}
          ${label(proj, Q_ADD.x, Q_ADD.y, 'Q', 12, 18, LBL)}
          ${label(proj, RPRIME_ADD.x, RPRIME_ADD.y, 'R′', 10, 34, LBL)}
          ${label(proj, R_ADD.x, R_ADD.y, 'R', -26, -8, LBL)}`;
      },
    },
    {
      title: '(b)  Doubling  2P = P ⊕ P',
      draw: (proj) => {
        assertInView('doubling', { P: P_DBL, R: R2_DBL, Rp: RPRIME_DBL });
        return `
          ${slopeLine(proj, P_DBL.x, P_DBL.y, R2_DBL.lam, view, STROKE.tangent)}
          ${reflectionGuide(proj, RPRIME_DBL.x, RPRIME_DBL.y, R2_DBL.y, 'g-dbl', { labelSide: 'left', size: 16, labelX: NOSE_X - 0.2 })}
          ${dot(proj, P_DBL.x, P_DBL.y, DOT)}
          ${dot(proj, RPRIME_DBL.x, RPRIME_DBL.y, DOT)}
          ${dot(proj, R2_DBL.x, R2_DBL.y, DOT)}
          ${label(proj, P_DBL.x, P_DBL.y, 'P', 12, 18, LBL)}
          ${label(proj, RPRIME_DBL.x, RPRIME_DBL.y, 'R′', 14, 7, LBL)}
          ${label(proj, R2_DBL.x, R2_DBL.y, '2P', -36, -8, LBL)}`;
      },
    },
    {
      title: '(c)  Inverse  P ⊕ (−P) = 𝒪',
      draw: (proj) => {
        const P = P_DBL;
        const nP = { x: P.x, y: -P.y };
        assertInView('inverse', { P, nP });
        const top = proj(P.x, view.yMax);
        const bot = proj(P.x, view.yMin);
        return `
          <defs>
            <marker id="ecc-arrow-g-inf" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="userSpaceOnUse">
              <polygon points="0 0.5, 8 4, 0 7.5" fill="${ECC_CYAN}"/>
            </marker>
          </defs>
          <line x1="${bot.x.toFixed(2)}" y1="${bot.y.toFixed(2)}" x2="${top.x.toFixed(2)}" y2="${(top.y + 4).toFixed(2)}"
            stroke="${ECC_CYAN}" stroke-width="1.6" fill="none" marker-end="url(#ecc-arrow-g-inf)"${VEC}/>
          ${dot(proj, P.x, P.y, DOT)}
          ${dot(proj, nP.x, nP.y, DOT)}
          ${label(proj, P.x, P.y, 'P', 12, 20, LBL)}
          ${label(proj, nP.x, nP.y, '−P', 12, -10, LBL)}
          <text x="${(top.x - 12).toFixed(2)}" y="${(top.y + 18).toFixed(2)}" font-family="${FONT_MONO}" font-size="${LBL + 2}" font-weight="600" text-anchor="end" fill="${STROKE.panelTitle}" ${HALO}>𝒪</text>`;
      },
    },
    {
      title: '(d)  Subtraction  P − Q = P ⊕ (−Q)',
      draw: (proj) => {
        const P = P_SUB;
        const Q = Q_SUB;
        const nQ = { x: Q.x, y: -Q.y };
        const S = sumDistinct(P.x, P.y, nQ.x, nQ.y); // P ⊕ (−Q)
        const Sp = { x: S.x, y: -S.y };
        assertInView('subtraction', { P, Q, nQ, S, Sp });
        return `
          ${slopeLine(proj, P.x, P.y, S.lam, view, ECC_CYAN)}
          ${reflectionGuide(proj, Sp.x, Sp.y, S.y, 'g-sub', { labelSide: 'right', size: 16 })}
          ${dot(proj, P.x, P.y, DOT)}
          <circle cx="${proj(Q.x, Q.y).x.toFixed(2)}" cy="${proj(Q.x, Q.y).y.toFixed(2)}" r="${DOT}" fill="#ffffff" stroke="${STROKE.point}" stroke-width="1.8"/>
          ${dot(proj, nQ.x, nQ.y, DOT)}
          ${dot(proj, Sp.x, Sp.y, DOT)}
          ${dot(proj, S.x, S.y, DOT)}
          ${label(proj, P.x, P.y, 'P', -30, 16, LBL)}
          ${label(proj, Q.x, Q.y, 'Q', 12, 6, LBL)}
          ${label(proj, nQ.x, nQ.y, '−Q', 12, 6, LBL)}
          ${label(proj, Sp.x, Sp.y, 'R′', -36, 26, LBL)}
          ${label(proj, S.x, S.y, 'P − Q', 10, 26, LBL)}`;
      },
    },
  ];

  let body = '';
  panels.forEach((panel, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const ox = col * (pw + gapX);
    const oy = row * (ph + titleH + gapY);
    const base = makeProjector(view.xMin, view.xMax, view.yMin, view.yMax, pw, ph, pad);
    const off = (x, y) => {
      const p = base(x, y);
      return { x: p.x + ox, y: p.y + oy + titleH };
    };
    body += `
      <text x="${(ox + pw / 2).toFixed(1)}" y="${(oy + 20).toFixed(1)}" font-family="${FONT_MONO}" font-size="21" font-weight="600" text-anchor="middle" fill="${STROKE.panelTitle}">${panel.title}</text>
      <g stroke-linecap="round" stroke-linejoin="round">
        ${curveAndAxes(off, view, 0.15)}
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
  const aEdge = `stroke="${ECC_CYAN}" stroke-width="2.6" fill="none"${VEC}`;
  const bEdge = `stroke="${ECC_RED}" stroke-width="2.6" fill="none"${VEC}`;
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
    <text x="${FX}" y="${FY + flatW + 28}" ${F} font-size="15" fill="${ECC_CYAN}" stroke="#ffffff" stroke-width="3" paint-order="stroke fill">a: top = bottom → big circle</text>
    <text x="${FX}" y="${FY + flatW + 50}" ${F} font-size="15" fill="${ECC_RED}" stroke="#ffffff" stroke-width="3" paint-order="stroke fill">b: left = right → small circle</text>`;

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
  let maxY = FY + flatW + 60; // room for a/b key under the grid
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
  const arrow = `
    <defs>
      <marker id="ecc-arrow-tor" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
        <polygon points="0 0.5, 9 4.5, 0 8.5" fill="${STROKE.axisStrong}"/>
      </marker>
    </defs>
    <line x1="${AX}" y1="${AY}" x2="${AX + arrowLen}" y2="${AY}" stroke="${STROKE.axisStrong}" stroke-width="1.4" marker-end="url(#ecc-arrow-tor)"${VEC}/>
    <text x="${midX.toFixed(1)}" y="${(AY - 26).toFixed(1)}" ${F} font-size="14" text-anchor="middle" fill="${STROKE.axisStrong}">identify</text>
    <text x="${midX.toFixed(1)}" y="${(AY - 9).toFixed(1)}" ${F} font-size="14" text-anchor="middle" fill="${STROKE.axisStrong}">both pairs</text>`;

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

function strokeHighlight(toSc, pts3, color, sw = 2.4) {
  const sp = spatialPath(toSc, pts3);
  if (!sp.d) return '';
  return `<path d="${sp.d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${VEC}/>`;
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
    <marker id="ptt-arr-step-${idSuffix}" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
      <polygon points="0 0.5, 9 4.5, 0 8.5" fill="${STROKE.axisStrong}"/>
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

/** Flat square → rolling → cylinder → bent → torus (3 + 2 rows, stroke camera). */
function planeToTorusFigure() {
  const pw = 290;
  const ph = 250;
  const gapX = 34;
  const gapY = 18;
  const W = 3 * pw + 2 * gapX;
  const H = 2 * ph + gapY;
  const { defs } = planeToTorusChrome('spatial');
  const F = `font-family="${FONT_MONO}"`;
  const cap = `${F} font-size="19" text-anchor="middle" fill="#374151"`;
  const ECC_RED = '#dc2626';

  // Row 1 holds stages 1–3; row 2 centers stages 4–5 under the gaps
  const cells = [
    { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 },
    { col: 0.5, row: 1 }, { col: 1.5, row: 1 },
  ];
  const cellCx = (c) => c.col * (pw + gapX) + pw / 2;
  const cellTop = (c) => c.row * (ph + gapY);
  const geomDy = 110;
  const capDy = 238;

  const panels = [
    {
      scale: 58,
      label: '1  flat square',
      draw: (cx, cy, s) => meshSquareStroke(cx, cy, s, { aColor: ECC_CYAN, bColor: ECC_RED, rotZDeg: 90, edgeLabels: true }),
    },
    { scale: 52, label: '2  rolling (a closing)', draw: meshRollingStroke },
    { scale: 50, label: '3  cylinder (a glued)', draw: meshCylinderStroke },
    { scale: 52, label: '4  bent tube', draw: meshBentTubeStroke, dy: -34 },
    { scale: 46, label: '5  torus (a and b glued)', draw: meshTorusStroke },
  ];

  let out = '';
  panels.forEach((p, i) => {
    const c = cells[i];
    const cx = cellCx(c);
    const top = cellTop(c);
    out += `${p.draw(cx, top + geomDy + (p.dy || 0), p.scale)}
      <text x="${cx}" y="${top + capDy}" ${cap}>${p.label}</text>`;
  });

  // Step arrows between neighbors in the same row
  const arrowY = (row) => row * (ph + gapY) + geomDy;
  const stepArrow = (xa, xb, y) =>
    `<line x1="${xa.toFixed(1)}" y1="${y}" x2="${xb.toFixed(1)}" y2="${y}" stroke="${STROKE.axisStrong}" stroke-width="1.4" marker-end="url(#ptt-arr-step-spatial)"${VEC}/>`;
  let arrows = '';
  for (let i = 0; i < panels.length - 1; i++) {
    const a = cells[i], b = cells[i + 1];
    if (a.row !== b.row) continue;
    const xa = cellCx(a) + pw / 2 - 6;
    const xb = cellCx(b) - pw / 2 + 6;
    arrows += stepArrow(xa, xb, arrowY(a.row));
  }

  const body = `
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      ${defs}
      ${out}
      ${arrows}
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
    pointOpsGrid: pointOpsGridFigure(),
  };
}
