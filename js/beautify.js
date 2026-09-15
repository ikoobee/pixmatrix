/**
 * Screenshot beautifier: rounded corners + gradient background + padding
 * + shadow + macOS window bar. Gradient via diagonal createLinearGradient;
 * shadow via ctx.shadow* (effective on shape drawing).
 */
import * as engine from './engine.js';
import { $, toast, wireUpload, showPicked } from './shared.js';
import { track } from './analytics.js';
import { t } from './i18n.js';

const TOOL = 'beautify';

const GRADS = {
  'grad-indigo': ['#6366f1', '#a855f7'],
  'grad-sunset': ['#f97316', '#ec4899'],
  'grad-mint': ['#14b8a6', '#34d399'],
  'grad-slate': ['#334155', '#64748b'],
};

let file = null;
const state = { canvas: null };

wireUpload('dropZone', 'fileInput', f => {
  file = f;
  showPicked('dropZone', f);
}, { multiple: false });

['pad', 'radius'].forEach(id =>
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
  if (!file) { toast(t('beautifyNeedImage'), 'warn'); return; }

  const btn = $('goBtn');
  btn.disabled = true;
  btn.textContent = t('beautifyRunning');
  try {
    const src = await engine.decodeImageFile(file);
    const S = { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
    const pad = parseInt($('pad').value, 10);
    const radius = parseInt($('radius').value, 10);
    const shadow = $('shadow').checked;
    const bar = $('bar').checked;
    const barH = bar ? Math.max(36, Math.min(64, Math.round(S.w * 0.05))) : 0;

    const W = S.w + pad * 2;
    const H = S.h + barH + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background: gradient or solid
    const bgv = $('bg').value;
    if (GRADS[bgv]) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, GRADS[bgv][0]);
      g.addColorStop(1, GRADS[bgv][1]);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = bgv;
    }
    ctx.fillRect(0, 0, W, H);

    // macOS window bar (screenshot-width; bar corner radius meets the screenshot's)
    const contentR = radius;
    const topR = bar ? contentR : 0;
    if (bar) {
      ctx.save();
      roundRectPath(ctx, pad, pad, S.w, barH + contentR, topR);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(pad, pad, S.w, barH + contentR);
      const dotY = pad + barH / 2;
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
        ctx.beginPath();
        ctx.arc(pad + 18 + i * 22, dotY, 6, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
      });
      ctx.restore();
    }

    // The screenshot itself (with shadow + rounded corners)
    ctx.save();
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = pad * 0.4;
      ctx.shadowOffsetY = pad * 0.12;
    }
    roundRectPath(ctx, pad, pad + barH, S.w, S.h, contentR);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, pad, pad + barH, S.w, S.h, contentR);
    ctx.clip();
    ctx.drawImage(src, pad, pad + barH, S.w, S.h);
    ctx.restore();
    if (src.close) src.close();

    const box = $('preview');
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(new Blob([await new Promise(r => canvas.toBlob(r, 'image/png'))]));
    box.appendChild(img);
    state.canvas = canvas;
    $('result').hidden = false;
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('generate', { tool: TOOL, bg: bgv, bar, shadow });
  } catch (err) {
    console.error(err);
    toast(t('beautifyFail'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('beautifyGo');
  }
}

$('goBtn').addEventListener('click', run);

$('dlBtn').addEventListener('click', async () => {
  if (!state.canvas) return;
  const mime = $('fmt').value;
  const blob = await engine.canvasToBlob(state.canvas, mime, 0.95);
  engine.downloadBlob(blob, `share_${engine.makeTimestamp()}.${mime === 'image/png' ? 'png' : 'jpg'}`);
  track('download', { tool: TOOL });
});
