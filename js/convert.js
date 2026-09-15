/**
 * Format conversion: JPG/PNG/WebP (within browser toBlob capabilities, no
 * AVIF/HEIC). Reuses the compression tool's pipeline; transparent images
 * get a white pad when converting to JPG.
 */
import * as engine from './engine.js';
import { $, toast, wireUpload } from './shared.js';
import { track } from './analytics.js';

const TOOL = 'convert';
const MAX_FILES = 20;

const files = [];
const results = [];

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

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const NAME = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' };

async function convertOne(file) {
  const src = await engine.decodeImageFile(file);
  const S = { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  const canvas = document.createElement('canvas');
  canvas.width = S.w;
  canvas.height = S.h;
  const ctx = canvas.getContext('2d');
  const mime = $('target').value;
  if (mime === 'image/jpeg') {
    // JPG has no alpha: pad white to avoid a black background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S.w, S.h);
  }
  ctx.drawImage(src, 0, 0, S.w, S.h);
  if (src.close) src.close();
  const q = parseInt($('quality').value, 10) / 100;
  const blob = await engine.canvasToBlob(canvas, mime, mime === 'image/png' ? undefined : q);
  canvas.width = canvas.height = 0;
  const dot = file.name.lastIndexOf('.');
  const base = dot > 0 ? file.name.slice(0, dot) : file.name;
  return {
    name: `${base}${EXT[mime]}`,
    blob,
    url: URL.createObjectURL(blob),
    origSize: file.size,
    newSize: blob.size,
    fromType: file.type || '未知',
    toType: mime,
  };
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRows() {
  const rows = $('rows');
  rows.innerHTML = '';
  let totalO = 0, totalN = 0;
  for (const r of results) {
    totalO += r.origSize;
    totalN += r.newSize;
    const delta = 1 - r.newSize / r.origSize;
    const cls = delta > 0.2 ? 'ratio-good' : (delta < 0 ? 'ratio-bad' : '');
    const txt = delta >= 0 ? `-${(delta * 100).toFixed(1)}%` : `+${(-delta * 100).toFixed(1)}%`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}</td>
      <td>${(NAME[r.fromType] || r.fromType)} · ${fmtSize(r.origSize)}</td>
      <td><b>${NAME[r.toType]}</b> · ${fmtSize(r.newSize)}</td>
      <td class="${cls}">${txt}</td>
      <td><button class="btn ghost sm">下载</button></td>`;
    tr.querySelector('button').addEventListener('click', () => {
      engine.downloadBlob(r.blob, r.name);
      track('download', { tool: TOOL });
    });
    rows.appendChild(tr);
  }
  $('summary').textContent = `共 ${results.length} 张：${fmtSize(totalO)} → ${fmtSize(totalN)}`;
}

async function run() {
  if (!files.length) { toast('请先添加至少一张图片', 'warn'); return; }
  const btn = $('goBtn');
  btn.disabled = true;
  btn.textContent = '转换中…';
  results.forEach(r => URL.revokeObjectURL(r.url));
  results.length = 0;
  $('rows').innerHTML = '';
  try {
    for (const f of files) {
      try {
        results.push(await convertOne(f));
        renderRows();
      } catch (err) {
        console.error(err);
        toast(`${f.name}: 处理失败`, 'error');
      }
    }
    refreshQuota();
    $('result').hidden = !results.length;
    if (results.length) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('generate', { tool: TOOL, count: results.length, target: $('target').value });
  } finally {
    btn.disabled = false;
    btn.textContent = '开始转换';
  }
}

$('goBtn').addEventListener('click', run);

$('allBtn').addEventListener('click', async () => {
  for (const r of results) {
    engine.downloadBlob(r.blob, r.name);
    await new Promise(res => setTimeout(res, 350));
  }
});
