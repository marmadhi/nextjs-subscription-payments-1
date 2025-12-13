/**
 * AI Module - Main Entry Point
 * AI SaaS Boilerplate for rapid AI product development
 */

// Types
export * from './types';

// Providers
export {
  BaseAIProvider,
  createProvider,
  registerProvider,
  getRegisteredProviders
} from './providers';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';

// RAG
export {
  VectorStore,
  RAGPipeline,
  splitText,
  processDocument,
  createDocument,
  estimateTokens,
  extractText,
  mergeChunks,
  type VectorStoreConfig,
  type RAGPipelineConfig,
  type RAGQueryOptions,
  type ChunkingOptions
} from './rag';

// Agents
export {
  Agent,
  createWebSearchTool,
  createCalculatorTool,
  createDateTimeTool,
  createJSONParserTool,
  createHTTPTool,
  createRAGSearchTool,
  createCodeExecutorTool,
  type ToolHandler,
  type AgentRunOptions
} from './agents';

// Tracking
export {
  UsageTracker,
  QuotaManager,
  PLAN_LIMITS,
  DEFAULT_FREE_LIMITS,
  type UsageTrackerConfig,
  type QuotaManagerConfig
} from './tracking';

// Benchmarks
export {
  BenchmarkRunner,
  BENCHMARK_TESTS,
  type BenchmarkConfig,
  type ModelConfig
} from './benchmarks';

// AI Client
export { AIClient, type AIClientConfig } from './client';
