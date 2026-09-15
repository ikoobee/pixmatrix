/**
 * Batch rename: template + old/new mapping + dual output channels.
 * A) File System Access (Chrome/Edge): renamed copies written into a
 *    renamed/ subdirectory of the chosen folder; originals untouched.
 * B) Fallback: upload files -> ZIP download (same byte-level copy, zero
 *    quality loss).
 */
import * as engine from './engine.js';
import { $, toast } from './shared.js';
import { track } from './analytics.js';
import { t, tf } from './i18n.js';

const TOOL = 'rename';
const IMG_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;

const state = {
  files: [],       // File[] or handle wrappers
  dirHandle: null, // FSA mode
};

const hasFSA = 'showDirectoryPicker' in window;


function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pad3(n) { return String(n).padStart(3, '0'); }

/** Template -> new name (extension kept; duplicates auto-suffixed -2/-3). */
function computeNames(pattern) {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const used = new Set();
  return state.files.map((f, i) => {
    const orig = f.name;
    const dot = orig.lastIndexOf('.');
    const base = dot > 0 ? orig.slice(0, dot) : orig;
    const ext = dot > 0 ? orig.slice(dot) : '';
    let nb = String(pattern || '{name}')
      .replace(/\{name\}/g, base)
      .replace(/\{seq\}/g, pad3(i + 1))
      .replace(/\{date\}/g, date)
      .replace(/[\\/:*?"<>|]/g, '_'); // illegal filename characters
    if (!nb.trim()) nb = base;
    let name = nb + ext;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${nb}-${k}${ext}`;
    used.add(name.toLowerCase());
    return { orig, name };
  });
}

function renderPreview() {
  const rows = $('rows');
  rows.innerHTML = '';
  const names = computeNames($('pattern').value);
  for (const { orig, name } of names) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(orig)}</td><td><b>${escapeHtml(name)}</b></td>`;
    rows.appendChild(tr);
  }
  $('countHint').textContent = state.files.length
    ? (state.dirHandle
        ? tf('renameCountDir', state.files.length)
        : tf('renameCountZip', state.files.length))
    : t('renameNoSelection');
  $('applyBtn').disabled = !state.files.length;
}

$('pattern').addEventListener('input', renderPreview);

/* ---------- Mode A: FSA directory ---------- */

if (hasFSA) {
  $('pickDirBtn').addEventListener('click', async () => {
    try {
      const dir = await window.showDirectoryPicker();
      const files = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && IMG_RE.test(entry.name)) {
          files.push(await entry.getFile());
        }
      }
      if (!files.length) { toast(t('renameNoImages'), 'warn'); return; }
      files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
      state.files = files;
      state.dirHandle = dir;
      renderPreview();
      track('pick', { tool: TOOL, mode: 'dir', count: files.length });
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error(err);
        toast(t('renameReadFail'), 'warn');
      }
    }
  });
} else {
  $('pickDirBtn').disabled = true;
  $('pickDirBtn').textContent = t('renamePickDirNoFsa');
}

/* ---------- Mode B: uploaded files ---------- */

$('pickFilesBtn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files).filter(f => IMG_RE.test(f.name));
    if (!files.length) return;
    files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    state.files = files;
    state.dirHandle = null;
    renderPreview();
    track('pick', { tool: TOOL, mode: 'files', count: files.length });
  };
  input.click();
});

/* ---------- Execute ---------- */

$('applyBtn').addEventListener('click', async () => {
  if (!state.files.length) return;
  const names = computeNames($('pattern').value);
  const btn = $('applyBtn');
  btn.disabled = true;
  btn.textContent = t('renameRunning');
  try {
    if (state.dirHandle) {
      // Write into the renamed/ subdirectory (originals untouched)
      const out = await state.dirHandle.getDirectoryHandle('renamed', { create: true });
      for (let i = 0; i < state.files.length; i++) {
        const fh = await out.getFileHandle(names[i].name, { create: true });
        const w = await fh.createWritable();
        await w.write(state.files[i]);
        await w.close();
      }
      toast(tf('renameWritten', state.files.length));
      track('apply', { tool: TOOL, mode: 'dir', count: state.files.length });
    } else {
      const JSZip = (await import('https://jspm.dev/jszip@3.10.1')).default;
      const zip = new JSZip();
      for (let i = 0; i < state.files.length; i++) zip.file(names[i].name, state.files[i]);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      engine.downloadBlob(blob, `renamed_${engine.makeTimestamp()}.zip`);
      toast(t('renameZipStarted'));
      track('apply', { tool: TOOL, mode: 'zip', count: state.files.length });
    }
  } catch (err) {
    console.error(err);
    toast(tf('renameFail', err.message || ''), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('renameApply');
  }
});
