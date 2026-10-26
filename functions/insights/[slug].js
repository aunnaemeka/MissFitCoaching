/* /insights/<slug> - one article, rendered on the server (MM-47).

   article.html is the template. This fills in the head (title, description,
   self-canonical, Open Graph, BlogPosting JSON-LD) and the body, so every
   crawler sees the finished article without running JavaScript.

   The site is the canonical home of these articles (Josh, 2026-10-20).
   Substack cannot 301 or point its canonical elsewhere, so its copies remain;
   Dee publishes here first from now on. */

import {
  SITE, SUBSTACK, ARTICLE_QUERY, LIST_QUERY, sanity, esc, fmtDate, card,
  portableText, jsonForScript, asset, html, articlePath,
} from '../_lib/insights.js';

const RELATED_MAX = 3;

// Same category first, then most recent. With few posts this can be empty,
// and then the section is left out rather than shown with nothing in it.
function related(all, a) {
  const others = (all || []).filter((p) => p.slug !== a.slug);
  const same = others.filter((p) => a.category && p.category === a.category);
  const rest = others.filter((p) => !same.includes(p));
  return same.concat(rest).slice(0, RELATED_MAX);
}

function body(a) {
  const meta = [a.category, fmtDate(a.publishedAt), a.readingTime ? a.readingTime + ' min read' : null]
    .filter(Boolean).map(esc).join(' &middot; ');
  return '' +
    '<div class="mm-container">' +
      '<p class="mm-article__back"><a href="/insights">&larr; All insights</a></p>' +
      '<p class="mm-article__meta">' + meta + '</p>' +
      '<h1 class="mm-article__title">' + esc(a.title) + '</h1>' +
      (a.image ? '<img class="mm-article__hero" src="' + esc(a.image) +
                 '?w=1200&fit=max&auto=format" alt="">' : '') +
      '<div class="mm-article__body">' + portableText(a.content) + '</div>' +
      (a.substackUrl
        ? '<p class="mm-article__origin">Also published in ' +
          '<a href="' + esc(a.substackUrl) + '" target="_blank" rel="noopener">' +
          'Dee&rsquo;s newsletter<span class="mm-sr"> (opens in a new tab)</span></a>.</p>'
        : '') +
    '</div>';
}

// Outside <article>: these are other pages, not part of this one.
function relatedSection(rel) {
  return rel.length
      ? '<section class="mm-section mm-related" aria-labelledby="related-head">' +
          '<div class="mm-container">' +
            '<h2 class="mm-h2" id="related-head">Related insights</h2>' +
            '<div class="mm-insights__list">' + rel.map((p) => card(p, false)).join('') + '</div>' +
          '</div>' +
        '</section>'
      : '';
}

function state(headline, msg) {
  return '<div class="mm-container"><div class="mm-article__state">' +
    '<p class="mm-article__state-head">' + esc(headline) + '</p>' +
    '<p>' + msg + '</p></div></div>';
}

function schema(a, url, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': url + '#article',
    headline: a.title,
    description,
    url,
    mainEntityOfPage: url,
    image: a.image ? [a.image + '?w=1200&fit=max'] : [SITE + '/assets/images/og-missfit.jpg'],
    datePublished: a.publishedAt || undefined,
    dateModified: a._updatedAt || a.publishedAt || undefined,
    articleSection: a.category || undefined,
    author: { '@type': 'Person', '@id': SITE + '/#dee', name: 'Dacia “Dee” DeRidder', url: SITE + '/method-and-proof' },
    publisher: {
      '@type': 'Organization', '@id': SITE + '/#org', name: 'MissFit Coaching',
      logo: { '@type': 'ImageObject', url: SITE + '/assets/icons/logo-mindset-navy.png' },
    },
    isPartOf: { '@type': 'Blog', '@id': SITE + '/insights#blog', url: SITE + '/insights' },
  };
}

const set = (attr, value) => ({ element(el) { el.setAttribute(attr, value); } });

export async function onRequestGet(context) {
  const slug = decodeURIComponent(context.params.slug || '');
  const template = await asset(context, '/article');

  let a, all;
  try {
    [a, all] = await Promise.all([sanity(ARTICLE_QUERY, { slug }), sanity(LIST_QUERY)]);
  } catch (e) {
    const page = new HTMLRewriter()
      .on('#article', { element(el) { el.setInnerContent(state('This article is unavailable right now.',
        'Try <a href="' + SUBSTACK + '" target="_blank" rel="noopener">Dee&rsquo;s newsletter' +
        '<span class="mm-sr"> (opens in a new tab)</span></a> instead.'), { html: true }); } })
      .on('head', { element(el) { el.append('<meta name="robots" content="noindex">', { html: true }); } })
      .transform(template);
    return html(page.body, 503, { 'Cache-Control': 'no-store', 'Retry-After': '60' });
  }

  if (!a) {
    const page = new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent('Article not found | MissFit Coaching'); } })
      .on('#article', { element(el) { el.setInnerContent(state('That article is not published.',
        '<a href="/insights">Browse all insights</a>.'), { html: true }); } })
      .on('head', { element(el) { el.append('<meta name="robots" content="noindex">', { html: true }); } })
      .transform(template);
    return html(page.body, 404);
  }

  const url = SITE + articlePath(a.slug);
  const title = (a.seoTitle || a.title) + ' | MissFit Coaching';
  const description = a.seoDescription || a.excerpt || '';
  const image = a.image ? a.image + '?w=1200&h=630&fit=crop' : null;

  let rw = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', set('content', description))
    .on('link[rel="canonical"]', set('href', url))
    .on('meta[property="og:type"]', set('content', 'article'))
    .on('meta[property="og:title"]', set('content', title))
    .on('meta[property="og:description"]', set('content', description))
    .on('meta[property="og:url"]', set('content', url))
    .on('head', { element(el) {
      el.append('<script type="application/ld+json">' + jsonForScript(schema(a, url, description)) +
                '</script>', { html: true });
      if (a.publishedAt) {
        el.append('<meta property="article:published_time" content="' + esc(a.publishedAt) + '">', { html: true });
      }
    } })
    .on('#article', { element(el) {
      el.setInnerContent(body(a), { html: true });
      el.after(relatedSection(related(all, a)), { html: true });
    } });

  if (image) {
    rw = rw
      .on('meta[property="og:image"]', set('content', image))
      .on('meta[property="og:image:width"]', set('content', '1200'))
      .on('meta[property="og:image:height"]', set('content', '630'));
  }

  return html(rw.transform(template).body);
}
