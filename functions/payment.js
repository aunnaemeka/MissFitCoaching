// Add a debug flag to control logging
const DEBUG = true; // Set to true temporarily to diagnose the issue, remember to set to false in production

// Helper function to conditionally log
function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

// Path-based filtering - only process requests to exact payment path
function isPaymentPath(request) {
  const url = new URL(request.url);
  // Updated to match the exact path used in your frontend code
  return url.pathname === '/payment';
}

// Enhanced bot and crawler detection
function isLikelyBot(request) {
  const userAgent = request.headers.get('User-Agent') || '';
  const lowerUserAgent = userAgent.toLowerCase();
  
  // Expanded bot patterns
  const botPatterns = [
    'bot', 'crawler', 'spider', 'pingdom', 'headless', 'facebook', 
    'whatsapp', 'linkedin', 'slack', 'telegram', 'twitter',
    'semrush', 'ahrefs', 'bing', 'google', 'yandex', 'baidu',
    'python', 'urllib', 'curl', 'wget', 'go-http', 'php', 'node-fetch',
    'apache', 'scan', 'check', 'monitor', 'uptime', 'health',
    'cloudflare', 'probe', 'preview'
  ];
  
  return botPatterns.some(pattern => lowerUserAgent.includes(pattern));
}

// Check if request comes from an allowed origin
function isAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  
  // List of allowed domains
  const allowedDomains = [
    'missfitcoaching.pages.dev',
    'missfitcoaching.com',
    'localhost'
  ];
  
  // Check origin
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const hostname = originUrl.hostname;
      
      if (allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain))) {
        return true;
      }
    } catch (e) {
      // Invalid origin format
    }
  }
  
  // Check referer as backup
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const hostname = refererUrl.hostname;
      
      if (allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain))) {
        return true;
      }
    } catch (e) {
      // Invalid referer format
    }
  }
  
  // Neither origin nor referer matched allowed domains
  return false;
}

// Implement route-based quota conservation
function shouldProcessRequest(request) {
  // Skip if not a payment-related path
  if (!isPaymentPath(request)) {
    return false;
  }
  
  // Skip handling bots/crawlers to save quota
  if (isLikelyBot(request)) {
    debugLog('Skipping bot request');
    return false;
  }
  
  // Handle OPTIONS requests
  if (request.method === 'OPTIONS') {
    // Only allow CORS from our domains
    if (!isAllowedOrigin(request)) {
      debugLog('Skipping OPTIONS from disallowed origin');
      return false;
    }
    return true;
  }
  
  // Only allow POST requests
  if (request.method !== 'POST') {
    debugLog('Skipping non-POST request');
    return false;
  }
  
  // Check origin/referer
  if (!isAllowedOrigin(request)) {
    debugLog('Skipping request from disallowed origin');
    return false;
  }
  
  // This request passes all checks
  return true;
}

export async function onRequest(context) {
    const { request, env } = context;
    const clientIP = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    
    // Log request details for debugging
    const url = new URL(request.url);
    debugLog('Request received:', {
      method: request.method,
      path: url.pathname,
      ip: clientIP,
      agent: request.headers.get('User-Agent'),
      origin: request.headers.get('Origin'),
      referer: request.headers.get('Referer')
    });
    
    // Only process valid payment requests to conserve quota
    if (!shouldProcessRequest(request)) {
      return new Response(null, { 
        status: 404, // Return 404 instead of 403 to avoid revealing this is a valid endpoint
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Handle OPTIONS requests efficiently
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400', // Cache CORS preflight for 24 hours
        },
      });
    }
    
    try {
        // Verify required configuration
        if (!env.STRIPE_SECRET_KEY) {
            console.error('STRIPE_SECRET_KEY not set');
            return new Response(JSON.stringify({ error: 'Server configuration error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }
        
        // Extract payment details
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
        
        // Create Stripe checkout session
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
        
        // Return success response
        return new Response(JSON.stringify({ sessionId: session.id }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('Payment error:', error.message);
        return new Response(JSON.stringify({ error: 'Payment processing error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}