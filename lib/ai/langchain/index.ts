/**
 * LangChain Module - Main Entry Point
 * AI SaaS Boilerplate with LangChain, LangGraph, and LangSmith
 */

// Models
export {
  createChatModel,
  createEmbeddings,
  calculateCost,
  getAvailableModels,
  MODEL_PRICING,
  DEFAULT_MODELS,
  type ModelProvider,
  type ModelConfig,
} from './models';

// Tracing (LangSmith)
export {
  isLangSmithEnabled,
  getLangSmithClient,
  createTracer,
  createCallbackManager,
  getTracingConfig,
  logFeedback,
  createDataset,
  addDatasetExamples,
  type TracingConfig,
} from './tracing';

// Agents (LangGraph)
export {
  createReActAgent,
  createAssistantAgent,
  createResearchAgent,
  createCodingAgent,
  calculatorTool,
  dateTimeTool,
  webSearchTool,
  type AgentConfig,
} from './agents';

// RAG
export {
  RAGPipeline,
  ConversationalRAG,
  createRAGPipeline,
  createConversationalRAG,
  type RAGConfig,
  type DocumentInput,
  type RetrievalResult,
} from './rag';
