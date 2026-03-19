import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import stripe from '@/lib/stripe';

// Use service role for webhook processing
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const body = await request.text();
  const sig = headers().get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  // Handle the events
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const uid = session.subscription_data?.metadata?.supabase_uid || session.metadata?.supabase_uid;
        
        if (uid) {
          await supabaseAdmin
            .from('profiles')
            .update({
              plan: 'pro',
              stripe_subscription_id: session.subscription,
              stripe_customer_id: session.customer,
              subscription_status: 'active'
            })
            .eq('id', uid);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const uid = subscription.metadata?.supabase_uid;
        if (uid) {
          await supabaseAdmin
            .from('profiles')
            .update({ subscription_status: 'active', plan: 'pro' })
            .eq('id', uid);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const uid = subscription.metadata?.supabase_uid;
        if (uid) {
          await supabaseAdmin
            .from('profiles')
            .update({ subscription_status: 'cancelled', plan: 'free' })
            .eq('id', uid);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const uid = subscription.metadata?.supabase_uid;
        if (uid) {
          await supabaseAdmin
            .from('profiles')
            .update({ subscription_status: subscription.status })
            .eq('id', uid);
        }
        break;
      }

      default:
        // Not a failure — just an unhandled event type
        break;
    }
  } catch (err) {
    // Log internally but still return 200 so Stripe doesn't endlessly retry
    console.error(`[Stripe Webhook] Error processing event ${event.type}:`, err.message);
  }

  return NextResponse.json({ received: true });
}
