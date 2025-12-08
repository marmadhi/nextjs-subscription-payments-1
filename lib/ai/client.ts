/**
 * AI Client
 * Unified client for AI operations with usage tracking and quota management
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AIProviderType,
  AIProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamChunk,
  QuotaCheckResult
} from './types';
import { createProvider, BaseAIProvider } from './providers';
import { UsageTracker } from './tracking/usage-tracker';
import { QuotaManager } from './tracking/quota-manager';

export interface AIClientConfig {
  supabase: SupabaseClient;
  providers: Partial<Record<AIProviderType, AIProviderConfig>>;
  defaultProvider?: AIProviderType;
  defaultModel?: string;
  enableTracking?: boolean;
  enableQuotas?: boolean;
}

export class AIClient {
  private config: AIClientConfig;
  private providers: Map<AIProviderType, BaseAIProvider>;
  private usageTracker?: UsageTracker;
  private quotaManager?: QuotaManager;
  private defaultProvider: AIProviderType;
  private defaultModel: string;

  constructor(config: AIClientConfig) {
    this.config = config;
    this.providers = new Map();
    this.defaultProvider = config.defaultProvider || 'openai';
    this.defaultModel = config.defaultModel || 'gpt-4o-mini';

    // Initialize providers
    for (const [type, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig) {
        const provider = createProvider(type as AIProviderType, providerConfig);
        this.providers.set(type as AIProviderType, provider);
      }
    }

    // Initialize tracking
    if (config.enableTracking !== false) {
      this.usageTracker = new UsageTracker({ supabase: config.supabase });
    }

    // Initialize quota management
    if (config.enableQuotas !== false) {
      this.quotaManager = new QuotaManager({ supabase: config.supabase });
    }
  }

  /**
   * Get a provider instance
   */
  getProvider(type?: AIProviderType): BaseAIProvider {
    const providerType = type || this.defaultProvider;
    const provider = this.providers.get(providerType);

    if (!provider) {
      throw new Error(`Provider ${providerType} not configured`);
    }

    return provider;
  }

  /**
   * Check if user has quota for a request
   */
  async checkQuota(
    userId: string,
    model?: string,
    provider?: AIProviderType,
    estimatedTokens?: number
  ): Promise<QuotaCheckResult> {
    if (!this.quotaManager) {
      return { allowed: true };
    }

    const providerType = provider || this.defaultProvider;
    const modelId = model || this.defaultModel;
    const providerInstance = this.getProvider(providerType);
    const modelInfo = providerInstance.getModelInfo(modelId);

    // Estimate cost
    const estimatedCost = modelInfo
      ? ((estimatedTokens || 1000) / 1_000_000) * modelInfo.inputPricePerMillion
      : 0;

    return this.quotaManager.checkQuota(
      userId,
      modelId,
      providerType,
      estimatedTokens || 1000,
      estimatedCost
    );
  }

  /**
   * Create a chat completion with tracking
   */
  async chat(
    request: ChatCompletionRequest & { userId?: string; provider?: AIProviderType }
  ): Promise<ChatCompletionResponse> {
    const { userId, provider: providerType, ...chatRequest } = request;
    const effectiveProvider = providerType || this.defaultProvider;
    const model = chatRequest.model || this.defaultModel;

    // Check quota if user is provided
    if (userId && this.quotaManager) {
      const estimatedTokens = this.estimateTokens(chatRequest);
      const quotaCheck = await this.checkQuota(userId, model, effectiveProvider, estimatedTokens);

      if (!quotaCheck.allowed) {
        throw new Error(`Quota exceeded: ${quotaCheck.reason}`);
      }
    }

    const provider = this.getProvider(effectiveProvider);
    const startTime = performance.now();

    try {
      const response = await provider.chat({
        ...chatRequest,
        model
      });

      const latencyMs = performance.now() - startTime;

      // Log usage if tracking is enabled
      if (userId && this.usageTracker) {
        const cost = provider.calculateCost(model, response.usage);

        await this.usageTracker.logCall({
          userId,
          provider: effectiveProvider,
          model,
          endpoint: 'chat',
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
          cost,
          latencyMs: Math.round(latencyMs),
          success: true
        });

        // Record quota usage
        if (this.quotaManager) {
          await this.quotaManager.recordUsage(
            userId,
            response.usage.totalTokens,
            cost
          );
        }
      }

      return response;
    } catch (error) {
      const latencyMs = performance.now() - startTime;

      // Log failed call
      if (userId && this.usageTracker) {
        await this.usageTracker.logCall({
          userId,
          provider: effectiveProvider,
          model,
          endpoint: 'chat',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          latencyMs: Math.round(latencyMs),
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      throw error;
    }
  }

  /**
   * Create a streaming chat completion with tracking
   */
  async *chatStream(
    request: ChatCompletionRequest & { userId?: string; provider?: AIProviderType }
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const { userId, provider: providerType, ...chatRequest } = request;
    const effectiveProvider = providerType || this.defaultProvider;
    const model = chatRequest.model || this.defaultModel;

    // Check quota if user is provided
    if (userId && this.quotaManager) {
      const estimatedTokens = this.estimateTokens(chatRequest);
      const quotaCheck = await this.checkQuota(userId, model, effectiveProvider, estimatedTokens);

      if (!quotaCheck.allowed) {
        throw new Error(`Quota exceeded: ${quotaCheck.reason}`);
      }
    }

    const provider = this.getProvider(effectiveProvider);
    const startTime = performance.now();

    let totalContent = '';
    let error: Error | null = null;

    try {
      const stream = provider.chatStream({
        ...chatRequest,
        model
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          totalContent += content;
        }
        yield chunk;
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error('Unknown error');
      throw error;
    } finally {
      const latencyMs = performance.now() - startTime;

      // Estimate tokens for streaming (rough estimate)
      const promptTokens = this.estimateTokens(chatRequest);
      const completionTokens = Math.ceil(totalContent.length / 4);
      const totalTokens = promptTokens + completionTokens;

      // Log usage if tracking is enabled
      if (userId && this.usageTracker) {
        const cost = provider.calculateCost(model, {
          promptTokens,
          completionTokens,
          totalTokens
        });

        await this.usageTracker.logCall({
          userId,
          provider: effectiveProvider,
          model,
          endpoint: 'chat',
          promptTokens,
          completionTokens,
          totalTokens,
          cost,
          latencyMs: Math.round(latencyMs),
          success: !error,
          errorMessage: error?.message
        });

        // Record quota usage
        if (!error && this.quotaManager) {
          await this.quotaManager.recordUsage(userId, totalTokens, cost);
        }
      }
    }
  }

  /**
   * Create embeddings with tracking
   */
  async embed(
    request: EmbeddingRequest & { userId?: string; provider?: AIProviderType }
  ): Promise<EmbeddingResponse> {
    const { userId, provider: providerType, ...embedRequest } = request;
    const effectiveProvider = providerType || this.defaultProvider;

    // Embeddings typically use specific models
    const provider = this.getProvider(effectiveProvider);
    const startTime = performance.now();

    try {
      const response = await provider.embed(embedRequest);
      const latencyMs = performance.now() - startTime;

      // Log usage if tracking is enabled
      if (userId && this.usageTracker) {
        const cost = provider.calculateCost(embedRequest.model, {
          promptTokens: response.usage.promptTokens,
          completionTokens: 0,
          totalTokens: response.usage.totalTokens
        });

        await this.usageTracker.logCall({
          userId,
          provider: effectiveProvider,
          model: embedRequest.model,
          endpoint: 'embedding',
          promptTokens: response.usage.promptTokens,
          completionTokens: 0,
          totalTokens: response.usage.totalTokens,
          cost,
          latencyMs: Math.round(latencyMs),
          success: true
        });
      }

      return response;
    } catch (error) {
      const latencyMs = performance.now() - startTime;

      if (userId && this.usageTracker) {
        await this.usageTracker.logCall({
          userId,
          provider: effectiveProvider,
          model: embedRequest.model,
          endpoint: 'embedding',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          latencyMs: Math.round(latencyMs),
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      throw error;
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUserStats(userId: string, period: 'day' | 'week' | 'month' | 'all_time' = 'month') {
    if (!this.usageTracker) {
      throw new Error('Usage tracking is not enabled');
    }
    return this.usageTracker.getUserStats(userId, period);
  }

  /**
   * Get user quota information
   */
  async getUserQuota(userId: string) {
    if (!this.quotaManager) {
      throw new Error('Quota management is not enabled');
    }
    return this.quotaManager.getQuota(userId);
  }

  /**
   * Get current usage against quota
   */
  async getUserUsage(userId: string) {
    if (!this.quotaManager) {
      throw new Error('Quota management is not enabled');
    }
    const quota = await this.quotaManager.getQuota(userId);
    const usage = await this.quotaManager.getCurrentUsage(userId, quota);

    return {
      quota,
      usage,
      remaining: {
        tokens: quota.limits.maxTokensPerMonth - usage.tokensThisMonth,
        calls: quota.limits.maxCallsPerDay - usage.callsToday,
        cost: quota.limits.maxCostPerMonth - usage.costThisMonth
      },
      percentUsed: {
        tokens: (usage.tokensThisMonth / quota.limits.maxTokensPerMonth) * 100,
        cost: (usage.costThisMonth / quota.limits.maxCostPerMonth) * 100
      }
    };
  }

  /**
   * Estimate tokens for a request
   */
  private estimateTokens(request: ChatCompletionRequest): number {
    let totalChars = 0;
    for (const msg of request.messages) {
      totalChars += msg.content.length;
      if (msg.name) totalChars += msg.name.length;
    }
    // Rough estimate: ~4 characters per token
    return Math.ceil(totalChars / 4);
  }
}

export default AIClient;
