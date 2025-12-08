/**
 * Base AI Provider
 * Abstract interface for AI model providers
 */

import type {
  AIProviderType,
  AIProviderConfig,
  AIModelInfo,
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamChunk,
  TokenUsage
} from '../types';

export abstract class BaseAIProvider {
  protected config: AIProviderConfig;
  protected providerType: AIProviderType;

  constructor(config: AIProviderConfig, providerType: AIProviderType) {
    this.config = config;
    this.providerType = providerType;
  }

  /**
   * Get the provider type
   */
  getProviderType(): AIProviderType {
    return this.providerType;
  }

  /**
   * Get available models for this provider
   */
  abstract getModels(): AIModelInfo[];

  /**
   * Get model info by ID
   */
  getModelInfo(modelId: string): AIModelInfo | undefined {
    return this.getModels().find((m) => m.id === modelId);
  }

  /**
   * Calculate cost for a given usage
   */
  calculateCost(modelId: string, usage: TokenUsage): number {
    const model = this.getModelInfo(modelId);
    if (!model) return 0;

    const inputCost = (usage.promptTokens / 1_000_000) * model.inputPricePerMillion;
    const outputCost = (usage.completionTokens / 1_000_000) * model.outputPricePerMillion;

    return inputCost + outputCost;
  }

  /**
   * Create a chat completion
   */
  abstract chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /**
   * Create a streaming chat completion
   */
  abstract chatStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * Create embeddings for text
   */
  abstract embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Count tokens for a given text (approximate)
   */
  abstract countTokens(text: string, model?: string): number;

  /**
   * Validate API key and connection
   */
  abstract validateConnection(): Promise<boolean>;
}

/**
 * Provider factory function type
 */
export type ProviderFactory = (config: AIProviderConfig) => BaseAIProvider;

/**
 * Registry of provider factories
 */
const providerRegistry = new Map<AIProviderType, ProviderFactory>();

/**
 * Register a provider factory
 */
export function registerProvider(type: AIProviderType, factory: ProviderFactory): void {
  providerRegistry.set(type, factory);
}

/**
 * Create a provider instance
 */
export function createProvider(
  type: AIProviderType,
  config: AIProviderConfig
): BaseAIProvider {
  const factory = providerRegistry.get(type);
  if (!factory) {
    throw new Error(`Unknown provider type: ${type}`);
  }
  return factory(config);
}

/**
 * Get all registered provider types
 */
export function getRegisteredProviders(): AIProviderType[] {
  return Array.from(providerRegistry.keys());
}
