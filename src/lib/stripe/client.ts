import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV === 'production') {
  console.warn('STRIPE_SECRET_KEY is missing. Please set it in your .env.local file.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'mock_key_for_build', {
  apiVersion: '2023-10-16',
  appInfo: {
    name: 'Celsor Nexus',
    version: '1.0.0',
  },
});
