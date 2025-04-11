// Add a debug flag to control logging
const DEBUG = false; // Set to false in production, true in development

// Helper function to conditionally log
function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

export async function onRequest(context) {
    const { request, env } = context;
    
    debugLog('Payment request received:', request.method);
    
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }
    
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
    
    try {
        if (!env.STRIPE_SECRET_KEY) {
            console.error('STRIPE_SECRET_KEY not set');
            return new Response(JSON.stringify({ error: 'Server configuration error: STRIPE_SECRET_KEY not set' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }
        
        const { planName, amount, paymentType, intervalCount, returnUrl } = await request.json();
        debugLog('Payment request for:', planName, amount);
        
        if (!planName || !amount) {
            return new Response(JSON.stringify({ error: 'Missing planName or amount' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }
        
        const origin = request.headers.get('Origin') || 'https://missfitcoaching.pages.dev';
        const cancelUrl = returnUrl || origin;
        const productName = `MissFit - ${planName} Plan`;
        
        let sessionParams;
        
        if (paymentType === 'subscription') {
            // Create a subscription-based checkout session
            sessionParams = {
                'payment_method_types[]': 'card',
                'line_items[0][price_data][currency]': 'usd',
                'line_items[0][price_data][product_data][name]': productName,
                'line_items[0][price_data][product_data][description]': `${planName} Package - Monthly Payments`,
                'line_items[0][price_data][unit_amount]': Math.round(parseFloat(amount) * 100).toString(),
                'line_items[0][price_data][recurring][interval]': 'month',
                'line_items[0][price_data][recurring][interval_count]': intervalCount || 1,
                'line_items[0][quantity]': '1',
                'mode': 'subscription',
                'success_url': `${origin}/success.html?plan=${encodeURIComponent(planName)}&type=subscription`,
                'cancel_url': cancelUrl,
            };
        } else {
            // Create a one-time payment checkout session
            sessionParams = {
                'payment_method_types[]': 'card',
                'line_items[0][price_data][currency]': 'usd',
                'line_items[0][price_data][product_data][name]': productName,
                'line_items[0][price_data][product_data][description]': `${planName} Package`,
                'line_items[0][price_data][unit_amount]': Math.round(parseFloat(amount) * 100).toString(),
                'line_items[0][quantity]': '1',
                'mode': 'payment',
                'success_url': `${origin}/success.html?plan=${encodeURIComponent(planName)}&type=onetime`,
                'cancel_url': cancelUrl,
            };
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
        debugLog('Stripe session created:', session.id);
        
        if (!response.ok) {
            throw new Error(session.error?.message || 'Failed to create Stripe session');
        }
        
        return new Response(JSON.stringify({ sessionId: session.id }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('Payment error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}