/* /article?slug=x -> /insights/x (MM-47).

   Articles used to live at article.html?slug=x. _redirects cannot match a
   query string, so this does it. /article.html reaches here after Pages'
   own 308 to the extensionless path. article.html itself is now only the
   template that functions/insights/[slug].js renders into. */

export function onRequest({ request }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const to = slug ? '/insights/' + encodeURIComponent(slug) : '/insights';
  return Response.redirect(new URL(to, url.origin).toString(), 301);
}
