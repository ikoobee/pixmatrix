/**
 * JPEG metadata guardian — pure functions, no DOM (Node regression-testable).
 *
 * Problem solved: canvas re-encoding discards all metadata of the source
 * JPEG (EXIF shooting parameters / ICC color profile). Photo delivery needs
 * those preserved — yet GPS location must be stripped (privacy).
 *
 * Approach (segment-level operations):
 *   1. Extract the APP1(Exif) and APP2(ICC_PROFILE) segments from the
 *      original JPEG bytes;
 *   2. stripGps: parse the TIFF structure, zero the GPS IFD pointer in
 *      IFD0 (tag 0x8825) AND wipe the GPS IFD data area — pointer
 *      unreachable + bytes unreadable, double removal;
 *   3. graft: insert the (processed) segments back into the output JPEG,
 *      after SOI/APP0.
 *
 * Boundaries: JPEG only (PNG/WebP outputs get no such handling, the UI
 * says so); corrupted/non-standard EXIF is skipped without blocking.
 */

/* ---------- Segment walking ---------- */

/**
 * Find the APP1(Exif) segment's {start, segLen}; null when absent.
 * Segment layout: FF E1 [len:2] "Exif\0\0" [TIFF...]
 */
export function findExifApp1(u8) {
  let pos = 2; // skip SOI
  while (pos + 4 <= u8.length) {
    if (u8[pos] !== 0xff) return null;
    const marker = u8[pos + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) return null;
    const segLen = (u8[pos + 2] << 8) | u8[pos + 3];
    if (marker === 0xe1) {
      const ns = 'Exif\0\0';
      let match = true;
      for (let i = 0; i < 6; i++) {
        if (u8[pos + 4 + i] !== ns.charCodeAt(i)) { match = false; break; }
      }
      if (match) return { start: pos, segLen };
    }
    pos += 2 + segLen;
  }
  return null;
}

/** Extract a full copy of the APP1(Exif) segment (incl. FF E1 and length field). */
export function getExifSegment(u8) {
  const f = findExifApp1(u8);
  return f ? u8.slice(f.start, f.start + 2 + f.segLen) : null;
}

/** Extract copies of all APP2(ICC_PROFILE) segments (ICC may span several). */
export function getIccSegments(u8) {
  const out = [];
  let pos = 2;
  const ns = 'ICC_PROFILE\0';
  while (pos + 4 <= u8.length) {
    if (u8[pos] !== 0xff) break;
    const marker = u8[pos + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) break;
    const segLen = (u8[pos + 2] << 8) | u8[pos + 3];
    if (marker === 0xe2) {
      let match = true;
      for (let i = 0; i < ns.length; i++) {
        if (u8[pos + 4 + i] !== ns.charCodeAt(i)) { match = false; break; }
      }
      if (match) out.push(u8.slice(pos, pos + 2 + segLen));
    }
    pos += 2 + segLen;
  }
  return out;
}

/* ---------- GPS removal (TIFF parsing) ---------- */

/**
 * Strip GPS info from an EXIF segment (returns a new copy).
 * @returns {{ seg: Uint8Array, removed: boolean }}
 *   removed=false means no GPS pointer or parsing failed (copy returned as-is).
 */
export function stripGps(exifSeg) {
  const seg = Uint8Array.from(exifSeg);
  // seg: FF E1 len:2 "Exif\0\0" TIFF...
  const tiff = 10; // FF E1(2) + len(2) + "Exif\0\0"(6)
  if (seg.length < tiff + 8) return { seg, removed: false };

  const little = seg[tiff] === 0x49 && seg[tiff + 1] === 0x49; // "II"
  const big = seg[tiff] === 0x4d && seg[tiff + 1] === 0x4d;    // "MM"
  if (!little && !big) return { seg, removed: false };
  const dv = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  const r16 = o => dv.getUint16(o, little);
  const r32 = o => dv.getUint32(o, little);

  const ifd0 = tiff + r32(tiff + 4);
  if (ifd0 + 2 > seg.length) return { seg, removed: false };
  const count = r16(ifd0);
  let removed = false;
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > seg.length) break;
    if (r16(entry) === 0x8825) { // GPSInfo IFD pointer
      const gpsOff = r32(entry + 8);
      // (1) zero the pointer -> unreachable by tools
      dv.setUint32(entry + 8, 0, little);
      // (2) wipe the GPS IFD data area -> unreadable at the byte level
      if (gpsOff > 0 && tiff + gpsOff + 2 <= seg.length) {
        const n = r16(tiff + gpsOff);
        const end = Math.min(seg.length, tiff + gpsOff + 2 + n * 12 + 4);
        for (let k = tiff + gpsOff; k < end; k++) seg[k] = 0;
      }
      removed = true;
    }
  }
  return { seg, removed };
}

/* ---------- Grafting ---------- */

/**
 * Insert metadata segments into the output JPEG (after SOI and any existing
 * APP0/APP1/APP2, before other segments).
 * @param {Uint8Array} jpeg output image bytes
 * @param {Uint8Array[]} segs segments to insert (full segment bytes incl. FF Ex/len)
 */
export function graftSegments(jpeg, segs) {
  if (!segs.length) return jpeg;
  let pos = 2; // SOI
  while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff) {
    const m = jpeg[pos + 1];
    if (m !== 0xe0 && m !== 0xe1 && m !== 0xe2) break;
    pos += 2 + ((jpeg[pos + 2] << 8) | jpeg[pos + 3]);
  }
  const total = segs.reduce((s, x) => s + x.length, 0);
  const out = new Uint8Array(jpeg.length + total);
  out.set(jpeg.subarray(0, pos), 0);
  let p = pos;
  for (const s of segs) {
    out.set(s, p);
    p += s.length;
  }
  out.set(jpeg.subarray(pos), p);
  return out;
}

/**
 * One step of the delivery pipeline: apply the metadata policy to the
 * output JPEG.
 * @param {Uint8Array} srcBytes source bytes (for EXIF/ICC extraction)
 * @param {Uint8Array} outBytes output bytes (after canvas re-encoding)
 * @param {{ keepExif?: boolean, stripGpsOn?: boolean, keepIcc?: boolean }} opts
 * @returns {{ bytes: Uint8Array, exifKept: boolean, gpsStripped: boolean, iccCount: number }}
 */
export function applyMetadataPolicy(srcBytes, outBytes, opts = {}) {
  const res = { bytes: outBytes, exifKept: false, gpsStripped: false, iccCount: 0 };
  const segs = [];
  if (opts.keepExif) {
    const exif = getExifSegment(srcBytes);
    if (exif) {
      let seg = exif;
      if (opts.stripGpsOn) {
        const r = stripGps(exif);
        seg = r.seg;
        res.gpsStripped = r.removed;
      }
      segs.push(seg);
      res.exifKept = true;
    }
  }
  if (opts.keepIcc) {
    const iccs = getIccSegments(srcBytes);
    segs.push(...iccs);
    res.iccCount = iccs.length;
  }
  if (segs.length) res.bytes = graftSegments(outBytes, segs);
  return res;
}
