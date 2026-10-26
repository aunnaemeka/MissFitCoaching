/* /insights - the hub, rendered on the server (MM-48).

   insights.html is the template. The post cards are written into the page so
   crawlers see a link to every article. The same list goes in as JSON, and
   the page script uses it for the category filter instead of fetching again.
   If Sanity is down, the template is served as it is and the page script
   falls back to its own fetch and error states. */

import { LIST_QUERY, sanity, card, jsonForScript, asset, html } from '../_lib/insights.js';

export async function onRequestGet(context) {
  const template = await asset(context, '/insights');

  let posts;
  try {
    posts = (await sanity(LIST_QUERY)) || [];
  } catch (e) {
    return template;
  }
  if (!posts.length) return template; // the page script has the empty state

  const page = new HTMLRewriter()
    .on('#insights-list', { element(el) {
      el.setAttribute('aria-busy', 'false');
      el.setInnerContent(posts.map((p, i) => card(p, i === 0)).join(''), { html: true });
      el.after('<script type="application/json" id="insights-data">' + jsonForScript(posts) +
               '</script>', { html: true });
    } })
    .transform(template);

  return html(page.body);
}
