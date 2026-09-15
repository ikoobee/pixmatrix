/**
 * Exact-pixel resizing with three fit modes. cover/contain reuse the
 * engine's computeCoverCrop; blur reuses drawBlurredCover exported by the
 * engine.
 */
import * as engine from './engine.js';
import { $, toast, wireUpload, showPicked } from './shared.js';
import { track } from './analytics.js';

const TOOL = 'resize';
let file = null;
let outputs = []; // {name, blob, url, W, H}

wireUpload('dropZone', 'fileInput', f => {
  file = f;
  showPicked('dropZone', f);
}, { multiple: false });

document.querySelectorAll('input[name="spec"]').forEach(cb =>
  cb.addEventListener('change', () => { $('customWrap').hidden = !document.querySelector('input[name="spec"][value="custom"]').checked; }));

function refreshQuota() {
}
refreshQuota();

/** Exact-pixel render: cover crop / contain pad / blurred background. */
function renderAt(src, W, H, fit) {
  const S = { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (fit === 'cover') {
    const crop = engine.computeCoverCrop(S.w, S.h, W / H);
    ctx.drawImage(src, crop.sx, crop.sy, crop.w, crop.h, 0, 0, W, H);
  } else {
    const s = Math.min(W / S.w, H / S.h);
    const dw = Math.max(1, Math.round(S.w * s));
    const dh = Math.max(1, Math.round(S.h * s));
    if (fit === 'blur') {
      engine.drawBlurredCover(ctx, src, W, H, S.w, S.h);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(src, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
  }
  return canvas;
}

async function run() {
  if (!file) { toast('请先选择一张图片', 'warn'); return; }

  const specs = [];
  document.querySelectorAll('input[name="spec"]:checked').forEach(cb => {
    if (cb.value === 'custom') {
      const W = Math.min(6000, Math.max(16, parseInt($('customW').value, 10) || 800));
      const H = Math.min(6000, Math.max(16, parseInt($('customH').value, 10) || 600));
      specs.push({ W, H, key: `${W}x${H}` });
    } else {
      const [W, H] = cb.value.split('x').map(Number);
      specs.push({ W, H, key: cb.value });
    }
  });
  if (!specs.length) { toast('请至少选择一个输出规格', 'warn'); return; }

  const btn = $('goBtn');
  btn.disabled = true;
  btn.textContent = '处理中…';
  try {
    const src = await engine.decodeImageFile(file);
    const fit = $('fitMode').value;
    const mime = $('fmt').value;
    const ext = mime === 'image/png' ? '.png' : '.jpg';
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : 'image';

    outputs.forEach(o => URL.revokeObjectURL(o.url));
    outputs = [];
    const previews = $('previews');
    previews.innerHTML = '';
    for (const sp of specs) {
      const canvas = renderAt(src, sp.W, sp.H, fit);
      if (mime === 'image/jpeg') {
        // JPG is opaque: pad white before repainting (contain/blur backgrounds
        // are already opaque; with cover the source may carry alpha)
        const probe = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
        if (probe[3] < 255) {
          const c2 = document.createElement('canvas');
          c2.width = sp.W; c2.height = sp.H;
          const x2 = c2.getContext('2d');
          x2.fillStyle = '#ffffff';
          x2.fillRect(0, 0, sp.W, sp.H);
          x2.drawImage(canvas, 0, 0);
          canvas.width = canvas.height = 0;
          canvas = c2;
        }
      }
      const blob = await engine.canvasToBlob(canvas, mime, mime === 'image/jpeg' ? 0.92 : undefined);
      canvas.width = canvas.height = 0;
      const url = URL.createObjectURL(blob);
      outputs.push({ name: `${base}_${sp.key}${ext}`, blob, url, W: sp.W, H: sp.H });

      const cell = document.createElement('figure');
      cell.className = 'pg-cell';
      const img = document.createElement('img');
      img.src = url;
      img.loading = 'lazy';
      const cap = document.createElement('figcaption');
      cap.textContent = `${sp.W} × ${sp.H}`;
      cell.appendChild(img);
      cell.appendChild(cap);
      previews.appendChild(cell);
    }
    if (src.close) src.close();
    refreshQuota();
    $('result').hidden = false;
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('generate', { tool: TOOL, specs: specs.length, fit });
  } catch (err) {
    console.error(err);
    toast('处理失败，请换一张图片', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '生成并打包';
  }
}

$('goBtn').addEventListener('click', run);

$('zipBtn').addEventListener('click', async () => {
  if (!outputs.length) return;
  try {
    const JSZip = (await import('https://jspm.dev/jszip@3.10.1')).default;
    const zip = new JSZip();
    for (const o of outputs) zip.file(o.name, o.blob);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    engine.downloadBlob(blob, `resize_${engine.makeTimestamp()}.zip`);
    track('zip_download', { tool: TOOL, count: outputs.length });
  } catch (err) {
    console.error(err);
    toast('打包失败，可长按预览图逐张保存', 'warn');
  }
});
