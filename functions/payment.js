const DEBUG = false;
const ALLOWED_ORIGINS = [
  'https://missfitcoaching.com',
  'https://www.missfitcoaching.com',
  'https://missfitcoaching.pages.dev',
  'https://www.missfitcoaching.pages.dev'
];

function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

async function verifyTurnstileToken(token, secretKey, clientIp) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: secretKey,
      response: token,
      remoteip: clientIp
    })
  });

  const result = await res.json();
  return result.success;
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  const clientIp = request.headers.get('CF-Connecting-IP') || '';

  if (request.method !== 'POST' && request.method !== 'OPTIONS') {
    return new Response(null, { status: 405 });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(null, { status: 403 });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const body = await request.json();
    const { planName, amount, paymentType, intervalCount, returnUrl, turnstileToken } = body;

    if (!planName || !amount || !turnstileToken) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }

    const verified = await verifyTurnstileToken(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);

    if (!verified) {
      return new Response(JSON.stringify({ error: 'Bot verification failed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }

    const productName = `MissFit - ${planName} Plan`;
    const cancelUrl = returnUrl || origin;

    const sessionParams = {
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': productName,
      'line_items[0][price_data][product_data][description]': `${planName} Package`,
      'line_items[0][price_data][unit_amount]': Math.round(parseFloat(amount) * 100).toString(),
      'line_items[0][quantity]': '1',
      'mode': paymentType === 'subscription' ? 'subscription' : 'payment',
      'success_url': `${origin}/success.html?plan=${encodeURIComponent(planName)}&type=${paymentType}`,
      'cancel_url': cancelUrl,
    };

    if (paymentType === 'subscription') {
      sessionParams['line_items[0][price_data][recurring][interval]'] = 'month';
      sessionParams['line_items[0][price_data][recurring][interval_count]'] = intervalCount || 1;
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(sessionParams).toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      throw new Error(session.error?.message || 'Stripe session creation failed');
    }

    return new Response(JSON.stringify({ sessionId: session.id }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    });

  } catch (err) {
    console.error('Payment error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }
}
