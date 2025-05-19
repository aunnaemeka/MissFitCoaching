const DEBUG = false;  // Set to true temporarily to inspect incoming Origins
const ALLOWED_ORIGINS = [
  'https://missfitcoaching.pages.dev',
  'https://www.missfitcoaching.pages.dev',
  'https://missfitcoaching.com',
  'https://www.missfitcoaching.com'
];

function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';

  debugLog('Incoming request origin:', origin);

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
    if (!env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY not set');
      return new Response(JSON.stringify({ error: 'Server configuration error: STRIPE_SECRET_KEY not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }

    const { planName, amount, paymentType, intervalCount, returnUrl } = await request.json();
    debugLog('Payment request for:', planName, amount);

    if (!planName || !amount) {
      return new Response(JSON.stringify({ error: 'Missing planName or amount' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }

    const cancelUrl = returnUrl || origin;
    const productName = `MissFit - ${planName} Plan`;

    let sessionParams = {
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

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(sessionParams).toString(),
    });

    const session = await response.json();
    if (!response.ok) {
      throw new Error(session.error?.message || 'Failed to create Stripe session');
    }

    return new Response(JSON.stringify({ sessionId: session.id }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    });

  } catch (error) {
    console.error('Payment error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }
}
