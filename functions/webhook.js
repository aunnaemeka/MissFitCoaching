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
    
    // Only allow POST requests for webhooks
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Get the raw body for verification
    let rawBody;
    try {
        rawBody = await request.text();
    } catch (error) {
        console.error('Failed to read request body:', error);
        return new Response(JSON.stringify({ 
            error: 'Failed to process webhook request body',
            details: error.message 
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Validate Stripe signature
    try {
        // Get the webhook signature from the headers
        const signature = request.headers.get('stripe-signature');
        
        if (!signature) {
            throw new Error('No Stripe signature found in the request');
        }
        
        if (!env.STRIPE_WEBHOOK_SECRET) {
            console.error('Missing webhook secret configuration');
            return new Response(JSON.stringify({ 
                error: 'Server configuration error: STRIPE_WEBHOOK_SECRET not set' 
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        if (!env.STRIPE_SECRET_KEY) {
            console.error('Missing Stripe secret key configuration');
            return new Response(JSON.stringify({ 
                error: 'Server configuration error: STRIPE_SECRET_KEY not set' 
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Verify the webhook using the Stripe API
        const verifyResponse = await fetch('https://api.stripe.com/v1/webhook_endpoints/verify_signature', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'signature': signature,
                'payload': rawBody,
                'secret': env.STRIPE_WEBHOOK_SECRET
            }).toString(),
        });
        
        const verifyResult = await verifyResponse.json();
        
        if (!verifyResponse.ok || !verifyResult.valid) {
            console.error('Invalid webhook signature:', verifyResult);
            throw new Error('Invalid webhook signature');
        }
        
        // Parse the event
        const event = JSON.parse(rawBody);
        
        // Process the webhook event
        await processWebhookEvent(event, env);
        
        // Return a 200 response to acknowledge receipt of the event
        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Webhook error:', error.message);
        // Return a specific error code for better debugging
        return new Response(JSON.stringify({ 
            error: 'Webhook processing error',
            message: error.message,
            // Don't include stack trace in production
            stack: env.ENVIRONMENT === 'development' ? error.stack : undefined
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Process different Stripe webhook events
 * @param {Object} event - The Stripe event object
 * @param {Object} env - Environment variables
 */
async function processWebhookEvent(event, env) {
    // Only log essential info
    debugLog('Processing event:', event.type);
    
    // Extract customer data if available
    const customer = event.data.object.customer || null;
    
    switch (event.type) {
        case 'checkout.session.completed':
            await handleCheckoutCompleted(event.data.object, env);
            break;
            
        case 'payment_intent.succeeded':
            await handlePaymentSucceeded(event.data.object, env);
            break;
            
        case 'payment_intent.payment_failed':
            await handlePaymentFailed(event.data.object, env);
            break;
            
        case 'customer.subscription.created':
            await handleSubscriptionCreated(event.data.object, env);
            break;
            
        case 'customer.subscription.updated':
            await handleSubscriptionUpdated(event.data.object, env);
            break;
            
        case 'customer.subscription.deleted':
            await handleSubscriptionCancelled(event.data.object, env);
            break;
            
        case 'invoice.payment_succeeded':
            await handleInvoicePaymentSucceeded(event.data.object, env);
            break;
            
        case 'invoice.payment_failed':
            await handleInvoicePaymentFailed(event.data.object, env);
            break;
            
        // Consolidate customer events
        case 'customer.created':
        case 'customer.updated':
            debugLog(`Customer ${event.type.split('.')[1]}:`, event.data.object.id);
            break;
            
        default:
            debugLog('Unhandled event type:', event.type);
    }
}

/**
 * Handle checkout.session.completed event
 * @param {Object} session - The checkout session object
 * @param {Object} env - Environment variables
 */
async function handleCheckoutCompleted(session, env) {
    debugLog('Payment successful for session:', session.id);
    
    // Extract metadata
    const planName = getPlanNameFromSession(session);
    const customerEmail = session.customer_details?.email;
    const customerId = session.customer;
    
    // Different handling based on checkout mode
    if (session.mode === 'subscription') {
        // Subscription purchase
        const subscriptionId = session.subscription;
        
        debugLog(`New subscription ${subscriptionId} for plan: ${planName}`);
        
        // Send welcome email to new subscriber
        await sendWelcomeEmail(customerEmail, planName, 'subscription', env);
        
    } else if (session.mode === 'payment') {
        // One-time payment
        debugLog(`One-time payment completed for plan: ${planName}`);
        
        // Send confirmation email for one-time purchase
        await sendWelcomeEmail(customerEmail, planName, 'onetime', env);
    }
}

// Similar optimization for other handlers
async function handlePaymentSucceeded(paymentIntent, env) {
    debugLog('Payment intent succeeded:', paymentIntent.id);
}

async function handlePaymentFailed(paymentIntent, env) {
    debugLog('Payment intent failed:', paymentIntent.id);
    const customerEmail = paymentIntent.receipt_email;
    
    if (customerEmail) {
        await sendPaymentFailureEmail(customerEmail, env);
    }
}

async function handleSubscriptionCreated(subscription, env) {
    debugLog('New subscription created:', subscription.id);
}

async function handleSubscriptionUpdated(subscription, env) {
    debugLog('Subscription updated:', subscription.id);
    
    if (subscription.status === 'active' && subscription.cancel_at_period_end) {
        debugLog('Subscription set to cancel at period end');
    } else if (subscription.status === 'past_due') {
        debugLog('Subscription payment past due');
    }
}

async function handleSubscriptionCancelled(subscription, env) {
    debugLog('Subscription cancelled:', subscription.id);
}

async function handleInvoicePaymentSucceeded(invoice, env) {
    debugLog('Invoice payment succeeded:', invoice.id);
}

async function handleInvoicePaymentFailed(invoice, env) {
    debugLog('Invoice payment failed:', invoice.id);
}

/**
 * Extract plan name from session metadata or line items
 * @param {Object} session - The checkout session object
 * @returns {string} The plan name
 */
function getPlanNameFromSession(session) {
    // First try to get from metadata
    if (session.metadata && session.metadata.planName) {
        return session.metadata.planName;
    }
    
    // Otherwise try to parse from line items or product name
    if (session.line_items && session.line_items.data && session.line_items.data.length > 0) {
        const productName = session.line_items.data[0].description || '';
        // Extract plan name from "MissFit - {PlanName} Plan" format
        const planNameMatch = productName.match(/MissFit - (.*?) Plan/);
        return planNameMatch ? planNameMatch[1] : 'Unknown Plan';
    }
    
    return 'Unknown Plan';
}

/**
 * Send welcome email to new customer
 * @param {string} email - Customer email
 * @param {string} planName - The purchased plan name
 * @param {string} type - Either 'subscription' or 'onetime'
 * @param {Object} env - Environment variables
 */
async function sendWelcomeEmail(email, planName, type, env) {
    debugLog(`[EMAIL] Welcome email to ${email} for ${planName}`);
    
    // Email service implementation here
}

/**
 * Send payment failure email
 * @param {string} email - Customer email
 * @param {Object} env - Environment variables
 */
async function sendPaymentFailureEmail(email, env) {
    debugLog(`[EMAIL] Payment failure email to ${email}`);
    
    // Email service implementation here
}