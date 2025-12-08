/**
 * AI Module Types
 * Core type definitions for the AI SaaS boilerplate
 */

// ============================================
// Provider Types
// ============================================

export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'mistral' | 'custom';

export interface AIModelInfo {
  id: string;
  name: string;
  provider: AIProviderType;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePerMillion: number;  // USD per 1M tokens
  outputPricePerMillion: number; // USD per 1M tokens
  capabilities: AICapability[];
  isDefault?: boolean;
}

export type AICapability =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'vision'
  | 'function_calling'
  | 'streaming'
  | 'json_mode';

export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  organization?: string;
  timeout?: number;
  maxRetries?: number;
}

// ============================================
// Message Types
// ============================================

export type MessageRole = 'system' | 'user' | 'assistant' | 'function' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  functionCall?: FunctionCall;
  toolCalls?: ToolCall[];
}

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: FunctionCall;
}

// ============================================
// Request/Response Types
// ============================================

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  stream?: boolean;
  functions?: FunctionDefinition[];
  tools?: ToolDefinition[];
  responseFormat?: { type: 'text' | 'json_object' };
  user?: string;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: ChatChoice[];
  usage: TokenUsage;
  created: number;
}

export interface ChatChoice {
  index: number;
  message: Message;
  finishReason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamChunk {
  id: string;
  model: string;
  choices: StreamChoice[];
}

export interface StreamChoice {
  index: number;
  delta: Partial<Message>;
  finishReason: string | null;
}

// ============================================
// Function/Tool Definitions
// ============================================

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: string[];
  items?: JSONSchema;
  [key: string]: unknown;
}

// ============================================
// Embedding Types
// ============================================

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  user?: string;
}

export interface EmbeddingResponse {
  model: string;
  embeddings: number[][];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

// ============================================
// RAG Types
// ============================================

export interface Document {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  embedding?: number[];
}

export interface DocumentMetadata {
  source: string;
  title?: string;
  author?: string;
  createdAt?: Date;
  updatedAt?: Date;
  chunkIndex?: number;
  totalChunks?: number;
  [key: string]: unknown;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata: DocumentMetadata;
  startIndex: number;
  endIndex: number;
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
  distance: number;
}

export interface RAGContext {
  query: string;
  results: SearchResult[];
  totalTokens: number;
}

// ============================================
// Agent Types
// ============================================

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'completed' | 'error';

export interface AgentConfig {
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  maxIterations?: number;
  temperature?: number;
}

export interface AgentStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'final_answer';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  timestamp: Date;
}

export interface AgentExecution {
  id: string;
  agentName: string;
  input: string;
  steps: AgentStep[];
  output?: string;
  status: AgentStatus;
  startTime: Date;
  endTime?: Date;
  totalTokens: number;
  totalCost: number;
}

// ============================================
// Cost Tracking Types
// ============================================

export interface APICallLog {
  id: string;
  userId: string;
  provider: AIProviderType;
  model: string;
  endpoint: 'chat' | 'completion' | 'embedding';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface UsageStats {
  userId: string;
  period: 'day' | 'week' | 'month' | 'all_time';
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Record<AIProviderType, ProviderUsage>;
  byModel: Record<string, ModelUsage>;
}

export interface ProviderUsage {
  calls: number;
  tokens: number;
  cost: number;
}

export interface ModelUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgLatencyMs: number;
}

// ============================================
// Quota Types
// ============================================

export interface UserQuota {
  userId: string;
  planId: string;
  limits: QuotaLimits;
  usage: QuotaUsage;
  resetAt: Date;
}

export interface QuotaLimits {
  maxTokensPerMonth: number;
  maxCallsPerMinute: number;
  maxCallsPerDay: number;
  maxCostPerMonth: number;
  allowedModels: string[];
  allowedProviders: AIProviderType[];
}

export interface QuotaUsage {
  tokensThisMonth: number;
  callsToday: number;
  callsThisMinute: number;
  costThisMonth: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  remaining?: {
    tokens: number;
    calls: number;
    cost: number;
  };
}

// ============================================
// Benchmark Types
// ============================================

export interface BenchmarkTest {
  id: string;
  name: string;
  description: string;
  prompts: BenchmarkPrompt[];
  metrics: BenchmarkMetric[];
}

export interface BenchmarkPrompt {
  id: string;
  systemPrompt?: string;
  userPrompt: string;
  expectedOutput?: string;
  category: string;
}

export type BenchmarkMetric =
  | 'latency'
  | 'tokens_per_second'
  | 'cost'
  | 'accuracy'
  | 'relevance'
  | 'coherence';

export interface BenchmarkResult {
  id: string;
  testId: string;
  model: string;
  provider: AIProviderType;
  results: PromptResult[];
  aggregated: AggregatedMetrics;
  runAt: Date;
}

export interface PromptResult {
  promptId: string;
  output: string;
  latencyMs: number;
  tokensPerSecond: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  scores?: Record<string, number>;
}

export interface AggregatedMetrics {
  avgLatencyMs: number;
  avgTokensPerSecond: number;
  totalCost: number;
  avgCostPerPrompt: number;
  totalTokens: number;
  successRate: number;
  scores?: Record<string, number>;
}

// ============================================
// Conversation Types
// ============================================

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  messages: Message[];
  model: string;
  provider: AIProviderType;
  totalTokens: number;
  totalCost: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  updatedAt: Date;
}
