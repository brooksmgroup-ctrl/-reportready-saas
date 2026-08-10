import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

export { stripe };

export async function createCheckoutSession(priceId) {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
  }
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/cancel`,
  });
  return session;
}

/**
 * Get recent active/trialing subscriptions (last N days).
 * Returns an array of expanded subscription objects with customer data.
 */
export async function getActiveSubscriptions(maxAgeDays = 30) {
  if (!stripe) {
    console.warn('Stripe not configured — returning empty subscription list');
    return [];
  }

  const subscriptions = [];

  for await (const sub of stripe.subscriptions.list({
    status: 'active',
    limit: 100,
    expand: ['data.customer'],
  })) {
    subscriptions.push(sub);
  }

  for await (const sub of stripe.subscriptions.list({
    status: 'trialing',
    limit: 100,
    expand: ['data.customer'],
  })) {
    subscriptions.push(sub);
  }

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return subscriptions.filter((sub) => {
    const created = sub.created * 1000;
    return created >= cutoff;
  });
}
