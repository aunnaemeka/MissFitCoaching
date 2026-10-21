/* Shared by the Insights functions (MM-47, MM-48).

   The site has no build step, so articles used to be fetched from Sanity in
   the browser. AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not run
   JavaScript and saw an empty page. These helpers let the Pages Functions
   render the same markup on the server instead.

   No onRequest export here, so Pages does not route to this file. */

export const SITE = 'https://missfitcoaching.com';
export const SUBSTACK = 'https://dehurter.substack.com';

const PROJECT = '70j9t2re', DATASET = 'production', API = 'v2021-10-21';

// Published only. Drafts stay invisible until someone reviews them.
const PUBLISHED = '_type == "article" && defined(slug.current) && !(_id in path("drafts.**"))';

export const LIST_QUERY =
  '*[' + PUBLISHED + '] | order(publishedAt desc) {' +
  'title, "slug": slug.current, category, excerpt, readingTime, publishedAt,' +
  ' _updatedAt, "image": mainImage.asset->url }';

export const ARTICLE_QUERY =
  '*[' + PUBLISHED + ' && slug.current == $slug][0]{title, "slug": slug.current, ' +
  'category, excerpt, content, readingTime, publishedAt, _updatedAt, seoTitle, ' +
  'seoDescription, substackUrl, "image": mainImage.asset->url}';

export async function sanity(query, params) {
  let url = 'https://' + PROJECT + '.apicdn.sanity.io/' + API + '/data/query/' + DATASET +
            '?query=' + encodeURIComponent(query);
  for (const [k, v] of Object.entries(params || {})) {
    url += '&$' + k + '=' + encodeURIComponent(JSON.stringify(v));
  }
  const r = await fetch(url, { cf: { cacheTtl: 60 } });
  if (!r.ok) throw new Error('Sanity HTTP ' + r.status);
  return (await r.json()).result;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export const articlePath = (slug) => '/insights/' + encodeURIComponent(slug || '');

// The whole card is the link. The newest post in view leads, wide (MM-26).
export function card(p, featured) {
  const meta = [fmtDate(p.publishedAt), p.readingTime ? p.readingTime + ' min read' : null]
    .filter(Boolean).map(esc).join(' &middot; ');
  return '' +
    '<a class="mm-post' + (featured ? ' mm-post--featured' : '') + '" href="' + esc(articlePath(p.slug)) + '">' +
      '<div class="mm-post__media">' +
        (p.image ? '<img class="mm-post__thumb" src="' + esc(p.image) +
                   '?w=' + (featured ? 1200 : 600) + '&fit=max&auto=format" alt="" loading="lazy">'
                 : '<span class="mm-post__thumb mm-post__thumb--empty"></span>') +
        (p.category ? '<span class="mm-post__tag">' + esc(p.category) + '</span>' : '') +
      '</div>' +
      '<div class="mm-post__body">' +
        '<h3 class="mm-post__title">' + esc(p.title) + '</h3>' +
        (meta ? '<p class="mm-post__meta">' + meta + '</p>' : '') +
        (p.excerpt ? '<p class="mm-post__excerpt">' + esc(p.excerpt) + '</p>' : '') +
        '<span class="mm-post__more">Read the full insight <span aria-hidden="true">&rarr;</span></span>' +
      '</div>' +
    '</a>';
}

/* Portable text -> HTML. The importer only emits blocks of plain spans, so
   this handles paragraphs, headings and blockquotes and ignores the rest
   rather than half-rendering something it does not understand. */
export function portableText(blocks) {
  return (blocks || []).map((b) => {
    if (b._type !== 'block') return '';
    const text = (b.children || []).map((c) => esc(c.text)).join('');
    if (!text.trim()) return '';
    if (b.style === 'blockquote') return '<blockquote>' + text + '</blockquote>';
    if (/^h[2-6]$/.test(b.style)) return '<' + b.style + '>' + text + '</' + b.style + '>';
    return '<p>' + text + '</p>';
  }).join('');
}

// JSON inside <script> must not be able to close the tag.
export const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// Static page from the Pages asset store. ASSETS never re-enters Functions.
export function asset(context, path) {
  return context.env.ASSETS.fetch(new URL(path, context.request.url));
}

export function html(body, status, extra) {
  return new Response(body, {
    status: status || 200,
    headers: Object.assign({
      'Content-Type': 'text/html; charset=utf-8',
      // Short, so a newly published article shows up within minutes.
      'Cache-Control': 'public, max-age=300',
    }, extra || {}),
  });
}
