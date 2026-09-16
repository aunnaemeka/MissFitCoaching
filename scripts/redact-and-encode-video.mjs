#!/usr/bin/env node
/**
 * Prepare a client testimonial master for the web.
 *
 *   node scripts/redact-and-encode-video.mjs <master.mp4> <out.mp4>
 *
 * Two jobs, because they have to happen together:
 *
 * 1. Encode. The masters are ~400MB at 7Mbps. Cloudflare Pages caps files at
 *    25MiB, so these live in S3 behind CloudFront, and they still need to come
 *    down to roughly 1Mbps before anyone will sit through one.
 *
 * 2. Redact. The recordings carry the speaker's first name in the bottom-left,
 *    and MM-22 credits clients by initials only. Someone upstream already
 *    painted a flat block over it and placed it a few pixels too far right, so
 *    the name is still legible beside it. That was true of the first cut and
 *    still true of the file named "-Corrected_RP-full.mp4" sent on 2026-09-16.
 *    Rather than trust the block, this finds it and extends it to the frame
 *    edge, only for the frames where it is painted, so the corner is untouched
 *    in the cutaway shots.
 *
 * The detection is deliberately dumb: the block is a flat dark brown that
 * nothing else in these rooms comes close to. If a future master uses a
 * different colour or no block at all, this exits rather than guessing, and
 * the numbers below need re-measuring against a frame.
 *
 * ffmpeg is not a dependency of this site, so install it just for the run.
 * Install it in the repo, not in whatever directory you happen to be in:
 * resolution is relative to this file, not the working directory.
 *
 *   npm install --no-save ffmpeg-static ffprobe-static
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let FFMPEG, FFPROBE;
try {
  FFMPEG = require('ffmpeg-static');
  FFPROBE = require('ffprobe-static').path;
} catch {
  console.error('needs ffmpeg: npm install --no-save ffmpeg-static ffprobe-static');
  process.exit(1);
}

// Measured on the R.P. master at 1280x720. The block sits at x53-109,y650-707;
// the name runs x20-49,y653-704, i.e. to its left and slightly taller.
const BLOCK = { x: 53, y: 650, w: 57, h: 58, hex: '0x412100' };
const MASK = { x: 0, y: 646, w: 114, h: 66 };   // covers both, with margin
// Where the name itself sits. Used by the check at the end.
const NAME = { x: 18, y: 684, w: 34, h: 22 };
const SAMPLE_FPS = 10;                          // interval resolution: 0.1s
const COVERAGE = 0.45;       // block coverage that counts as painted
const GLYPH_EDGES = 20;      // edge pixels that count as text
// Padding is small because the glyph test finds the end of a run to within a
// frame or two. It was 1.0s while detection keyed off the block alone, which
// left the mask sitting over the following cutaway for a visible second.
const PAD = 0.3;

const isBlock = ([r, g, b]) =>
  r > 40 && r < 115 && g > 12 && g < 72 && b < 48 && r > g && g > b;

function probe(file) {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries',
    'format=duration:stream=width,height', '-of', 'json', file]);
  const j = JSON.parse(out);
  const v = j.streams.find((s) => s.width);
  return { duration: +j.format.duration, width: v.width, height: v.height };
}

/**
 * Where is the name on screen?
 *
 * Two independent signals, unioned, because each misses on its own:
 *
 *   the block   - the flat brown patch baked into the footage. Marks the
 *                 talking-head shots, but fades out a few frames before the
 *                 name does, which is how an earlier pass left 10s exposed.
 *   glyph edges - bright pixels sitting next to much darker ones inside the
 *                 name box. Text has many, a brightly lit wall has none. On
 *                 the R.P. master this fires on 605 sampled frames, 604 of
 *                 which have the block, and on 1 of 828 cutaway frames.
 */
function nameRuns(file) {
  const r = sampleRegions(file, SAMPLE_FPS);
  const on = r.block.map((b, i) => b || r.glyph[i]);

  // close single-frame dropouts so one compressed frame does not split a run
  for (let i = 1; i < on.length - 1; i++) if (on[i - 1] && on[i + 1]) on[i] = true;

  const out = [];
  let start = null;
  on.forEach((v, i) => {
    if (v && start === null) start = i;
    if (!v && start !== null) { out.push([start, i - 1]); start = null; }
  });
  if (start !== null) out.push([start, on.length - 1]);

  // Runs are kept whether the block is painted or not. Dropping the ones with
  // no block frame looks tempting - it would trim a few seconds where the
  // mask sits over a cutaway - but it deletes the 409s segment, where the name
  // is up and the block is not. The check at the end caught that; the seconds
  // of extra cover are not worth trading for it.
  return out
    .map(([a, b]) => [a / SAMPLE_FPS, b / SAMPLE_FPS])
    .filter(([a, b]) => b - a >= 0.4);
}

/** Decode two small crops once and score every sampled frame in both. */
function sampleRegions(file, fps) {
  const N = { x: NAME.x - 8, y: NAME.y - 8, w: NAME.w + 16, h: NAME.h + 16 };
  const grab = (x, y, w, h) => execFileSync(FFMPEG,
    ['-v', 'error', '-i', file, '-vf', `fps=${fps},crop=${w}:${h}:${x}:${y}`,
     '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 });

  const nb = grab(N.x, N.y, N.w, N.h);
  const bb = grab(BLOCK.x, BLOCK.y, BLOCK.w, BLOCK.h);
  const NF = N.w * N.h * 3, BF = BLOCK.w * BLOCK.h * 3;
  const frames = Math.min(nb.length / NF, bb.length / BF) | 0;

  const block = [], glyph = [], edges = [];
  for (let f = 0; f < frames; f++) {
    let hit = 0, seen = 0;
    for (let i = 0; i < BF; i += 12) {
      seen++;
      if (isBlock([bb[f * BF + i], bb[f * BF + i + 1], bb[f * BF + i + 2]])) hit++;
    }
    block.push(hit / seen > COVERAGE);
    const e = glyphEdges(nb, f * NF, N.w, N.h);
    edges.push(e);
    glyph.push(e >= GLYPH_EDGES);
  }
  return { block, glyph, edges, frames };
}

/** Bright pixels with a much darker pixel three across. Text, not a lit wall. */
function glyphEdges(buf, off, w, h) {
  const lum = (x, y) => {
    const i = off + (y * w + x) * 3;
    return (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
  };
  let n = 0;
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      if (lum(x, y) <= 200) continue;
      if (lum(x + 3, y) < 150 || lum(x - 3, y) < 150 ||
          lum(x, y + 3) < 150 || lum(x, y - 3) < 150) n++;
    }
  }
  return n;
}

/**
 * Times where the name is legible in the master but not covered in the output.
 *
 * Deliberately does NOT gate on the block. An earlier version did, and skipped
 * exactly the frames that were broken: at a segment tail the block has already
 * gone while the name is still up, so the check stepped over its own bug and
 * reported a clean run.
 */
function nameStillLegible(masterFile, outFile) {
  const FPS = 5;
  const m = sampleRegions(masterFile, FPS);
  const o = sampleRegions(outFile, FPS);
  const n = Math.min(m.frames, o.frames);
  const bad = [];
  for (let f = 0; f < n; f++) {
    if (m.edges[f] < GLYPH_EDGES) continue;   // no name here in the master
    if (o.edges[f] > 0) bad.push(f / FPS);    // anything left is too much
  }
  return bad;
}

const [master, out] = process.argv.slice(2);
if (!master || !out) {
  console.error('usage: redact-and-encode-video.mjs <master.mp4> <out.mp4>');
  process.exit(1);
}

const meta = probe(master);
if (meta.width !== 1280 || meta.height !== 720) {
  console.error(`expected a 1280x720 master, got ${meta.width}x${meta.height}. ` +
                'The block coordinates above are pixel measurements — re-measure before running.');
  process.exit(1);
}

const runs = nameRuns(master);
if (!runs.length) {
  console.error('no redaction block found. Either this master does not have one, ' +
                'or it is a different colour. Check a frame before trusting this.');
  process.exit(1);
}

const covered = runs.reduce((n, [a, b]) => n + (b - a), 0);
console.error(`name on screen for ${covered.toFixed(1)}s of ${meta.duration.toFixed(1)}s, ` +
              `across ${runs.length} segments:`);
runs.forEach(([a, b]) => console.error(`  ${a.toFixed(1)}s - ${b.toFixed(1)}s`));

const enable = runs
  .map(([a, b]) => `between(t,${Math.max(0, a - PAD).toFixed(1)},${Math.min(meta.duration, b + PAD).toFixed(1)})`)
  .join('+');

execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', master,
  '-vf', `drawbox=x=${MASK.x}:y=${MASK.y}:w=${MASK.w}:h=${MASK.h}:` +
         `color=${BLOCK.hex}@1.0:t=fill:enable='${enable}'`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
  '-maxrate', '1400k', '-bufsize', '2800k', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
  '-movflags', '+faststart', out], { stdio: 'inherit' });

// Verify rather than trust. The reason this file exists is that a redaction was
// signed off twice without anyone checking a frame.
const exposed = nameStillLegible(master, out);
if (exposed.length) {
  console.error(`\nFAILED: the name is still legible in ${exposed.length} sampled ` +
                `frames, first at ${exposed[0].toFixed(1)}s. Do not upload this.`);
  console.error('Raise PAD or lower COVERAGE and run again.');
  process.exit(1);
}

console.error(`\nwrote ${out}`);
console.error('Checked every 0.2s: the name is legible nowhere in the output.');
console.error('Upload:  aws s3 cp <out> s3://missfit-s3-media-prd/video/<name>.mp4 ' +
              '--profile missfit --cache-control "public, max-age=31536000, immutable"');
console.error('The objects are immutable at the edge, so replacing one needs ' +
              'a CloudFront invalidation on distribution E213W02J15QH0G.');
