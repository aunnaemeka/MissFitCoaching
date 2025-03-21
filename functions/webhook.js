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
    console.log('Processing webhook event:', event.type, event.id);
    
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
            
        case 'customer.created':
        case 'customer.updated':
            // Log customer events for future customer management features
            console.log(`Customer ${event.type.split('.')[1]}:`, event.data.object.id);
            break;
            
        default:
            // Log unhandled event types for monitoring
            console.log('Unhandled event type:', event.type);
    }
}

/**
 * Handle checkout.session.completed event
 * @param {Object} session - The checkout session object
 * @param {Object} env - Environment variables
 */
async function handleCheckoutCompleted(session, env) {
    console.log('Payment successful for session:', session.id);
    
    // Extract metadata
    const planName = getPlanNameFromSession(session);
    const customerEmail = session.customer_details?.email;
    const customerId = session.customer;
    
    // Different handling based on checkout mode
    if (session.mode === 'subscription') {
        // Subscription purchase
        const subscriptionId = session.subscription;
        
        console.log(`New subscription ${subscriptionId} activated for plan: ${planName}`);
        console.log(`Customer: ${customerId} (${customerEmail})`);
        
        // Store subscription data
        // await storeSubscriptionData(session, env);
        
        // Send welcome email to new subscriber
        await sendWelcomeEmail(customerEmail, planName, 'subscription', env);
        
    } else if (session.mode === 'payment') {
        // One-time payment
        const paymentIntentId = session.payment_intent;
        
        console.log(`One-time payment ${paymentIntentId} completed for plan: ${planName}`);
        console.log(`Customer: ${customerId} (${customerEmail})`);
        
        // Store payment data
        // await storePaymentData(session, env);
        
        // Send confirmation email for one-time purchase
        await sendWelcomeEmail(customerEmail, planName, 'onetime', env);
    }
}

/**
 * Handle payment_intent.succeeded event
 * @param {Object} paymentIntent - The payment intent object
 * @param {Object} env - Environment variables
 */
async function handlePaymentSucceeded(paymentIntent, env) {
    console.log('Payment intent succeeded:', paymentIntent.id);
    
    // This is sometimes redundant with checkout.session.completed
    // but can be useful for payment intents created outside of Checkout
}

/**
 * Handle payment_intent.payment_failed event
 * @param {Object} paymentIntent - The payment intent object
 * @param {Object} env - Environment variables
 */
async function handlePaymentFailed(paymentIntent, env) {
    console.log('Payment intent failed:', paymentIntent.id);
    const customerEmail = paymentIntent.receipt_email;
    
    if (customerEmail) {
        // Send email notification about failed payment
        await sendPaymentFailureEmail(customerEmail, env);
    }
}

/**
 * Handle customer.subscription.created event
 * @param {Object} subscription - The subscription object
 * @param {Object} env - Environment variables
 */
async function handleSubscriptionCreated(subscription, env) {
    console.log('New subscription created:', subscription.id);
    console.log('Status:', subscription.status);
    console.log('Customer:', subscription.customer);
    
    // Set up any additional resources for new subscription
    // For example, create coaching appointment slots
    // await setupCoachingResources(subscription, env);
}

/**
 * Handle customer.subscription.updated event
 * @param {Object} subscription - The subscription object
 * @param {Object} env - Environment variables
 */
async function handleSubscriptionUpdated(subscription, env) {
    console.log('Subscription updated:', subscription.id);
    console.log('New status:', subscription.status);
    
    // Handle subscription status changes
    if (subscription.status === 'active' && subscription.cancel_at_period_end) {
        // Customer has set their subscription to cancel at period end
        console.log('Subscription set to cancel at period end:', subscription.current_period_end);
        
        // Send retention email or offer
        // await sendRetentionOffer(subscription.customer, env);
    } else if (subscription.status === 'past_due') {
        // Handle past due payment
        console.log('Subscription payment past due');
        
        // Send payment reminder email
        // await sendPaymentReminderEmail(subscription.customer, env);
    }
}

/**
 * Handle customer.subscription.deleted event
 * @param {Object} subscription - The subscription object
 * @param {Object} env - Environment variables
 */
async function handleSubscriptionCancelled(subscription, env) {
    console.log('Subscription cancelled:', subscription.id);
    
    // Update customer status
    // await updateCustomerStatus(subscription.customer, 'cancelled', env);
    
    // Send cancellation survey or feedback request
    // await sendCancellationSurvey(subscription.customer, env);
}

/**
 * Handle invoice.payment_succeeded event
 * @param {Object} invoice - The invoice object
 * @param {Object} env - Environment variables
 */
async function handleInvoicePaymentSucceeded(invoice, env) {
    console.log('Invoice payment succeeded:', invoice.id);
    
    if (invoice.subscription) {
        // This is a recurring payment for a subscription
        console.log('Recurring payment for subscription:', invoice.subscription);
        
        // Check if this is a renewal (not the first payment)
        if (invoice.billing_reason === 'subscription_cycle') {
            // Send thank you email for continued subscription
            // await sendRenewalThankYouEmail(invoice.customer, env);
        }
    }
}

/**
 * Handle invoice.payment_failed event
 * @param {Object} invoice - The invoice object
 * @param {Object} env - Environment variables
 */
async function handleInvoicePaymentFailed(invoice, env) {
    console.log('Invoice payment failed:', invoice.id);
    
    if (invoice.subscription) {
        console.log('Failed payment for subscription:', invoice.subscription);
        
        // Send payment failure notification
        // await sendSubscriptionPaymentFailureEmail(invoice.customer, env);
    }
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
    // This is a placeholder for email sending logic
    // In production, you would integrate with an email service
    console.log(`[EMAIL SERVICE] Sending welcome email to ${email} for ${planName} (${type})`);
    
    // Example of email service integration
    // if (env.EMAIL_API_KEY) {
    //     try {
    //         const emailResponse = await fetch('https://api.youremailservice.com/send', {
    //             method: 'POST',
    //             headers: {
    //                 'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
    //                 'Content-Type': 'application/json'
    //             },
    //             body: JSON.stringify({
    //                 to: email,
    //                 subject: `Welcome to MissFit ${planName} Plan!`,
    //                 template: type === 'subscription' ? 'welcome-subscription' : 'welcome-onetime',
    //                 templateData: {
    //                     planName: planName,
    //                     nextSteps: 'Your coach will contact you within 24 hours.'
    //                 }
    //             })
    //         });
    //         
    //         const result = await emailResponse.json();
    //         console.log('Email sent:', result);
    //     } catch (error) {
    //         console.error('Failed to send welcome email:', error);
    //     }
    // }
}

/**
 * Send payment failure email
 * @param {string} email - Customer email
 * @param {Object} env - Environment variables
 */
async function sendPaymentFailureEmail(email, env) {
    // This is a placeholder for email sending logic
    console.log(`[EMAIL SERVICE] Sending payment failure email to ${email}`);
    
    // Similar implementation as sendWelcomeEmail but with failure template
}