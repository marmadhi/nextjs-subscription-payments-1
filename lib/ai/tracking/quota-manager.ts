/**
 * Quota Manager
 * Manages user quotas and rate limiting for AI operations
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UserQuota,
  QuotaLimits,
  QuotaUsage,
  QuotaCheckResult,
  AIProviderType
} from '../types';

export interface QuotaManagerConfig {
  supabase: SupabaseClient;
  quotaTableName?: string;
  usageTableName?: string;
  defaultLimits?: Partial<QuotaLimits>;
}

// Default limits for users without a subscription (free tier)
// These are only used as fallback when creating a new quota.
// Actual plan limits are read from Stripe product metadata and stored in the database.
export const DEFAULT_FREE_LIMITS: QuotaLimits = {
  maxTokensPerMonth: 50000,
  maxCallsPerMinute: 5,
  maxCallsPerDay: 100,
  maxCostPerMonth: 1,
  allowedModels: ['gpt-4o-mini', 'claude-3-haiku-20240307'],
  allowedProviders: ['openai', 'anthropic']
};

// Legacy PLAN_LIMITS export for backwards compatibility
// NOTE: For paid plans, limits are now read from Stripe product metadata
// and stored in the user_quotas table when subscription is created/updated.
export const PLAN_LIMITS: Record<string, QuotaLimits> = {
  free: DEFAULT_FREE_LIMITS
};

// In-memory rate limiting cache
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

export class QuotaManager {
  private supabase: SupabaseClient;
  private quotaTableName: string;
  private usageTableName: string;
  private defaultLimits: QuotaLimits;

  constructor(config: QuotaManagerConfig) {
    this.supabase = config.supabase;
    this.quotaTableName = config.quotaTableName || 'user_quotas';
    this.usageTableName = config.usageTableName || 'ai_usage_logs';
    this.defaultLimits = {
      ...DEFAULT_FREE_LIMITS,
      ...config.defaultLimits
    };
  }

  /**
   * Get or create quota for a user
   */
  async getQuota(userId: string): Promise<UserQuota> {
    const { data, error } = await this.supabase
      .from(this.quotaTableName)
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get quota: ${error.message}`);
    }

    if (data) {
      return this.mapQuotaFromDb(data);
    }

    // Create default quota
    return this.createQuota(userId, 'free');
  }

  /**
   * Create quota for a user
   * Note: For paid plans, limits should be provided via customLimits
   * (typically from Stripe product metadata)
   */
  async createQuota(
    userId: string,
    planId: string,
    customLimits?: Partial<QuotaLimits>
  ): Promise<UserQuota> {
    const limits = {
      ...this.defaultLimits,
      ...customLimits
    };

    const resetAt = this.getNextMonthReset();

    const { data, error } = await this.supabase
      .from(this.quotaTableName)
      .upsert({
        user_id: userId,
        plan_id: planId,
        limits,
        usage: {
          tokensThisMonth: 0,
          callsToday: 0,
          callsThisMinute: 0,
          costThisMonth: 0
        },
        reset_at: resetAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create quota: ${error.message}`);
    }

    return this.mapQuotaFromDb(data);
  }

  /**
   * Update user's plan
   * Note: For paid plans, limits should be provided via customLimits
   * (typically from Stripe product metadata)
   */
  async updatePlan(
    userId: string,
    planId: string,
    customLimits?: Partial<QuotaLimits>
  ): Promise<UserQuota> {
    const limits = {
      ...this.defaultLimits,
      ...customLimits
    };

    const { data, error } = await this.supabase
      .from(this.quotaTableName)
      .update({
        plan_id: planId,
        limits
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update plan: ${error.message}`);
    }

    return this.mapQuotaFromDb(data);
  }

  /**
   * Check if a request is allowed
   */
  async checkQuota(
    userId: string,
    model: string,
    provider: AIProviderType,
    estimatedTokens: number = 0,
    estimatedCost: number = 0
  ): Promise<QuotaCheckResult> {
    const quota = await this.getQuota(userId);
    const usage = await this.getCurrentUsage(userId, quota);

    // Check rate limit (in-memory for speed)
    const rateLimitResult = this.checkRateLimit(userId, quota.limits.maxCallsPerMinute);
    if (!rateLimitResult.allowed) {
      return rateLimitResult;
    }

    // Check daily calls
    if (usage.callsToday >= quota.limits.maxCallsPerDay) {
      return {
        allowed: false,
        reason: 'Daily call limit reached',
        remaining: {
          tokens: quota.limits.maxTokensPerMonth - usage.tokensThisMonth,
          calls: 0,
          cost: quota.limits.maxCostPerMonth - usage.costThisMonth
        }
      };
    }

    // Check monthly tokens
    if (usage.tokensThisMonth + estimatedTokens > quota.limits.maxTokensPerMonth) {
      return {
        allowed: false,
        reason: 'Monthly token limit reached',
        remaining: {
          tokens: quota.limits.maxTokensPerMonth - usage.tokensThisMonth,
          calls: quota.limits.maxCallsPerDay - usage.callsToday,
          cost: quota.limits.maxCostPerMonth - usage.costThisMonth
        }
      };
    }

    // Check monthly cost
    if (usage.costThisMonth + estimatedCost > quota.limits.maxCostPerMonth) {
      return {
        allowed: false,
        reason: 'Monthly cost limit reached',
        remaining: {
          tokens: quota.limits.maxTokensPerMonth - usage.tokensThisMonth,
          calls: quota.limits.maxCallsPerDay - usage.callsToday,
          cost: quota.limits.maxCostPerMonth - usage.costThisMonth
        }
      };
    }

    // Check allowed models (empty array means all allowed)
    if (quota.limits.allowedModels.length > 0 && !quota.limits.allowedModels.includes(model)) {
      return {
        allowed: false,
        reason: `Model ${model} is not available in your plan`,
        remaining: {
          tokens: quota.limits.maxTokensPerMonth - usage.tokensThisMonth,
          calls: quota.limits.maxCallsPerDay - usage.callsToday,
          cost: quota.limits.maxCostPerMonth - usage.costThisMonth
        }
      };
    }

    // Check allowed providers
    if (!quota.limits.allowedProviders.includes(provider)) {
      return {
        allowed: false,
        reason: `Provider ${provider} is not available in your plan`,
        remaining: {
          tokens: quota.limits.maxTokensPerMonth - usage.tokensThisMonth,
          calls: quota.limits.maxCallsPerDay - usage.callsToday,
          cost: quota.limits.maxCostPerMonth - usage.costThisMonth
        }
      };
    }

    return {
      allowed: true,
      remaining: {
        tokens: quota.limits.maxTokensPerMonth - usage.tokensThisMonth - estimatedTokens,
        calls: quota.limits.maxCallsPerDay - usage.callsToday - 1,
        cost: quota.limits.maxCostPerMonth - usage.costThisMonth - estimatedCost
      }
    };
  }

  /**
   * Record usage after a successful call
   */
  async recordUsage(
    userId: string,
    tokens: number,
    cost: number
  ): Promise<void> {
    // Increment rate limit counter
    this.incrementRateLimit(userId);

    // Update database usage (the actual logging is done by UsageTracker)
    // This method is for updating aggregate counters if needed
    const quota = await this.getQuota(userId);

    // Check if we need to reset monthly usage
    if (new Date() >= new Date(quota.resetAt)) {
      await this.resetMonthlyUsage(userId);
    }
  }

  /**
   * Get current usage for a user
   */
  async getCurrentUsage(userId: string, quota?: UserQuota): Promise<QuotaUsage> {
    const userQuota = quota || (await this.getQuota(userId));

    // Check if monthly reset is needed
    if (new Date() >= new Date(userQuota.resetAt)) {
      await this.resetMonthlyUsage(userId);
      return {
        tokensThisMonth: 0,
        callsToday: 0,
        callsThisMinute: this.getRateLimitCount(userId),
        costThisMonth: 0
      };
    }

    // Get month start
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Get today start
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Query usage from logs
    const { data: monthData, error: monthError } = await this.supabase
      .from(this.usageTableName)
      .select('total_tokens, cost')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString());

    if (monthError) {
      throw new Error(`Failed to get monthly usage: ${monthError.message}`);
    }

    const { data: todayData, error: todayError } = await this.supabase
      .from(this.usageTableName)
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString());

    if (todayError) {
      throw new Error(`Failed to get daily usage: ${todayError.message}`);
    }

    const tokensThisMonth = (monthData || []).reduce(
      (sum, row) => sum + (row.total_tokens || 0),
      0
    );
    const costThisMonth = (monthData || []).reduce(
      (sum, row) => sum + (row.cost || 0),
      0
    );
    const callsToday = (todayData || []).length;

    return {
      tokensThisMonth,
      callsToday,
      callsThisMinute: this.getRateLimitCount(userId),
      costThisMonth
    };
  }

  /**
   * Reset monthly usage for a user
   */
  private async resetMonthlyUsage(userId: string): Promise<void> {
    const nextReset = this.getNextMonthReset();

    await this.supabase
      .from(this.quotaTableName)
      .update({
        reset_at: nextReset.toISOString()
      })
      .eq('user_id', userId);
  }

  /**
   * Get all users approaching their limits
   */
  async getUsersNearLimit(
    threshold: number = 0.8
  ): Promise<Array<{ userId: string; quota: UserQuota; usage: QuotaUsage; percentUsed: number }>> {
    const { data, error } = await this.supabase
      .from(this.quotaTableName)
      .select('*');

    if (error) {
      throw new Error(`Failed to get quotas: ${error.message}`);
    }

    const results = [];

    for (const row of data || []) {
      const quota = this.mapQuotaFromDb(row);
      const usage = await this.getCurrentUsage(quota.userId, quota);

      const tokenPercent = usage.tokensThisMonth / quota.limits.maxTokensPerMonth;
      const costPercent = usage.costThisMonth / quota.limits.maxCostPerMonth;
      const percentUsed = Math.max(tokenPercent, costPercent);

      if (percentUsed >= threshold) {
        results.push({
          userId: quota.userId,
          quota,
          usage,
          percentUsed
        });
      }
    }

    return results.sort((a, b) => b.percentUsed - a.percentUsed);
  }

  // Rate limiting helpers (in-memory for speed)

  private checkRateLimit(userId: string, maxPerMinute: number): QuotaCheckResult {
    const key = `rate:${userId}`;
    const now = Date.now();
    const entry = rateLimitCache.get(key);

    if (!entry || entry.resetAt <= now) {
      return { allowed: true };
    }

    if (entry.count >= maxPerMinute) {
      const waitSeconds = Math.ceil((entry.resetAt - now) / 1000);
      return {
        allowed: false,
        reason: `Rate limit exceeded. Try again in ${waitSeconds} seconds.`
      };
    }

    return { allowed: true };
  }

  private incrementRateLimit(userId: string): void {
    const key = `rate:${userId}`;
    const now = Date.now();
    const entry = rateLimitCache.get(key);

    if (!entry || entry.resetAt <= now) {
      rateLimitCache.set(key, {
        count: 1,
        resetAt: now + 60000 // 1 minute window
      });
    } else {
      entry.count += 1;
    }
  }

  private getRateLimitCount(userId: string): number {
    const key = `rate:${userId}`;
    const now = Date.now();
    const entry = rateLimitCache.get(key);

    if (!entry || entry.resetAt <= now) {
      return 0;
    }

    return entry.count;
  }

  // Helper methods

  private getNextMonthReset(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private mapQuotaFromDb(row: Record<string, unknown>): UserQuota {
    return {
      userId: row.user_id as string,
      planId: row.plan_id as string,
      limits: row.limits as QuotaLimits,
      usage: row.usage as QuotaUsage,
      resetAt: new Date(row.reset_at as string)
    };
  }
}

export default QuotaManager;
