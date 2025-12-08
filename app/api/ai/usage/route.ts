/**
 * AI Usage API Route
 * Returns usage statistics for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { UsageTracker } from '@/lib/ai';

function getUsageTracker() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const { createClient: createAdminClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey);

  return new UsageTracker({ supabase: supabaseAdmin });
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') as 'day' | 'week' | 'month' | 'all_time') || 'month';
    const action = searchParams.get('action') || 'stats';

    const usageTracker = getUsageTracker();

    switch (action) {
      case 'stats': {
        const stats = await usageTracker.getUserStats(user.id, period);
        return NextResponse.json({ stats });
      }

      case 'breakdown': {
        const breakdown = await usageTracker.getCostBreakdown(user.id, period);
        return NextResponse.json({ breakdown });
      }

      case 'daily': {
        const days = parseInt(searchParams.get('days') || '30', 10);
        const dailyUsage = await usageTracker.getDailyUsage(user.id, days);
        return NextResponse.json({ dailyUsage });
      }

      case 'logs': {
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const provider = searchParams.get('provider') as 'openai' | 'anthropic' | undefined;
        const model = searchParams.get('model') || undefined;

        const { logs, total } = await usageTracker.getUserLogs(user.id, {
          limit,
          offset,
          provider,
          model
        });

        return NextResponse.json({ logs, total, limit, offset });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
