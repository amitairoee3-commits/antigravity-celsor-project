import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@supabase/supabase-js';

// We need the service role key to bypass RLS in webhooks
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'mock-key'
);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET ?? 'mock_secret';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') as string;

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    console.error(`[Stripe Webhook] Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const userId = session.client_reference_id; // Passed during checkout creation

        if (!userId) throw new Error('No user ID found in session');

        await supabaseAdmin.from('profiles').update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: 'active',
          plan_type: 'institutional'
        }).eq('id', userId);
        break;
      }
      
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        
        await supabaseAdmin.from('profiles').update({
          subscription_status: subscription.status,
          plan_type: subscription.status === 'active' ? 'institutional' : 'free'
        }).eq('stripe_subscription_id', subscription.id);
        break;
      }
    }
    
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`[Stripe Webhook Processing Error]:`, err);
    return NextResponse.json({ error: 'Internal server error processing webhook' }, { status: 500 });
  }
}
