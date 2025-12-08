/**
 * LangChain Models Configuration
 * Unified model configuration for OpenAI, Anthropic, and other providers
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Embeddings } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';

export type ModelProvider = 'openai' | 'anthropic';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}

// Model pricing (USD per 1M tokens) - Updated December 2024
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  // Anthropic
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

// Default models per provider
export const DEFAULT_MODELS: Record<ModelProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
};

/**
 * Create a chat model instance
 */
export function createChatModel(config: ModelConfig): BaseChatModel {
  const { provider, model, temperature = 0.7, maxTokens = 2000, streaming = false } = config;

  switch (provider) {
    case 'openai':
      return new ChatOpenAI({
        modelName: model,
        temperature,
        maxTokens,
        streaming,
        openAIApiKey: process.env.OPENAI_API_KEY,
      });

    case 'anthropic':
      return new ChatAnthropic({
        modelName: model,
        temperature,
        maxTokens,
        streaming,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      });

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Create embeddings instance
 */
export function createEmbeddings(
  model: string = 'text-embedding-3-small'
): Embeddings {
  return new OpenAIEmbeddings({
    modelName: model,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Get available models for a provider
 */
export function getAvailableModels(provider: ModelProvider): string[] {
  const models: Record<ModelProvider, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    anthropic: [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
  };

  return models[provider] || [];
}
