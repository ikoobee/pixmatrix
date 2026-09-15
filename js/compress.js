/**
 * Image compression: quality + size levers; PNG format strategy
 * (photo-like PNGs go to JPEG / screenshots keep their format with
 * downscaling). Compression ratio shown live.
 */
import * as engine from './engine.js';
import { $, toast, wireUpload } from './shared.js';
import { track } from './analytics.js';

const TOOL = 'compress';
const MAX_FILES = 20;

const files = [];
const results = []; // {name, blob, url, origSize, newSize}

wireUpload('dropZone', 'fileInput', list => {
  const imgs = list.filter(f => f.type && f.type.startsWith('image/'));
  if (!imgs.length) return;
  const room = MAX_FILES - files.length;
  if (room <= 0) { toast(`最多同时处理 ${MAX_FILES} 张`, 'warn'); return; }
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
    const del = document.createElement('button');
    del.className = 'thumb-del';
    del.innerHTML = '&times;';
    del.addEventListener('click', e => {
      e.stopPropagation();
      files.splice(i, 1);
      renderThumbs();
    });
    wrap.appendChild(img);
    wrap.appendChild(del);
    box.appendChild(wrap);
  });
}

$('quality').addEventListener('input', () => { $('qualityVal').textContent = $('quality').value; });

function refreshQuota() {
}
refreshQuota();

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function compressOne(file) {
  const src = await engine.decodeImageFile(file);
  const S = { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };

  // Size lever: long-side cap
  const maxSide = parseInt($('maxSide').value, 10);
  let f = 1;
  if (maxSide > 0 && Math.max(S.w, S.h) > maxSide) f = maxSide / Math.max(S.w, S.h);
  const W = Math.max(1, Math.round(S.w * f));
  const H = Math.max(1, Math.round(S.h * f));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.getContext('2d').drawImage(src, 0, 0, W, H);
  if (src.close) src.close();

  // Format strategy: lossless PNG ignores the quality parameter — photo-like
  // PNGs convert to JPEG per the option; others keep their format
  let mime;
  if (file.type === 'image/png' && $('pngToJpeg').checked) {
    mime = 'image/jpeg';
    // PNG transparency would go black under JPEG; pad white
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  } else if (file.type === 'image/webp') {
    mime = 'image/webp';
  } else if (file.type === 'image/png') {
    mime = 'image/png';
  } else {
    mime = 'image/jpeg';
  }
  const q = parseInt($('quality').value, 10) / 100;
  const blob = await engine.canvasToBlob(canvas, mime, q);
  canvas.width = canvas.height = 0;

  const dot = file.name.lastIndexOf('.');
  const base = dot > 0 ? file.name.slice(0, dot) : file.name;
  const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png';
  return { name: `${base}_min${ext}`, blob, url: URL.createObjectURL(blob), origSize: file.size, newSize: blob.size, converted: mime !== file.type };
}

function renderRows() {
  const rows = $('rows');
  rows.innerHTML = '';
  let totalO = 0, totalN = 0;
  for (const r of results) {
    totalO += r.origSize;
    totalN += r.newSize;
    const tr = document.createElement('tr');
    const ratio = 1 - r.newSize / r.origSize;
    const cls = ratio > 0.2 ? 'ratio-good' : (ratio < 0 ? 'ratio-bad' : '');
    const ratioTxt = ratio >= 0 ? `-${(ratio * 100).toFixed(1)}%` : `+${(-ratio * 100).toFixed(1)}%（变大，建议调质量）`;
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}${r.converted ? ' <span class="chip">已转格式</span>' : ''}</td>
      <td>${fmtSize(r.origSize)}</td>
      <td>${fmtSize(r.newSize)}</td>
      <td class="${cls}">${ratioTxt}</td>
      <td><button class="btn ghost sm">下载</button></td>`;
    tr.querySelector('button').addEventListener('click', () => {
      engine.downloadBlob(r.blob, r.name);
      track('download', { tool: TOOL });
    });
    rows.appendChild(tr);
  }
  const saved = 1 - totalN / totalO;
  $('summary').textContent = `共 ${results.length} 张：${fmtSize(totalO)} → ${fmtSize(totalN)}（省 ${(saved * 100).toFixed(0)}%）`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function run() {
  if (!files.length) { toast('请先添加至少一张图片', 'warn'); return; }

  const btn = $('goBtn');
  btn.disabled = true;
  btn.textContent = '压缩中…';
  results.forEach(r => URL.revokeObjectURL(r.url));
  results.length = 0;
  $('rows').innerHTML = '';
  try {
    for (const f of files) {
      try {
        results.push(await compressOne(f));
        renderRows();
      } catch (err) {
        console.error(err);
        toast(`${f.name}: 处理失败`, 'error');
      }
    }
    refreshQuota();
    $('result').hidden = !results.length;
    if (results.length) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('generate', { tool: TOOL, count: results.length, quality: $('quality').value, maxSide: $('maxSide').value, pngToJpeg: $('pngToJpeg').checked });
  } finally {
    btn.disabled = false;
    btn.textContent = '开始压缩';
  }
}

$('goBtn').addEventListener('click', run);

$('allBtn').addEventListener('click', async () => {
  for (const r of results) {
    engine.downloadBlob(r.blob, r.name);
    await new Promise(res => setTimeout(res, 350));
  }
});
