/**
 * AI Quota API Route
 * Returns quota information for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { QuotaManager, PLAN_LIMITS } from '@/lib/ai';

function getQuotaManager() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const { createClient: createAdminClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey);

  return new QuotaManager({ supabase: supabaseAdmin });
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

    const quotaManager = getQuotaManager();

    // Get quota and current usage
    const quota = await quotaManager.getQuota(user.id);
    const usage = await quotaManager.getCurrentUsage(user.id, quota);

    // Calculate remaining and percentages
    const remaining = {
      tokens: Math.max(0, quota.limits.maxTokensPerMonth - usage.tokensThisMonth),
      callsToday: Math.max(0, quota.limits.maxCallsPerDay - usage.callsToday),
      callsPerMinute: Math.max(0, quota.limits.maxCallsPerMinute - usage.callsThisMinute),
      cost: Math.max(0, quota.limits.maxCostPerMonth - usage.costThisMonth)
    };

    const percentUsed = {
      tokens: (usage.tokensThisMonth / quota.limits.maxTokensPerMonth) * 100,
      cost: (usage.costThisMonth / quota.limits.maxCostPerMonth) * 100,
      callsToday: (usage.callsToday / quota.limits.maxCallsPerDay) * 100
    };

    return NextResponse.json({
      plan: quota.planId,
      limits: quota.limits,
      usage,
      remaining,
      percentUsed,
      resetAt: quota.resetAt,
      availablePlans: Object.keys(PLAN_LIMITS)
    });
  } catch (error) {
    console.error('Quota API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Endpoint to check if a specific model/provider is allowed
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { model, provider, estimatedTokens = 1000 } = body;

    if (!model || !provider) {
      return NextResponse.json(
        { error: 'Model and provider are required' },
        { status: 400 }
      );
    }

    const quotaManager = getQuotaManager();

    // Estimate cost (rough estimate based on average pricing)
    const estimatedCost = (estimatedTokens / 1_000_000) * 5; // ~$5 per 1M tokens average

    const result = await quotaManager.checkQuota(
      user.id,
      model,
      provider,
      estimatedTokens,
      estimatedCost
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Quota check API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
