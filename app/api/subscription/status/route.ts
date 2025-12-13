import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { hasActiveSubscription: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check for active subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .maybeSingle();

    if (subError) {
      console.error('Subscription check error:', subError);
      return NextResponse.json(
        { hasActiveSubscription: false, error: 'Database error' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      hasActiveSubscription: !!subscription,
      subscriptionId: subscription?.id || null,
      status: subscription?.status || null
    });
  } catch (error) {
    console.error('Subscription status check failed:', error);
    return NextResponse.json(
      { hasActiveSubscription: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}
