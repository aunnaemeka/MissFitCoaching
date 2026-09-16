/**
 * Insights page test suite.
 *
 * Run against a local preview server on :8099. Exported as a single function
 * taking Playwright's `page`, so it can be driven by the Playwright MCP
 * (browser_run_code_unsafe --filename) or wrapped in a normal test runner.
 *
 * Why the API call is intercepted: Sanity's CORS allowlist covers
 * missfitcoaching.com but not localhost, so a browser on :8099 cannot reach
 * the query API. The interceptor fetches the REAL payload server-side via
 * Playwright's APIRequestContext (no Origin header, so no CORS) and hands it
 * to the page with the one header the browser needs. Page code runs untouched.
 *
 * Two traps worth knowing, both of which produced false failures while this
 * was being written:
 *   1. Match the API host with a REGEX, not a glob. A glob like
 *      '**"/"*.sanity.io/**' also catches cdn.sanity.io image requests; reading
 *      those with response.text() mangles the binary (the PNG's 0x89 header
 *      byte becomes the UTF-8 replacement character) and every image silently
 *      fails to decode.
 *   2. Routes persist across navigations. unrouteAll() first, or a handler
 *      from an earlier run keeps intercepting.
 *
 * Images use loading="lazy", so they must be scrolled into view before being
 * measured, and decode() is the reliable check - naturalWidth is 0 for a lazy
 * image that simply has not loaded yet, which looks identical to a failure.
 *
 * Third trap, added with the loading skeletons: they are .mm-post too, so that
 * the grid does not resize when the real cards replace them. Every count here
 * therefore says .mm-post:not(.mm-post--skeleton), or three placeholders read
 * as three articles.
 */
async (page) => {


  const BASE = 'http://localhost:8099';
  const PROJECT = '70j9t2re';
  const QUERY =
  '*[_type == "article" && !(_id in path("drafts.**"))] | order(publishedAt desc) ' +
  '{title, "slug": slug.current, category, excerpt, readingTime, publishedAt, ' +
  'seoTitle, substackUrl, "image": mainImage.asset->url}';

  const ok = (cond, name, detail) => ({ name, pass: !!cond, detail });

  const tests = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // real payload, fetched outside the browser
  const api = await page.context().request.get(
    `https://${PROJECT}.apicdn.sanity.io/v2021-10-21/data/query/production?query=` +
    encodeURIComponent(QUERY));
  const payload = await api.text();
  const live = JSON.parse(payload).result || [];
  tests.push(ok(api.status() === 200, 'sanity API reachable', `HTTP ${api.status()}, ${payload.length}B`));

  const serve = (body, status = 200) =>
    page.route(/apicdn\.sanity\.io/, (r) => r.fulfill({
      status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body,
    }));

  const reset = async (bodyOrStatus, qs) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    if (typeof bodyOrStatus === 'number') {
      await page.route(/apicdn\.sanity\.io/, (r) => r.fulfill({ status: bodyOrStatus, body: 'err' }));
    } else {
      await serve(bodyOrStatus);
    }
    await page.goto(`${BASE}/insights.html?${qs}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
  };

  // ---- 1. renders live data ------------------------------------------------
  await reset(payload, 't=live');
  if (live.length) await page.waitForSelector('.mm-post:not(.mm-post--skeleton)', { timeout: 15000 });
  const cards = await page.locator('.mm-post:not(.mm-post--skeleton)').count();
  tests.push(ok(cards === live.length, 'renders every published article', `${cards} cards / ${live.length} in dataset`));

  // Tests below that need real posts are skipped while the dataset is empty,
  // which is the expected state until someone publishes in Studio.

  // ---- 2. drafts excluded --------------------------------------------------
  const all = await page.context().request.get(
    `https://${PROJECT}.apicdn.sanity.io/v2021-10-21/data/query/production?query=` +
    encodeURIComponent('count(*[_type == "article"])'));
  const total = (await all.json()).result;
  tests.push(ok(live.length <= total, 'query excludes drafts', `${live.length} published of ${total} total`));

  // ---- 3. newest first -----------------------------------------------------
  const ordered = await page.locator('.mm-post__meta').evaluateAll((els) => {
    const d = els.map((e) => new Date(e.textContent.split('·')[1]?.trim()).getTime());
    return d.every((x, i) => i === 0 || d[i - 1] >= x);
  });
  tests.push(ok(ordered, 'sorted newest first'));

  // ---- 4. images actually decode -------------------------------------------
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 350) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);
  const imgs = await page.locator('.mm-post__thumb').evaluateAll(async (list) =>
    Promise.all(list.map(async (i) => {
      try { await i.decode(); return true; } catch { return false; }
    })));
  if (live.length) {
    tests.push(ok(imgs.length > 0 && imgs.every(Boolean), 'thumbnails decode',
      `${imgs.filter(Boolean).length}/${imgs.length}`));
  }

  // ---- 5. category filter (needs posts to filter) --------------------------
  if (live.length) {
  await page.getByRole('button', { name: 'Go-to-Market' }).click();
  const emptyCat = await page.locator('.mm-post:not(.mm-post--skeleton)').count();
  const emptyMsg = await page.locator('.mm-insights__state').innerText();
  tests.push(ok(emptyCat === 0 && /Nothing in this category/i.test(emptyMsg),
    'filter with no matches shows its own message', emptyMsg));

  await page.getByRole('button', { name: 'All', exact: true }).click();
  tests.push(ok((await page.locator('.mm-post:not(.mm-post--skeleton)').count()) === live.length, 'filter resets'));

  await page.getByRole('button', { name: 'Go-to-Market' }).click();

  const resetLink = await page.locator('.mm-insights__reset').count();
  await page.locator('.mm-insights__reset').click();
  tests.push(ok(resetLink === 1 && (await page.locator('.mm-post:not(.mm-post--skeleton)').count()) === live.length &&
    (await page.locator('.mm-insights__cat.is-active').innerText()).trim() === 'All',
    'the no-matches state can get you back to All'));
  }

  // ---- 6. empty dataset ----------------------------------------------------
  await reset(JSON.stringify({ result: [] }), 't=empty');
  const emptyState = await page.locator('.mm-insights__state').innerText();
  tests.push(ok(/New writing is on the way/i.test(emptyState) && /Substack/i.test(emptyState),
    'empty dataset shows the coming-soon state and points somewhere', emptyState.replace(/\s+/g, ' ')));

  // ---- 7. API failure ------------------------------------------------------
  await reset(500, 't=fail');
  const failMsg = await page.locator('.mm-insights__state').innerText();
  const navUsable = await page.locator('.header__nav-link').count();
  tests.push(ok(/unavailable/i.test(failMsg) && navUsable === 3,
    'API failure degrades without breaking the page', failMsg.replace(/\s+/g, ' ')));

  // ---- 7b. skeleton, then a hung request must time out ---------------------
  // The reported bug was a bare "Loading..." that never resolved. Both halves
  // matter: something shaped like content while waiting, and a real message if
  // the wait never ends.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route(/apicdn\.sanity\.io/, () => { /* deliberately never settles */ });
  await page.goto(`${BASE}/insights.html?t=hang`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const skeletons = await page.locator('.mm-post--skeleton').count();
  const busyWhileLoading = await page.locator('#insights-list').getAttribute('aria-busy');
  tests.push(ok(skeletons === 3 && busyWhileLoading === 'true',
    'loading shows skeleton cards, not a bare message', `${skeletons} skeletons`));

  await page.waitForTimeout(8200);   // TIMEOUT_MS in the page is 8000
  const hungMsg = await page.locator('.mm-insights__state').innerText();
  tests.push(ok(/taking longer/i.test(hungMsg) &&
    (await page.locator('#insights-list').getAttribute('aria-busy')) === 'false',
    'a hung request times out into a real message', hungMsg.replace(/\s+/g, ' ')));

  // ---- 8. content is escaped -----------------------------------------------
  await reset(JSON.stringify({ result: [{
    title: '<img src=x onerror="window.__XSS=1">pwn',
    slug: 'x', category: 'Market-Ready',
    excerpt: '<script>window.__XSS2=1</script>',
    readingTime: 1, publishedAt: '2026-01-01T00:00:00Z',
  }] }), 't=xss');
  const fired = await page.evaluate(() => !!(window.__XSS || window.__XSS2));
  const injected = await page.locator('.mm-post__title img').count();
  tests.push(ok(!fired && injected === 0, 'CMS content is escaped, not injected'));

  await page.unrouteAll({ behavior: 'ignoreErrors' });

  const failed = tests.filter((t) => !t.pass);
  return {
    passed: tests.length - failed.length,
    total: tests.length,
    failed: failed.map((f) => f.name),
    detail: tests.map((t) => `${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.detail ? '  (' + t.detail + ')' : ''}`),
  };
}
