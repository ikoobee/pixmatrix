/**
 * EXIF view/strip: segment extraction and GPS double-strip reuse exif.js;
 * this file adds a lightweight TIFF parser (IFD0 + SubIFD common shooting
 * parameters) and two outputs (GPS-only / full EXIF removal), all
 * byte-level with no re-encoding (zero quality loss).
 */
import * as exif from './exif.js';
import * as engine from './engine.js';
import { $, toast, wireUpload, showPicked } from './shared.js';
import { track } from './analytics.js';
import { t, tf } from './i18n.js';

const TOOL = 'exif';
let file = null;

wireUpload('dropZone', 'fileInput', f => {
  file = f;
  showPicked('dropZone', f);
  analyze();
}, { multiple: false });

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/* Tag maps hold i18n keys; labels are resolved via t() at render time so
 * they always follow the active language (not the language at module load). */
const TAGS_IFD0 = { 0x010f: 'exifTagMake', 0x0110: 'exifTagModel', 0x0132: 'exifTagDate', 0x0112: 'exifTagOrient' };
const TAGS_SUB = { 0x829a: 'exifTagShutter', 0x829d: 'exifTagAperture', 0x8827: 'exifTagIso', 0x920a: 'exifTagFocal' };
const ORIENT = { 1: 'exifOrientNormal', 3: 'exifOrient180', 6: 'exifOrient90cw', 8: 'exifOrient90ccw' };

/** Parse the EXIF segment -> {rows:[[label,value]], hasGps}. */
function parseExif(seg) {
  const tiff = 10; // FF E1(2)+len(2)+"Exif\0\0"(6)
  if (seg.length < tiff + 8) return { rows: [], hasGps: false };
  const little = seg[tiff] === 0x49 && seg[tiff + 1] === 0x49;
  if (!little && !(seg[tiff] === 0x4d && seg[tiff + 1] === 0x4d)) return { rows: [], hasGps: false };
  const dv = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  const r16 = o => dv.getUint16(o, little);
  const r32 = o => dv.getUint32(o, little);

  function readValue(entry, type, count) {
    const valOff = count * (type === 5 ? 8 : type === 3 ? 2 : type === 4 ? 4 : 1) > 4 ? tiff + r32(entry + 8) : entry + 8;
    try {
      if (type === 2) { // ASCII
        let s = '';
        for (let i = 0; i < count && valOff + i < seg.length; i++) {
          const ch = seg[valOff + i];
          if (!ch) break;
          s += String.fromCharCode(ch);
        }
        return s.trim();
      }
      if (type === 3) return r16(valOff);
      if (type === 4) return r32(valOff);
      if (type === 5) { // rational
        const num = r32(valOff), den = r32(valOff + 4);
        if (!den) return null;
        return num / den;
      }
      return null;
    } catch (_) { return null; }
  }

  const rows = [];
  let hasGps = false;

  function walk(off, map) {
    if (off + 2 > seg.length) return;
    const n = r16(off);
    for (let i = 0; i < n; i++) {
      const entry = off + 2 + i * 12;
      if (entry + 12 > seg.length) break;
      const tag = r16(entry);
      const type = r16(entry + 2);
      const count = r32(entry + 4);
      if (tag === 0x8825) { hasGps = true; continue; }
      if (tag === 0x8769) { walk(tiff + r32(entry + 8), TAGS_SUB); continue; }
      if (!map[tag]) continue;
      const v = readValue(entry, type, count);
      if (v == null || v === '') continue;
      let text = v;
      if (tag === 0x0112) text = ORIENT[v] ? t(ORIENT[v]) : v;
      if (tag === 0x829a) text = v < 1 ? tf('exifShutterFrac', Math.round(1 / v)) : tf('exifShutterSec', v);
      if (tag === 0x829d) text = `f/${v.toFixed(1)}`;
      if (tag === 0x920a) text = `${Math.round(v)} mm`;
      if (tag === 0x8827) text = `${v}`;
      rows.push([t(map[tag]), String(text)]);
    }
  }

  walk(tiff + r32(tiff + 4), TAGS_IFD0);
  return { rows, hasGps };
}

/** Remove all APP1(Exif) segments (byte-level rebuild, no re-encoding). */
function removeAllExif(u8) {
  const parts = [];
  let pos = 2;
  parts.push(u8.subarray(0, 2));
  while (pos + 4 <= u8.length && u8[pos] === 0xff) {
    const m = u8[pos + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd9)) break;
    const segLen = (u8[pos + 2] << 8) | u8[pos + 3];
    const isExif = m === 0xe1 && u8[pos + 4] === 0x45 && u8[pos + 5] === 0x78; // "Ex"
    parts.push(isExif ? null : u8.subarray(pos, pos + 2 + segLen));
    pos += 2 + segLen;
  }
  parts.push(u8.subarray(pos));
  const total = parts.reduce((s, p) => s + (p ? p.length : 0), 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    if (!part) continue;
    out.set(part, p);
    p += part.length;
  }
  return out;
}

function addRow(table, k, v, warn = false) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${k}</td><td${warn ? ' class="ratio-bad"' : ''}>${v}</td>`;
  table.appendChild(tr);
}

async function analyze() {
  const info = $('info');
  const table = $('tagTable');
  const actions = $('actions');
  table.innerHTML = '';
  actions.innerHTML = '';
  info.hidden = false;

  const isJpeg = file.type === 'image/jpeg';
  const size = await engine.decodeImageFile(file).then(s => {
    const r = { w: s.naturalWidth || s.width, h: s.naturalHeight || s.height };
    if (s.close) s.close();
    return r;
  }).catch(() => null);

  addRow(table, t('exifFileName'), file.name);
  addRow(table, t('exifFormat'), file.type || t('exifUnknown'));
  if (size) addRow(table, t('exifDimensions'), `${size.w} × ${size.h}`);
  addRow(table, t('exifFileSize'), fmtSize(file.size));

  if (!isJpeg) {
    addRow(table, 'EXIF', t('exifNoneJpg'));
    return;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const seg = exif.getExifSegment(bytes);
  if (!seg) {
    addRow(table, 'EXIF', t('exifNotDetected'));
    return;
  }
  const { rows, hasGps } = parseExif(seg);
  for (const [k, v] of rows) addRow(table, k, v);
  if (hasGps) addRow(table, t('exifGpsTagWarn'), t('exifGpsFound'), true);
  else addRow(table, t('exifGpsTag'), t('exifNotDetected'));

  if (hasGps) {
    const btn1 = document.createElement('button');
    btn1.className = 'btn primary lg';
    btn1.textContent = t('exifDlGpsBtn');
    btn1.addEventListener('click', async () => {
      const { seg: stripped } = exif.stripGps(seg);
      const out = exif.graftSegments(removeAllExif(bytes), [stripped]);
      engine.downloadBlob(new Blob([out], { type: 'image/jpeg' }), tf('exifGpsName', file.name.replace(/\.jpe?g$/i, '')));
      track('download', { tool: TOOL, mode: 'strip-gps' });
    });
    actions.appendChild(btn1);
  }

  const btn2 = document.createElement('button');
  btn2.className = 'btn ghost lg';
  btn2.textContent = t('exifDlAllBtn');
  btn2.addEventListener('click', () => {
    const out = removeAllExif(bytes);
    engine.downloadBlob(new Blob([out], { type: 'image/jpeg' }), tf('exifAllName', file.name.replace(/\.jpe?g$/i, '')));
    track('download', { tool: TOOL, mode: 'strip-all' });
  });
  actions.appendChild(btn2);
}
