/* /sitemap.xml - the static page list plus every published article (MM-47).

   sitemap.xml stays the source for the fixed pages. This appends one <url>
   per published Insights article, so a new post is listed as soon as it is
   published without anyone editing the file. If Sanity is down, the static
   list is served unchanged. */

import { SITE, LIST_QUERY, sanity, esc, asset, articlePath } from './_lib/insights.js';

export async function onRequestGet(context) {
  const res = await asset(context, '/sitemap.xml');
  const xml = await res.text();

  let posts = [];
  try {
    posts = (await sanity(LIST_QUERY)) || [];
  } catch (e) { /* static list only */ }

  const urls = posts.map((p) =>
    '  <url>\n' +
    '    <loc>' + esc(SITE + articlePath(p.slug)) + '</loc>\n' +
    ((p._updatedAt || p.publishedAt)
      ? '    <lastmod>' + (p._updatedAt || p.publishedAt).slice(0, 10) + '</lastmod>\n' : '') +
    '    <changefreq>monthly</changefreq>\n' +
    '    <priority>0.7</priority>\n' +
    '  </url>\n').join('');

  return new Response(xml.replace('</urlset>', urls + '</urlset>'), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
