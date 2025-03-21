export async function onRequest(context) {
    const { request, env } = context;

    const response = await context.next();

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    newHeaders.set('Pragma', 'no-cache');
    newHeaders.set('Expires', '0');

    return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
    });
}