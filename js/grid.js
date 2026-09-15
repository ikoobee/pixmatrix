/**
 * Nine-grid slicing: cover-crop to square -> (optional) watermark -> 3x3
 * tiles -> preview + ZIP. The watermark step calls the shared base engine
 * directly. All user-facing strings come from i18n keys (grid* entries,
 * see tools/i18n-entries/grid.js).
 */
import * as engine from './engine.js';
import { $, toast, wireUpload, showPicked } from './shared.js';
import { track } from './analytics.js';
import { t } from './i18n.js';

const TOOL = 'grid';
let file = null;
let cells = [];   // [{blob, url, name}]

wireUpload('dropZone', 'fileInput', f => {
  file = f;
  showPicked('dropZone', f);
}, { multiple: false });

$('wmOn').addEventListener('change', e => { $('wmPanel').hidden = !e.target.checked; });
$('wmOpacity').addEventListener('input', () => { $('wmOpacityVal').textContent = `${$('wmOpacity').value}%`; });


async function run() {
  if (!file) { toast(t('gridNeedFile'), 'warn'); return; }

  const btn = $('goBtn');
  btn.disabled = true;
  btn.textContent = t('gridWip');
  try {
    const src = await engine.decodeImageFile(file);
    const size = parseInt($('outSize').value, 10);

    // 1) Center cover-crop to square
    const S = { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
    const side = Math.min(S.w, S.h);
    const work = document.createElement('canvas');
    work.width = size;
    work.height = size;
    work.getContext('2d').drawImage(src, (S.w - side) / 2, (S.h - side) / 2, side, side, 0, 0, size, size);
    if (src.close) src.close();

    // 2) Watermark pass (base engine)
    let canvas = work;
    if ($('wmOn').checked && $('wmText').value.trim()) {
      canvas = engine.applyWatermark(work, {
        elements: [{
          type: 'text',
          content: $('wmText').value,
          sizePct: 0.03,
          color: '#ffffff',
          strokeWidth: 1,
        }],
        mode: $('wmMode').value,
        opacity: parseInt($('wmOpacity').value, 10) / 100,
        density: 3,
      });
      work.width = work.height = 0;
    }

    // 3) 3x3 tiles
    cells.forEach(c => URL.revokeObjectURL(c.url));
    cells = [];
    const cell = size / 3;
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : 'grid';
    const ext = $('wmOn').checked || sniffJpeg(file) ? '.jpg' : keepExt(file);
    const preview = $('gridPreview');
    preview.innerHTML = '';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cc = document.createElement('canvas');
        cc.width = cell;
        cc.height = cell;
        cc.getContext('2d').drawImage(canvas, c * cell, r * cell, cell, cell, 0, 0, cell, cell);
        const blob = await engine.canvasToBlob(cc, ext === '.jpg' ? 'image/jpeg' : 'image/png', 0.92);
        cc.width = cc.height = 0;
        const url = URL.createObjectURL(blob);
        cells.push({ blob, url, name: `${base}_${r * 3 + c + 1}${ext}` });
        const img = document.createElement('img');
        img.src = url;
        img.alt = `cell ${r * 3 + c + 1}`;
        preview.appendChild(img);
      }
    }
    canvas.width = canvas.height = 0;
    $('result').hidden = false;
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('generate', { tool: TOOL, size, watermark: $('wmOn').checked });
  } catch (err) {
    console.error(err);
    toast(t('gridFailed'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('gridGoBtn');
  }
}

function sniffJpeg(f) { return f.type === 'image/jpeg'; }
function keepExt(f) {
  if (f.type === 'image/webp') return '.webp';
  return '.png';
}

$('goBtn').addEventListener('click', run);

/* ZIP (lazy CDN import) */
$('zipBtn').addEventListener('click', async () => {
  if (!cells.length) return;
  try {
    const JSZip = (await import('https://jspm.dev/jszip@3.10.1')).default;
    const zip = new JSZip();
    for (const c of cells) zip.file(c.name, c.blob);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nine-grid_${engine.makeTimestamp()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    track('zip_download', { tool: TOOL, count: cells.length });
  } catch (err) {
    console.error(err);
    toast(t('gridZipFailed'), 'warn');
  }
});
