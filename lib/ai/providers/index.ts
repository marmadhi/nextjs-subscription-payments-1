/**
 * AI Providers Index
 * Export all provider implementations
 */

export { BaseAIProvider, createProvider, registerProvider, getRegisteredProviders } from './base';
export { OpenAIProvider } from './openai';
export { AnthropicProvider } from './anthropic';

// Import providers to trigger registration
import './openai';
import './anthropic';
