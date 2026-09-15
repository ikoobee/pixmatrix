/**
 * Shared layer for the toolbox: three-channel upload, toast, picked-image
 * preview. Tool pages import this module; the tool nav bar is static HTML
 * (see each page's header).
 */

export const $ = id => document.getElementById(id);

/* ---------- Toast ---------- */

export function toast(msg, type = 'info') {
  let root = $('toastRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toastRoot';
    root.className = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

/* ---------- Upload: click / drag / paste ---------- */

export function wireUpload(zoneId, inputId, onFiles, { multiple = true, zoneTextSel = '.dz-text' } = {}) {
  const dz = $(zoneId);
  dz.addEventListener('click', () => $(inputId).click());
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $(inputId).click(); }
  });
  $(inputId).addEventListener('change', e => {
    if (e.target.files.length) onFiles(multiple ? Array.from(e.target.files) : e.target.files[0]);
    e.target.value = '';
  });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.remove('drag-over');
  }));
  dz.addEventListener('drop', e => {
    const imgs = Array.from(e.dataTransfer.files).filter(f => f.type && f.type.startsWith('image/'));
    if (imgs.length) onFiles(multiple ? imgs : imgs[0]);
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());
  document.addEventListener('paste', e => {
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const imgs = [];
    for (const it of e.clipboardData.items) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) imgs.push(f);
      }
    }
    if (imgs.length) {
      e.preventDefault();
      onFiles(multiple ? imgs : imgs[0]);
    }
  });
}

/** Show the picked image as a thumbnail inside the upload zone. */
export function showPicked(zoneId, file) {
  const zone = $(zoneId);
  const url = URL.createObjectURL(file);
  const img = zone.querySelector('img.picked') || zone.appendChild(document.createElement('img'));
  img.className = 'picked';
  img.src = url;
  img.hidden = false;
  const txt = zone.querySelector('.dz-text');
  if (txt) txt.hidden = true;
  zone.classList.add('has-image');
}
