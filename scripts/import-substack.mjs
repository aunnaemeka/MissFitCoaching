#!/usr/bin/env node
/**
 * Import Substack posts as Sanity DRAFTS.
 *
 * Deliberately an import, not a passthrough. Posts land as drafts so someone
 * decides what appears on the site and can edit the title, SEO fields and body
 * before publishing. Once imported the copy is ours: it does not change when
 * Dee edits a post, and it does not disappear when the feed rolls over (the
 * Substack feed only carries the most recent 20).
 *
 *   node scripts/import-substack.mjs                  # write NDJSON to stdout
 *   node scripts/import-substack.mjs -o drafts.ndjson # write to a file
 *
 * Then, from studio-missfit-coaching/:
 *   npx sanity dataset import ../drafts.ndjson production
 *
 * Re-running is safe. Document ids are derived from the Substack slug, so a
 * second import replaces the same drafts rather than duplicating them.
 */

const FEED = 'https://dehurter.substack.com/feed';

// ---------------------------------------------------------------- utilities

/**
 * Substack's feed is entity-encoded, and it uses numeric references heavily -
 * &#8217; for an apostrophe, &#8212; for an em dash. Missing those left the
 * raw entity sitting in the text, which the page then escaped again and
 * rendered literally as "Let&#8217;s say it plainly".
 */
const NAMED = {
  lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…',
};

const decode = (s) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
   .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m))
   // &amp; last, or "&amp;#8217;" would decode to an apostrophe in one pass
   .replace(/&amp;/g, '&');

/**
 * Block tags become a space, not nothing. Without this the paragraph boundary
 * in "...looking for work.</p><p>Companies will tell you..." collapsed into
 * "work.Companies".
 */
const stripTags = (s) =>
  decode(s.replace(/<(?:br|\/p|\/h[1-6]|\/li|\/blockquote|\/div)[^>]*>/gi, ' ')
          .replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** Deterministic key so re-imports produce identical documents. */
function keyFor(seed, i) {
  let h = 0;
  for (const ch of `${seed}:${i}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36).padStart(8, '0').slice(0, 8);
}

function tag(xml, name) {
  const m = xml.match(
    new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${name}>`)
  );
  return m ? (m[1] ?? m[2] ?? '').trim() : '';
}

/**
 * Substack HTML -> Sanity portable text.
 * Headings and paragraphs only. Anything else collapses to a paragraph, which
 * is the honest trade: an editable body beats a perfect one nobody can edit.
 */
function toPortableText(htmlBody, seed) {
  const blocks = [];
  const re = /<(h[1-6]|p|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(htmlBody)) !== null) {
    const tagName = m[1].toLowerCase();
    const text = stripTags(m[2]);
    if (!text) continue;
    const style =
      tagName === 'blockquote' ? 'blockquote'
      : tagName === 'p' ? 'normal'
      : `h${Math.min(parseInt(tagName[1], 10) + 1, 6)}`; // demote: post h1 -> page h2
    // Substack sometimes closes a sentence in its own paragraph - the feed
    // really does contain "<p>Find that organization</p><p>.</p>". Rejoin it
    // rather than render a paragraph made of one full stop.
    const prev = blocks[blocks.length - 1];
    if (prev && style === 'normal' && prev.style === 'normal' && /^[.,;:!?…]+$/.test(text)) {
      prev.children[0].text += text;
      continue;
    }

    blocks.push({
      _type: 'block',
      _key: keyFor(seed, blocks.length),
      style,
      markDefs: [],
      children: [{ _type: 'span', _key: keyFor(seed, blocks.length + 5000), text, marks: [] }],
    });
  }
  return blocks;
}

/** Cut at a sentence if there is one nearby, otherwise a word. Never mid-word. */
function excerptOf(plain, max = 220) {
  if (plain.length <= max) return plain;
  const head = plain.slice(0, max);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
  if (stop > max * 0.5) return head.slice(0, stop + 1);
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).replace(/[,;:]$/, '') + '…';
}

function slugFrom(link, title) {
  const fromUrl = (link.match(/\/p\/([a-z0-9-]+)/i) || [])[1];
  if (fromUrl) return fromUrl.toLowerCase();
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

// ------------------------------------------------------------------- import

async function main() {
  const outIdx = process.argv.indexOf('-o');
  const outFile = outIdx > -1 ? process.argv[outIdx + 1] : null;

  const res = await fetch(FEED, { headers: { 'user-agent': 'missfit-import/1.0' } });
  if (!res.ok) throw new Error(`feed fetch failed: HTTP ${res.status}`);
  const xml = await res.text();

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  if (!items.length) throw new Error('no <item> elements in feed');

  const docs = items.map((item) => {
    const title = stripTags(tag(item, 'title'));
    const link = tag(item, 'link');
    const slug = slugFrom(link, title);
    const bodyHtml = tag(item, 'content:encoded') || tag(item, 'description');
    const plain = stripTags(bodyHtml);

    return {
      // drafts. prefix => lands unpublished in Studio, awaiting review
      _id: `drafts.substack-${slug}`,
      _type: 'article',
      title,
      slug: { _type: 'slug', current: slug },
      source: 'substack',
      substackUrl: link,
      publishedAt: new Date(tag(item, 'pubDate') || Date.now()).toISOString(),
      excerpt: excerptOf(plain),
      // ~225 wpm, the usual reading-speed assumption
      readingTime: Math.max(1, Math.round(plain.split(/\s+/).filter(Boolean).length / 225)),
      // left blank on purpose: an editor fills these, they are not auto-derived
      seoTitle: '',
      seoDescription: '',
      category: null,
      content: toPortableText(bodyHtml, slug),
      importedAt: new Date().toISOString(),
    };
  });

  const ndjson = docs.map((d) => JSON.stringify(d)).join('\n') + '\n';

  if (outFile) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outFile, ndjson, 'utf8');
    const words = docs.reduce(
      (n, d) => n + d.content.reduce((w, b) => w + b.children[0].text.split(/\s+/).length, 0), 0);
    process.stderr.write(
      `imported ${docs.length} posts as drafts -> ${outFile}\n` +
      `  blocks: ${docs.reduce((n, d) => n + d.content.length, 0)}   words: ${words}\n` +
      `  next:  cd studio-missfit-coaching && npx sanity dataset import ../${outFile} production\n`
    );
  } else {
    process.stdout.write(ndjson);
  }
}

main().catch((e) => {
  process.stderr.write(`import failed: ${e.message}\n`);
  process.exit(1);
});
