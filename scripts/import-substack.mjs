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

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

const stripTags = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

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
      excerpt: plain.slice(0, 200).trim(),
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
