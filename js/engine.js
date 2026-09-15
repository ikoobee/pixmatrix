/**
 * Brand watermark engine (element-based) — pure functions, no UI dependency.
 *
 * Evolutions over the plain-text base engine:
 *  1. The watermark is an **element array**:
 *     [{type:'text',...}, {type:'image'(logo),...}], laid out horizontally
 *     into a "watermark unit" (buildUnit), then composited by layout mode —
 *     the unified implementation of mixed text+logo marks; adding a QR
 *     element later costs nothing;
 *  2. **Multi-size fitting**: applyWatermark(source, cfg, {ratio}) cover-
 *     crops to the target ratio (1:1 / 3:4 / 9:16); one config, many
 *     targets, no extra cost (the pure-function dividend);
 *  3. Text/logo sizes are percentages of each output's own long side, so
 *     marks look consistent across sizes.
 *
 * Kept from the base (engineering rules): toBlob exports, huge-image
 * downscaling, EXIF orientation, memory release, tile via createPattern.
 * Note: texts here are brand phrases — no auto-wrapping (manual \n).
 */

export const FONT_STACK =
  '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

export const DEFAULT_CONFIG = {
  elements: [],     // see buildUnit: text {type,content,sizePct,color,fontWeight,strokeWidth,strokeColor}; image {type,source:ImageBitmap|HTMLImageElement|canvas,sizePct}
  mode: 'br',       // tile | center | tl | tr | bl | br
  rotate: 0,        // manual rotation (90-degree steps)
  density: 3,       // tile density n x n (tile mode only)
  opacity: 0.85,    // overall opacity (applied at unit composition; logo and text share it)
  angle: 45,        // tile rotation angle
};

/** Single source of UI defaults (app.js init/reset/read fallbacks all use this). */
export const DEFAULTS = Object.freeze({
  mode: 'br',
  density: 3,
  opacityPct: 85,
  textColor: '#ffffff',
  textSizePct: 2.5,   // text size = long side * 2.5%
  logoSizePct: 5,     // logo height = long side * 5%
  strokeOn: true,     // text stroke (white text readable on light images)
});

/** Output size presets (original, 1:1 square, 3:4, 9:16). */
export const OUTPUT_SIZES = [
  { key: 'origin', ratio: null },
  { key: '1-1', ratio: 1 },
  { key: '3-4', ratio: 3 / 4 },
  { key: '9-16', ratio: 9 / 16 },
];

/* ---------- Basic utilities ---------- */

export function hexToRgba(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`无效颜色值: ${hex}`);
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function sourceSize(s) {
  return { w: s.naturalWidth || s.width || 0, h: s.naturalHeight || s.height || 0 };
}

export const MAX_CANVAS_PIXELS = 4096 * 4096; // ~16.7MP, mobile-safe canvas threshold

export function downscaleFactor(w, h, max = MAX_CANVAS_PIXELS) {
  return w * h > max ? Math.sqrt(max / (w * h)) : 1;
}

export async function decodeImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) { /* retry without options */ }
    try {
      return await createImageBitmap(file);
    } catch (_) { /* fall back to Image element */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Cover-crop math (pure function, Node-testable): take the center region of
 * a sw x sh source whose aspect ratio equals `ratio`; null returns the
 * whole image.
 * @returns {{w,h,sx,sy}} crop area (w/h = size, sx/sy = origin)
 */
export function computeCoverCrop(sw, sh, ratio = null) {
  if (!ratio || sw / sh === ratio) return { w: sw, h: sh, sx: 0, sy: 0 };
  let w, h;
  if (sw / sh > ratio) { h = sh; w = Math.round(sh * ratio); }
  else { w = sw; h = Math.round(sw / ratio); }
  const sx = Math.round((sw - w) / 2);
  const sy = Math.round((sh - h) / 2);
  return { w, h, sx, sy };
}

/**
 * Blurred-background drawing (blur fit mode): the source is cover-fitted to
 * the frame, softened via "downscale then upscale" bilinear resampling.
 * ctx.filter is not used (Safari lacks it); two resampling passes
 * (64px -> ~300px -> frame size) yield an evenly soft background.
 */
export function drawBlurredCover(ctx, base, W, H, rw, rh) {
  const crop = computeCoverCrop(rw, rh, W / H);
  // Pass 1: cover into a 64px thumbnail
  const small = document.createElement('canvas');
  const k = 64 / Math.max(crop.w, crop.h);
  small.width = Math.max(1, Math.round(crop.w * k));
  small.height = Math.max(1, Math.round(crop.h * k));
  small.getContext('2d').drawImage(base, crop.sx, crop.sy, crop.w, crop.h, 0, 0, small.width, small.height);
  // Pass 2: upscale to a ~300px intermediate (further softening)
  const mid = document.createElement('canvas');
  const k2 = 300 / Math.max(small.width, small.height);
  mid.width = Math.max(1, Math.round(small.width * k2));
  mid.height = Math.max(1, Math.round(small.height * k2));
  const mctx = mid.getContext('2d');
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, mid.width, mid.height);
  // Pass 3: upscale to fill the frame
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mid, 0, 0, W, H);
  // Slight brightening overlay to lift the foreground subject
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, W, H);
  small.width = small.height = 0;
  mid.width = mid.height = 0;
}

/* ---------- Watermark unit (logo + text mixed) ---------- */

// Lazily create the measuring context: keeps the module free of top-level DOM dependencies
let _scratch = null;
function scratchCtx() {
  if (!_scratch) _scratch = document.createElement('canvas').getContext('2d');
  return _scratch;
}

/**
 * Lay out the element array into a single "watermark unit" canvas:
 * elements arranged horizontally, vertically centered.
 * @returns {HTMLCanvasElement|null} null when no valid elements
 */
function buildUnit(elements, longSide) {
  const gap = Math.max(2, Math.round(longSide * 0.012));
  const parts = [];
  for (const el of elements) {
    if (el.type === 'text' && String(el.content || '').trim()) {
      const fontSize = Math.max(9, Math.round(longSide * (el.sizePct || 0.025)));
      const ctx = scratchCtx();
      ctx.font = `${el.fontWeight || 600} ${fontSize}px ${FONT_STACK}`;
      const lines = String(el.content).split('\n');
      let w = 0;
      for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
      parts.push({ el, fontSize, lines, w, h: lines.length * fontSize * 1.25 });
    } else if (el.type === 'image' && el.source) {
      const h = Math.max(8, Math.round(longSide * (el.sizePct || 0.05)));
      const src = el.source;
      const w = Math.max(1, Math.round(h * (src.width / src.height)));
      parts.push({ el, w, h });
    }
  }
  if (!parts.length) return null;

  const totalW = Math.round(parts.reduce((s, p) => s + p.w, 0) + gap * (parts.length - 1));
  const maxH = Math.round(Math.max(...parts.map(p => p.h)));
  if (totalW < 1 || maxH < 1) return null;

  const c = document.createElement('canvas');
  c.width = totalW;
  c.height = maxH;
  const ctx = c.getContext('2d');
  let x = 0;
  for (const p of parts) {
    const y = (maxH - p.h) / 2;
    if (p.el.type === 'text') {
      ctx.font = `${p.el.fontWeight || 600} ${p.fontSize}px ${FONT_STACK}`;
      ctx.fillStyle = hexToRgba(p.el.color || '#ffffff', 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const lh = p.fontSize * 1.25;
      p.lines.forEach((line, i) => {
        const ly = y + lh / 2 + i * lh;
        if (p.el.strokeWidth > 0) {
          ctx.strokeStyle = hexToRgba(p.el.strokeColor || '#000000', 1);
          ctx.lineWidth = Math.max(1, p.fontSize * 0.05);
          ctx.lineJoin = 'round';
          ctx.strokeText(line, x, ly);
        }
        ctx.fillText(line, x, ly);
      });
    } else {
      ctx.drawImage(p.el.source, x, Math.round(y), Math.round(p.w), Math.round(p.h));
    }
    x += Math.round(p.w + gap);
  }
  return c;
}

/* ---------- Core: composition ---------- */

/**
 * Apply the brand watermark to an image.
 * @param {ImageBitmap|HTMLImageElement} source decoded image
 * @param {Partial<typeof DEFAULT_CONFIG>} cfgIn
 * @param {{ ratio?: number|null }} opts target aspect ratio (null = original)
 * @returns {HTMLCanvasElement}
 */
export function applyWatermark(source, cfgIn = {}, opts = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...cfgIn };
  const S = sourceSize(source);
  if (!S.w || !S.h) throw new Error('无法读取图片尺寸');

  // 1) Rotation normalization (90/270 swap w/h): rotate onto a working canvas first; all three fit modes share the path
  const rot = ((cfg.rotate % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const rw = swap ? S.h : S.w;
  const rh = swap ? S.w : S.h;

  const ratio = opts.ratio || null;
  // Fit modes: cover crop (default) | contain pad | blurred background
  const fit = ratio ? (opts.fit || 'cover') : 'cover';

  // 2) Frame = cover size of the target ratio (with the huge-image guard); all fit modes share it
  const crop = computeCoverCrop(rw, rh, ratio);
  const f = downscaleFactor(crop.w, crop.h);
  const outW = Math.max(1, Math.floor(crop.w * f));
  const outH = Math.max(1, Math.floor(crop.h * f));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');

  let base = source;
  let work = null;
  if (rot) {
    work = document.createElement('canvas');
    work.width = rw;
    work.height = rh;
    const wctx = work.getContext('2d');
    if (rot === 90) { wctx.translate(rw, 0); wctx.rotate(Math.PI / 2); }
    else if (rot === 180) { wctx.translate(rw, rh); wctx.rotate(Math.PI); }
    else { wctx.translate(0, rh); wctx.rotate(-Math.PI / 2); }
    wctx.drawImage(source, 0, 0, S.w, S.h);
    base = work;
  }

  if (!ratio) {
    ctx.drawImage(base, 0, 0, rw, rh, 0, 0, outW, outH);
  } else if (fit === 'cover') {
    ctx.drawImage(base, crop.sx, crop.sy, crop.w, crop.h, 0, 0, outW, outH);
  } else {
    // contain / blur: keep the full picture, letterboxed and centered
    const s = Math.min(outW / rw, outH / rh);
    const dw = Math.max(1, Math.round(rw * s));
    const dh = Math.max(1, Math.round(rh * s));
    if (fit === 'blur') {
      drawBlurredCover(ctx, base, outW, outH, rw, rh);
    } else {
      ctx.fillStyle = opts.padColor || '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(base, 0, 0, rw, rh, Math.round((outW - dw) / 2), Math.round((outH - dh) / 2), dw, dh);
  }
  if (work) work.width = work.height = 0;

  // 4) Watermark unit and layout
  const els = (cfg.elements || []).filter(el => el && (
    el.type === 'image' ? el.source : String(el.content || '').trim()));
  if (!els.length) return canvas;

  // Size the unit by the output's own long side -> visually consistent across sizes
  const longSide = Math.max(outW, outH);
  const unit = buildUnit(els, longSide);
  if (!unit) return canvas;

  ctx.globalAlpha = cfg.opacity;
  if (cfg.mode === 'tile') {
    const cellW = Math.max(1, Math.round(outW / cfg.density));
    const cellH = Math.max(1, Math.round(outH / cfg.density));
    const cell = document.createElement('canvas');
    cell.width = cellW;
    cell.height = cellH;
    const c = cell.getContext('2d');
    c.translate(cellW / 2, cellH / 2);
    c.rotate((-cfg.angle * Math.PI) / 180);
    // Shrink the unit proportionally when it overflows the cell (keeps n x n density semantics)
    const fit = Math.min(1, (cellW * 0.88) / unit.width, (cellH * 0.88) / unit.height);
    if (fit < 1) c.scale(fit, fit);
    c.drawImage(unit, -unit.width / 2, -unit.height / 2);
    ctx.fillStyle = ctx.createPattern(cell, 'repeat');
    ctx.fillRect(0, 0, outW, outH);
  } else if (cfg.mode === 'center') {
    ctx.drawImage(unit, Math.round((outW - unit.width) / 2), Math.round((outH - unit.height) / 2));
  } else {
    const pad = Math.max(8, Math.round(Math.min(outW, outH) * 0.03));
    const right = cfg.mode === 'tr' || cfg.mode === 'br';
    const top = cfg.mode === 'tl' || cfg.mode === 'tr';
    const x = right ? outW - pad - unit.width : pad;
    const y = top ? pad : outH - pad - unit.height;
    ctx.drawImage(unit, Math.round(x), Math.round(y));
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/* ---------- Export helpers (toBlob route) ---------- */

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob 失败'))), type, quality));
}

export function outputTypeFor(file) {
  const t = (file && file.type) || '';
  if (t === 'image/jpeg') return 'image/jpeg';
  if (t === 'image/webp') return 'image/webp';
  return 'image/png';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyBlobToClipboard(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) throw new Error('UNSUPPORTED');
  let b = blob;
  if (blob.type !== 'image/png') {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close();
    b = await canvasToBlob(c, 'image/png');
    c.width = c.height = 0;
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
}

function pad2(n) { return String(n).padStart(2, '0'); }

export function makeTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

export function splitName(originalName) {
  const dot = originalName && originalName.lastIndexOf('.');
  if (!originalName || dot <= 0) return { base: originalName || 'image', ext: '.png' };
  return { base: originalName.slice(0, dot), ext: originalName.slice(dot) };
}

const EXT_OF = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export function ensureExt(name, type) {
  return /\.(jpe?g|png|webp)$/i.test(name) ? name : name + (EXT_OF[type] || '.png');
}
