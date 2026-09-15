/**
 * Regression tests for the engine's pure functions (Node, no DOM).
 * Usage: node tools/test-engine-math.mjs
 * Covers: computeCoverCrop (multi-size crop core) and downscaleFactor
 * (huge-image guard).
 */
import { computeCoverCrop, downscaleFactor, MAX_CANVAS_PIXELS, OUTPUT_SIZES } from '../js/engine.js';

let failed = 0;
function ok(cond, msg) {
  console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`);
  if (!cond) failed++;
}

console.log('computeCoverCrop');
{
  const r = computeCoverCrop(1000, 1000, null);
  ok(r.w === 1000 && r.h === 1000 && r.sx === 0 && r.sy === 0, 'ratio=null -> whole image');
}
{
  // Landscape to 1:1 -> crop left/right
  const r = computeCoverCrop(2000, 1000, 1);
  ok(r.w === 1000 && r.h === 1000 && r.sx === 500 && r.sy === 0, '2000x1000 -> 1:1 center crop');
}
{
  // Landscape to 3:4 (taller) -> crop more left/right
  const r = computeCoverCrop(2000, 1000, 3 / 4);
  ok(r.w === 750 && r.h === 1000 && r.sx === 625, '2000x1000 -> 3:4');
}
{
  // Portrait to 9:16 -> crop top/bottom
  const r = computeCoverCrop(1080, 2400, 9 / 16);
  ok(r.w === 1080 && r.h === 1920 && r.sy === 240, '1080x2400 -> 9:16 center crop');
}
{
  // Already at the target ratio -> whole image
  const r = computeCoverCrop(1080, 1920, 9 / 16);
  ok(r.w === 1080 && r.h === 1920 && r.sx === 0 && r.sy === 0, 'same ratio -> no crop');
}
{
  // Crop region ratio is exact
  for (const s of OUTPUT_SIZES.filter(x => x.ratio)) {
    const r = computeCoverCrop(1234, 777, s.ratio);
    ok(Math.abs(r.w / r.h - s.ratio) < 0.01, `cropped ratio ~= ${s.key}`);
  }
}

console.log('downscaleFactor');
ok(downscaleFactor(1000, 1000) === 1, 'small image -> no downscale');
ok(downscaleFactor(8000, 6000) < 1, '48MP -> downscale');
{
  const f = downscaleFactor(8000, 6000);
  // Contract: floored dimensions after scaling never exceed the cap
  ok(Math.floor(8000 * f) * Math.floor(6000 * f) <= MAX_CANVAS_PIXELS, 'floored result stays under the cap');
  ok(Math.abs(f - Math.sqrt(MAX_CANVAS_PIXELS / (8000 * 6000))) < 1e-12, 'exact proportional factor');
}

console.log('OUTPUT_SIZES 档位');
ok(OUTPUT_SIZES.length === 4 && OUTPUT_SIZES[0].ratio === null, 'original + 3 target ratios');

console.log(failed === 0 ? '\nALL PASSED ✅' : `\n${failed} FAILED ❌`);
process.exit(failed === 0 ? 0 : 1);
