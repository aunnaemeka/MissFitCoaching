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
const SAMPLE_FPS = 10;                          // interval resolution: 0.1s
const PAD = 0.4;                                // seconds either side of a run

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
 * Sample the block's own footprint and return the runs where it is painted.
 * Raw RGB straight out of ffmpeg rather than PNGs on disk, so this needs no
 * image library and no temp files.
 */
function blockRuns(file) {
  const W = BLOCK.w, H = BLOCK.h, FRAME = W * H * 3;
  const raw = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-vf',
    `fps=${SAMPLE_FPS},crop=${W}:${H}:${BLOCK.x}:${BLOCK.y}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1 << 30 });

  const on = [];
  for (let f = 0; f + FRAME <= raw.length; f += FRAME) {
    let hit = 0, seen = 0;
    for (let y = 6; y < H - 6; y += 4) {
      for (let x = 6; x < W - 6; x += 4) {
        const i = f + (y * W + x) * 3;
        seen++;
        if (isBlock([raw[i], raw[i + 1], raw[i + 2]])) hit++;
      }
    }
    on.push(hit / seen > 0.8);
  }

  // close single-frame dropouts so one compressed frame does not split a run
  for (let i = 1; i < on.length - 1; i++) if (on[i - 1] && on[i + 1]) on[i] = true;

  const runs = [];
  let start = null;
  on.forEach((v, i) => {
    if (v && start === null) start = i;
    if (!v && start !== null) { runs.push([start / SAMPLE_FPS, (i - 1) / SAMPLE_FPS]); start = null; }
  });
  if (start !== null) runs.push([start / SAMPLE_FPS, (on.length - 1) / SAMPLE_FPS]);
  return runs.filter(([a, b]) => b - a >= 0.4);
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

const runs = blockRuns(master);
if (!runs.length) {
  console.error('no redaction block found. Either this master does not have one, ' +
                'or it is a different colour. Check a frame before trusting this.');
  process.exit(1);
}

const covered = runs.reduce((n, [a, b]) => n + (b - a), 0);
console.error(`block painted in ${covered.toFixed(1)}s of ${meta.duration.toFixed(1)}s, ` +
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

console.error(`\nwrote ${out}`);
console.error('Check a frame from the middle of each segment before uploading. ' +
              'Then: aws s3 cp <out> s3://missfit-s3-media-prd/video/<name>.mp4 ' +
              '--profile missfit --cache-control "public, max-age=31536000, immutable"');
console.error('The objects are immutable at the edge, so replacing one needs ' +
              'a CloudFront invalidation on distribution E213W02J15QH0G.');
