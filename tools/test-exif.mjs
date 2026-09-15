/**
 * Regression tests for exif.js (Node, no DOM).
 * Usage: node tools/test-exif.mjs
 * Builds synthetic JPEG/EXIF bytes to verify: segment extraction, GPS
 * double-strip, graft position and integrity, policy combinations.
 */
import {
  getExifSegment, getIccSegments, stripGps, graftSegments, applyMetadataPolicy, findExifApp1,
} from '../js/exif.js';

let failed = 0;
function ok(cond, msg) {
  console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`);
  if (!cond) failed++;
}

/* ---------- Synthetic EXIF APP1 (TIFF/II + IFD0 with 2 entries: Make + GPS pointer + fake GPS IFD) ---------- */
function buildExifSeg() {
  const ns = [0xff, 0xe1]; // placeholder, length filled later
  const tiffData = [];
  const push = (...b) => tiffData.push(...b);

  // TIFF header: "II" 42(LE) IFD0 offset=8
  push(0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00);
  // IFD0 @8: 2 entries (Make: "AB" inline; GPS pointer -> 0x30)
  push(0x02, 0x00); // count=2
  // entry1: tag=0x010F(Make) type=2 count=2 value inline "AB\0\0"
  push(0x0f, 0x01, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x41, 0x42, 0x00, 0x00);
  // entry2: tag=0x8825(GPS IFD pointer) type=4 count=1 value=38 (GPS IFD actually at TIFF offset 38: 8 header + 2 count + 2x12 entries + 4 next-IFD)
  push(0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00);
  // next-IFD offset = 0
  push(0x00, 0x00, 0x00, 0x00);
  // GPS IFD @38: 2 entries (fake data, later asserted to be zeroed)
  push(0x02, 0x00); // count=2
  push(0x00, 0x01, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x4e, 0x00, 0x00, 0x00); // GPSLatitudeRef="N"
  push(0x02, 0x01, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x11, 0x22, 0x33, 0x00); // GPSLatitude
  push(0x00, 0x00, 0x00, 0x00);

  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiffData]; // "Exif\0\0"
  const segLen = 2 + payload.length; // length field includes itself
  const seg = new Uint8Array([0xff, 0xe1, segLen >> 8, segLen & 0xff, ...payload]);
  // Fix offsets: IFD0 at tiff+8; entries at +2; the GPS pointer must target tiff+0x30 = payload offset 6+0x30
  return seg;
}

function buildIccSeg(idx, total) {
  const ns = 'ICC_PROFILE\0';
  const payload = [...ns.split('').map(c => c.charCodeAt(0)), idx, total, 0xaa, 0xbb];
  const segLen = 2 + payload.length;
  return new Uint8Array([0xff, 0xe2, segLen >> 8, segLen & 0xff, ...payload]);
}

/* Minimal host JPEG: SOI + APP0(JFIF) + APP1(Exif) + APP2(ICC) + DQT + EOI */
function buildHostJpeg(withExif = true, withIcc = true) {
  const parts = [[0xff, 0xd8]];
  const app0Len = 16;
  parts.push([0xff, 0xe0, 0x00, app0Len, ...'JFIF\0'.split('').map(c => c.charCodeAt(0)), 1, 2, 0, 0, 1, 0, 1, 0, 0]);
  if (withExif) parts.push([...buildExifSeg()]);
  if (withIcc) { parts.push([...buildIccSeg(1, 1)]); }
  parts.push([0xff, 0xdb, 0x00, 0x04, 0x43, 0x44]); // DQT (non-APP segment; the walk should stop here)
  parts.push([0xff, 0xd9]);
  return new Uint8Array(parts.flat());
}

console.log('EXIF segment extraction');
{
  const host = buildHostJpeg();
  const seg = getExifSegment(host);
  ok(seg != null, 'APP1(Exif) extracted');
  ok(findExifApp1(host).segLen === seg.length - 2, 'segment length consistent');
  ok(String.fromCharCode(...seg.subarray(4, 10)) === 'Exif\0\0', 'namespace correct');
  ok(getExifSegment(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])) === null, 'no EXIF -> null');
}

console.log('GPS double-strip');
{
  const seg = getExifSegment(buildHostJpeg());
  const { seg: stripped, removed } = stripGps(seg);
  ok(removed === true, 'reports removed');
  const dv = new DataView(stripped.buffer, stripped.byteOffset, stripped.byteLength);
  // Pointer value at: tiff(10) + IFD0 offset 8 + count 2 + entry1(12) + value field 8 = segment offset 40
  ok(dv.getUint32(40, true) === 0, 'GPS IFD pointer zeroed');
  // GPS IFD data area: tiff + 38 = segment offset 48, length 2 + 2x12 + 4 = 30
  const gpsRegion = stripped.subarray(48, 48 + 2 + 2 * 12 + 4);
  ok(gpsRegion.every(b => b === 0), 'GPS data area bytes zeroed');
  // Make value at: tiff + entry1 value field (8+2+8=18) = segment offset 28
  ok(stripped[28] === 0x41 && stripped[29] === 0x42, 'other entries (Make="AB") preserved');
  // Segment without GPS: removed=false (entry2 tag patched: segment offset 10+22=32)
  const noGps = buildExifSeg();
  const ndv = new DataView(noGps.buffer, noGps.byteOffset, noGps.byteLength);
  ndv.setUint16(32, 0x0100, true); // entry2 tag changed to non-0x8825
  const r2 = stripGps(noGps);
  ok(r2.removed === false, 'safely skipped when no GPS pointer');
}

console.log('ICC segment extraction');
{
  const host = buildHostJpeg(true, true);
  const iccs = getIccSegments(host);
  ok(iccs.length === 1, 'one APP2(ICC) extracted');
  ok(String.fromCharCode(...iccs[0].subarray(4, 4 + 12)) === 'ICC_PROFILE\0', 'ICC namespace correct');
}

console.log('Grafting');
{
  // Output JPEG: SOI + APP0 + DQT + EOI (canvas re-encode carries no metadata)
  const out = buildHostJpeg(false, false);
  const src = buildHostJpeg(true, true);
  const exif = getExifSegment(src);
  const iccs = getIccSegments(src);
  const grafted = graftSegments(out, [...iccs, exif]);
  ok(grafted.length === out.length + exif.length + iccs[0].length, 'length = host + all segments');
  // Insertion point after APP0 (out's APP0 ends at 2+18=20)
  ok(grafted[20] === 0xff && grafted[21] === 0xe2, 'first grafted segment right after APP0 (ICC first)');
  ok(findExifApp1(grafted) != null, 'EXIF re-extractable after grafting');
  // DQT still present (last 8 bytes = DQT(6) + EOI(2), FF DB at len-8)
  ok(grafted[grafted.length - 8] === 0xff && grafted[grafted.length - 7] === 0xdb, 'later segments (DQT) preserved');
}

console.log('Metadata policy combinations');
{
  const src = buildHostJpeg(true, true);
  const out = buildHostJpeg(false, false);
  const r1 = applyMetadataPolicy(src, out, { keepExif: true, stripGpsOn: true, keepIcc: true });
  ok(r1.exifKept && r1.gpsStripped && r1.iccCount === 1, 'all on: EXIF kept + GPS stripped + ICC kept');
  ok(findExifApp1(r1.bytes) != null, 'output contains the EXIF segment');
  const r2 = applyMetadataPolicy(src, out, {});
  ok(!r2.exifKept && r2.iccCount === 0 && r2.bytes === out, 'all off: output untouched (same reference)');
  const r3 = applyMetadataPolicy(src, out, { keepExif: true, stripGpsOn: false });
  const r3exif = getExifSegment(r3.bytes);
  const r3dv = new DataView(r3exif.buffer, r3exif.byteOffset, r3exif.byteLength);
  ok(r3dv.getUint32(40, true) === 38, 'pointer preserved when not stripping GPS (=38)');
}

console.log(failed === 0 ? '\nALL PASSED ✅' : `\n${failed} FAILED ❌`);
process.exit(failed === 0 ? 0 : 1);
