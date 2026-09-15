/**
 * Long-image stitching: vertical/horizontal with adjustable gap, margin,
 * corner radius and alignment. Area safety cap 32M pixels (legitimate
 * long-image cases; above the 16.7M single-image cap).
 */
import * as engine from './engine.js';
import { $, toast, wireUpload } from './shared.js';
import { track } from './analytics.js';
import { t, tf } from './i18n.js';

const TOOL = 'stitch';
const MAX_FILES = 20;
const MAX_AREA = 32e6;

const files = [];

wireUpload('dropZone', 'fileInput', list => {
  const imgs = list.filter(f => f.type && f.type.startsWith('image/'));
  if (!imgs.length) return;
  const room = MAX_FILES - files.length;
  if (room <= 0) { toast(tf('stitchMaxFiles', MAX_FILES), 'warn'); return; }
  files.push(...imgs.slice(0, room));
  renderThumbs();
});

function renderThumbs() {
  const box = $('thumbs');
  box.innerHTML = '';
  box.hidden = !files.length;
  files.forEach((f, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.loading = 'lazy';
    const num = document.createElement('span');
    num.className = 'thumb-seq';
    num.textContent = i + 1;
    const del = document.createElement('button');
    del.className = 'thumb-del';
    del.innerHTML = '&times;';
    del.addEventListener('click', e => {
      e.stopPropagation();
      files.splice(i, 1);
      renderThumbs();
    });
    wrap.appendChild(img);
    wrap.appendChild(num);
    wrap.appendChild(del);
    box.appendChild(wrap);
  });
}

['gap', 'pad', 'radius'].forEach(id =>
  $(id).addEventListener('input', () => { $(id + 'Val').textContent = $(id).value; }));


function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function run() {
  if (files.length < 2) { toast(t('stitchNeedTwo'), 'warn'); return; }

  const btn = $('goBtn');
  btn.disabled = true;
  btn.textContent = t('stitchRunning');
  try {
    const sources = [];
    for (const f of files) sources.push(await engine.decodeImageFile(f));
    const dims = sources.map(s => ({ w: s.naturalWidth || s.width, h: s.naturalHeight || s.height }));

    const vertical = $('direction').value === 'v';
    const align = $('align').value;
    const gap = parseInt($('gap').value, 10);
    const pad = parseInt($('pad').value, 10);
    const radius = parseInt($('radius').value, 10);

    // Unified base edge (vertical: width; horizontal: height)
    const edges = vertical ? dims.map(d => d.w) : dims.map(d => d.h);
    const base = align === 'min' ? Math.min(...edges)
      : align === 'max' ? Math.max(...edges)
      : edges[0];

    // Scaled size of each image
    const scaled = dims.map(d => {
      const k = base / (vertical ? d.w : d.h);
      return vertical ? { w: base, h: Math.round(d.h * k) } : { w: Math.round(d.w * k), h: base };
    });

    let W = vertical ? base : scaled.reduce((s, d) => s + d.w, 0) + gap * (scaled.length - 1);
    let H = vertical ? scaled.reduce((s, d) => s + d.h, 0) + gap * (scaled.length - 1) : base;
    W += pad * 2;
    H += pad * 2;

    // Area safety (relaxed to 32M for long images)
    let k = 1;
    if (W * H > MAX_AREA) k = Math.sqrt(MAX_AREA / (W * H));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(W * k));
    canvas.height = Math.max(1, Math.round(H * k));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = $('bg').value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let pos = pad * k;
    sources.forEach((src, i) => {
      const dw = scaled[i].w * k;
      const dh = scaled[i].h * k;
      const d = gap * k;
      const x = vertical ? pad * k : pos;
      const y = vertical ? pos : pad * k;
      ctx.save();
      if (radius > 0) {
        roundRectPath(ctx, x, y, dw, dh, radius * k);
        ctx.clip();
      }
      ctx.drawImage(src, x, y, dw, dh);
      ctx.restore();
      if (src.close) src.close();
      pos += (vertical ? dh : dw) + d;
    });

    const url = URL.createObjectURL(new Blob([await new Promise(r => canvas.toBlob(r, 'image/png'))]));
    const box = $('preview');
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    box.appendChild(img);
    state.canvas = canvas;
    $('result').hidden = false;
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('generate', { tool: TOOL, count: files.length, direction: $('direction').value, align });
  } catch (err) {
    console.error(err);
    toast(t('stitchFail'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('stitchGo');
  }
}

const state = { canvas: null };

$('goBtn').addEventListener('click', run);

$('dlBtn').addEventListener('click', async () => {
  if (!state.canvas) return;
  const mime = $('fmt').value;
  const blob = await engine.canvasToBlob(state.canvas, mime, 0.92);
  engine.downloadBlob(blob, `stitch_${engine.makeTimestamp()}.${mime === 'image/png' ? 'png' : 'jpg'}`);
  track('download', { tool: TOOL });
});
