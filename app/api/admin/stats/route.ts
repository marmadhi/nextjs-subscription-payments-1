/**
 * Admin Stats API Route
 * Returns global usage statistics for admins
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { UsageTracker } from '@/lib/ai';

// List of admin email addresses
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',') || [];

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

    // Check if user is admin
    if (!ADMIN_EMAILS.includes(user.email || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') as 'day' | 'week' | 'month' | 'all_time') || 'month';

    const usageTracker = getUsageTracker();

    // Get global stats
    const stats = await usageTracker.getGlobalStats(period);

    // Get top users
    const topUsers = await usageTracker.getTopUsers(10, period, 'cost');

    // Get daily usage for the last 30 days
    // Note: This requires a global daily usage method - simplified here
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;

    return NextResponse.json({
      stats,
      topUsers,
      dailyUsage: [] // Would need to implement global daily aggregation
    });
  } catch (error) {
    console.error('Admin stats API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
