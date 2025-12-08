/**
 * Usage Tracker
 * Tracks API calls, tokens, and costs for AI operations
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  APICallLog,
  UsageStats,
  AIProviderType,
  TokenUsage,
  ProviderUsage,
  ModelUsage
} from '../types';

export interface UsageTrackerConfig {
  supabase: SupabaseClient;
  tableName?: string;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export class UsageTracker {
  private supabase: SupabaseClient;
  private tableName: string;

  constructor(config: UsageTrackerConfig) {
    this.supabase = config.supabase;
    this.tableName = config.tableName || 'ai_usage_logs';
  }

  /**
   * Log an API call
   */
  async logCall(log: Omit<APICallLog, 'id' | 'createdAt'>): Promise<string> {
    const id = generateId();
    const { error } = await this.supabase.from(this.tableName).insert({
      id,
      user_id: log.userId,
      provider: log.provider,
      model: log.model,
      endpoint: log.endpoint,
      prompt_tokens: log.promptTokens,
      completion_tokens: log.completionTokens,
      total_tokens: log.totalTokens,
      cost: log.cost,
      latency_ms: log.latencyMs,
      success: log.success,
      error_message: log.errorMessage,
      metadata: log.metadata,
      created_at: new Date().toISOString()
    });

    if (error) {
      throw new Error(`Failed to log API call: ${error.message}`);
    }

    return id;
  }

  /**
   * Get usage statistics for a user
   */
  async getUserStats(
    userId: string,
    period: 'day' | 'week' | 'month' | 'all_time' = 'month'
  ): Promise<UsageStats> {
    const startDate = this.getStartDate(period);

    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get usage stats: ${error.message}`);
    }

    return this.aggregateStats(userId, period, data || []);
  }

  /**
   * Get usage statistics for all users (admin)
   */
  async getGlobalStats(
    period: 'day' | 'week' | 'month' | 'all_time' = 'month'
  ): Promise<UsageStats> {
    const startDate = this.getStartDate(period);

    let query = this.supabase.from(this.tableName).select('*');

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get global stats: ${error.message}`);
    }

    return this.aggregateStats('global', period, data || []);
  }

  /**
   * Get top users by usage
   */
  async getTopUsers(
    limit: number = 10,
    period: 'day' | 'week' | 'month' | 'all_time' = 'month',
    sortBy: 'cost' | 'tokens' | 'calls' = 'cost'
  ): Promise<Array<{ userId: string; stats: UsageStats }>> {
    const startDate = this.getStartDate(period);

    let query = this.supabase.from(this.tableName).select('*');

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get top users: ${error.message}`);
    }

    // Group by user
    const userStats = new Map<string, UsageStats>();

    for (const log of data || []) {
      if (!userStats.has(log.user_id)) {
        userStats.set(
          log.user_id,
          this.aggregateStats(log.user_id, period, [])
        );
      }
      this.addToStats(userStats.get(log.user_id)!, log);
    }

    // Sort and return top users
    const sorted = Array.from(userStats.entries())
      .sort((a, b) => {
        switch (sortBy) {
          case 'cost':
            return b[1].totalCost - a[1].totalCost;
          case 'tokens':
            return b[1].totalTokens - a[1].totalTokens;
          case 'calls':
            return b[1].totalCalls - a[1].totalCalls;
        }
      })
      .slice(0, limit);

    return sorted.map(([userId, stats]) => ({ userId, stats }));
  }

  /**
   * Get detailed logs for a user
   */
  async getUserLogs(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      provider?: AIProviderType;
      model?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ logs: APICallLog[]; total: number }> {
    const { limit = 50, offset = 0, provider, model, startDate, endDate } = options;

    let query = this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (provider) {
      query = query.eq('provider', provider);
    }

    if (model) {
      query = query.eq('model', model);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get user logs: ${error.message}`);
    }

    return {
      logs: (data || []).map(this.mapLogFromDb),
      total: count || 0
    };
  }

  /**
   * Get cost breakdown by model
   */
  async getCostBreakdown(
    userId: string,
    period: 'day' | 'week' | 'month' | 'all_time' = 'month'
  ): Promise<Array<{ model: string; provider: AIProviderType; cost: number; tokens: number; calls: number }>> {
    const startDate = this.getStartDate(period);

    let query = this.supabase
      .from(this.tableName)
      .select('model, provider, cost, total_tokens')
      .eq('user_id', userId);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get cost breakdown: ${error.message}`);
    }

    const breakdown = new Map<string, { model: string; provider: AIProviderType; cost: number; tokens: number; calls: number }>();

    for (const log of data || []) {
      const key = `${log.provider}:${log.model}`;
      if (!breakdown.has(key)) {
        breakdown.set(key, {
          model: log.model,
          provider: log.provider,
          cost: 0,
          tokens: 0,
          calls: 0
        });
      }
      const entry = breakdown.get(key)!;
      entry.cost += log.cost || 0;
      entry.tokens += log.total_tokens || 0;
      entry.calls += 1;
    }

    return Array.from(breakdown.values()).sort((a, b) => b.cost - a.cost);
  }

  /**
   * Get daily usage for charting
   */
  async getDailyUsage(
    userId: string,
    days: number = 30
  ): Promise<Array<{ date: string; cost: number; tokens: number; calls: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('created_at, cost, total_tokens')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get daily usage: ${error.message}`);
    }

    // Group by day
    const dailyMap = new Map<string, { cost: number; tokens: number; calls: number }>();

    // Initialize all days
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      dailyMap.set(dateStr, { cost: 0, tokens: 0, calls: 0 });
    }

    // Fill in data
    for (const log of data || []) {
      const dateStr = new Date(log.created_at).toISOString().split('T')[0];
      const entry = dailyMap.get(dateStr);
      if (entry) {
        entry.cost += log.cost || 0;
        entry.tokens += log.total_tokens || 0;
        entry.calls += 1;
      }
    }

    return Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Delete old logs (cleanup)
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { error, count } = await this.supabase
      .from(this.tableName)
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw new Error(`Failed to cleanup logs: ${error.message}`);
    }

    return count || 0;
  }

  // Helper methods

  private getStartDate(period: 'day' | 'week' | 'month' | 'all_time'): Date | null {
    const now = new Date();

    switch (period) {
      case 'day':
        now.setHours(0, 0, 0, 0);
        return now;
      case 'week':
        now.setDate(now.getDate() - 7);
        now.setHours(0, 0, 0, 0);
        return now;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        now.setHours(0, 0, 0, 0);
        return now;
      case 'all_time':
        return null;
    }
  }

  private aggregateStats(
    userId: string,
    period: 'day' | 'week' | 'month' | 'all_time',
    logs: Array<Record<string, unknown>>
  ): UsageStats {
    const stats: UsageStats = {
      userId,
      period,
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      byProvider: {} as Record<AIProviderType, ProviderUsage>,
      byModel: {}
    };

    for (const log of logs) {
      this.addToStats(stats, log);
    }

    return stats;
  }

  private addToStats(stats: UsageStats, log: Record<string, unknown>): void {
    const provider = log.provider as AIProviderType;
    const model = log.model as string;
    const tokens = (log.total_tokens as number) || 0;
    const cost = (log.cost as number) || 0;
    const latency = (log.latency_ms as number) || 0;
    const promptTokens = (log.prompt_tokens as number) || 0;
    const completionTokens = (log.completion_tokens as number) || 0;

    stats.totalCalls += 1;
    stats.totalTokens += tokens;
    stats.totalCost += cost;

    // By provider
    if (!stats.byProvider[provider]) {
      stats.byProvider[provider] = { calls: 0, tokens: 0, cost: 0 };
    }
    stats.byProvider[provider].calls += 1;
    stats.byProvider[provider].tokens += tokens;
    stats.byProvider[provider].cost += cost;

    // By model
    if (!stats.byModel[model]) {
      stats.byModel[model] = {
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        avgLatencyMs: 0
      };
    }
    const modelStats = stats.byModel[model];
    const prevCalls = modelStats.calls;
    modelStats.calls += 1;
    modelStats.promptTokens += promptTokens;
    modelStats.completionTokens += completionTokens;
    modelStats.totalTokens += tokens;
    modelStats.cost += cost;
    modelStats.avgLatencyMs =
      (modelStats.avgLatencyMs * prevCalls + latency) / modelStats.calls;
  }

  private mapLogFromDb(row: Record<string, unknown>): APICallLog {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      provider: row.provider as AIProviderType,
      model: row.model as string,
      endpoint: row.endpoint as APICallLog['endpoint'],
      promptTokens: row.prompt_tokens as number,
      completionTokens: row.completion_tokens as number,
      totalTokens: row.total_tokens as number,
      cost: row.cost as number,
      latencyMs: row.latency_ms as number,
      success: row.success as boolean,
      errorMessage: row.error_message as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string)
    };
  }
}

export default UsageTracker;
