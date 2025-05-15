// Add a debug flag to control logging
const DEBUG = false; // Set to false in production, true in development

// Helper function to conditionally log
function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

// Simple in-memory rate limiter using Cloudflare's Cache API
async function isRateLimited(context, ip) {
  try {
    const cache = context.env.PAYMENT_CACHE;
    if (!cache) return false; // Skip rate limiting if cache is not available
    
    const key = `rate_limit:${ip}`;
    const currentValue = await cache.get(key);
    
    if (currentValue) {
      const count = parseInt(currentValue);
      if (count >= 5) { // Limit to 5 requests per minute
        return true;
      }
      await cache.put(key, (count + 1).toString(), { expirationTtl: 60 });
    } else {
      await cache.put(key, "1", { expirationTtl: 60 });
    }
    
    return false;
  } catch (error) {
    console.error("Rate limiting error:", error);
    return false; // Don't block on errors with the rate limiter
  }
}

// Simple bot detection
function isLikelyBot(request) {
  const userAgent = request.headers.get('User-Agent') || '';
  const botPatterns = [
    'bot', 'crawler', 'spider', 'pingdom', 'headless', 'facebook', 
    'whatsapp', 'linkedinbot', 'slackbot', 'telegram', 'twitter',
    'semrush', 'ahrefsbot', 'bingbot', 'googlebot', 'yandex', 'baidu'
  ];
  
  const lowerUserAgent = userAgent.toLowerCase();
  return botPatterns.some(pattern => lowerUserAgent.includes(pattern));
}

// Validate if the request is coming from an allowed origin
function isAllowedOrigin(request) {
  const allowedOrigins = [
    'https://missfitcoaching.pages.dev',
    'https://missfitcoaching.com',
    'http://localhost:3000' // For development
  ];
  
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins.includes(origin);
}

export async function onRequest(context) {
    const { request, env } = context;
    const clientIP = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    
    debugLog('Payment request received:', request.method, 'from', clientIP);
    
    // Skip processing for bots and crawlers to save quota
    if (isLikelyBot(request)) {
        return new Response(null, { status: 403 });
    }
    
    // Handle OPTIONS requests efficiently
    if (request.method === 'OPTIONS') {
        // Only allow CORS for specific origins
        const origin = request.headers.get('Origin');
        const allowedOrigins = [
            'https://missfitcoaching.pages.dev',
            'https://missfitcoaching.com',
            'http://localhost:3000' // For development
        ];
        
        const allowedOrigin = allowedOrigins.includes(origin) ? origin : null;
        
        if (!allowedOrigin) {
            return new Response(null, { status: 403 });
        }
        
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': allowedOrigin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400', // Cache CORS preflight for 24 hours
            },
        });
    }
    
    // Only allow POST requests
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    // Check origin
    if (!isAllowedOrigin(request)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    // Rate limit check
    if (await isRateLimited(context, clientIP)) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    try {
        if (!env.STRIPE_SECRET_KEY) {
            console.error('STRIPE_SECRET_KEY not set');
            return new Response(JSON.stringify({ error: 'Server configuration error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const { planName, amount, paymentType, intervalCount, returnUrl } = await request.json();
        debugLog('Payment request for:', planName, amount);
        
        if (!planName || !amount) {
            return new Response(JSON.stringify({ error: 'Missing planName or amount' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
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
        
        // Allow CORS only for allowed origins
        const requestOrigin = request.headers.get('Origin');
        const allowedOrigins = [
            'https://missfitcoaching.pages.dev',
            'https://missfitcoaching.com',
            'http://localhost:3000' // For development
        ];
        
        const corsHeaders = allowedOrigins.includes(requestOrigin) ? 
            { 'Access-Control-Allow-Origin': requestOrigin } : {};
        
        return new Response(JSON.stringify({ sessionId: session.id }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            },
        });
    } catch (error) {
        console.error('Payment error:', error.message);
        return new Response(JSON.stringify({ error: 'Payment processing error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}