/**
 * LangSmith Tracing Configuration
 * Monitoring, debugging, and evaluation for LangChain operations
 */

import { Client } from 'langsmith';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { CallbackManager } from '@langchain/core/callbacks/manager';

// LangSmith client singleton
let langsmithClient: Client | null = null;

/**
 * Check if LangSmith is configured
 */
export function isLangSmithEnabled(): boolean {
  return !!(
    process.env.LANGCHAIN_TRACING_V2 === 'true' &&
    process.env.LANGCHAIN_API_KEY
  );
}

/**
 * Get or create LangSmith client
 */
export function getLangSmithClient(): Client | null {
  if (!isLangSmithEnabled()) {
    return null;
  }

  if (!langsmithClient) {
    langsmithClient = new Client({
      apiUrl: process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com',
      apiKey: process.env.LANGCHAIN_API_KEY,
    });
  }

  return langsmithClient;
}

/**
 * Create a LangChain tracer for a specific project/session
 */
export function createTracer(
  projectName?: string,
  runName?: string
): LangChainTracer | null {
  if (!isLangSmithEnabled()) {
    return null;
  }

  return new LangChainTracer({
    projectName: projectName || process.env.LANGCHAIN_PROJECT || 'ai-saas',
    client: getLangSmithClient() || undefined,
  });
}

/**
 * Create callback manager with tracing
 */
export function createCallbackManager(
  projectName?: string,
  metadata?: Record<string, unknown>
): CallbackManager {
  const callbacks = [];

  const tracer = createTracer(projectName);
  if (tracer) {
    callbacks.push(tracer);
  }

  return CallbackManager.fromHandlers({
    handleLLMStart: async (llm, prompts, runId, parentRunId, extraParams) => {
      console.log(`[LLM Start] ${llm.id?.join('/') || 'unknown'}`);
    },
    handleLLMEnd: async (output, runId) => {
      const tokens = output.llmOutput?.tokenUsage;
      if (tokens) {
        console.log(`[LLM End] Tokens: ${tokens.totalTokens}`);
      }
    },
    handleLLMError: async (error, runId) => {
      console.error(`[LLM Error]`, error);
    },
    handleChainStart: async (chain, inputs, runId) => {
      console.log(`[Chain Start] ${chain.id?.join('/') || 'unknown'}`);
    },
    handleChainEnd: async (outputs, runId) => {
      console.log(`[Chain End]`);
    },
    handleToolStart: async (tool, input, runId) => {
      console.log(`[Tool Start] ${tool.id?.join('/') || 'unknown'}`);
    },
    handleToolEnd: async (output, runId) => {
      console.log(`[Tool End]`);
    },
  });
}

/**
 * Tracing configuration for different environments
 */
export interface TracingConfig {
  enabled: boolean;
  projectName: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Get tracing config based on environment
 */
export function getTracingConfig(): TracingConfig {
  const env = process.env.NODE_ENV || 'development';

  return {
    enabled: isLangSmithEnabled(),
    projectName: process.env.LANGCHAIN_PROJECT || `ai-saas-${env}`,
    tags: [env],
    metadata: {
      environment: env,
      version: process.env.npm_package_version || '1.0.0',
    },
  };
}

/**
 * Log a feedback/evaluation to LangSmith
 */
export async function logFeedback(
  runId: string,
  score: number,
  comment?: string,
  key: string = 'user-feedback'
): Promise<void> {
  const client = getLangSmithClient();
  if (!client) return;

  try {
    await client.createFeedback(runId, key, {
      score,
      comment,
    });
  } catch (error) {
    console.error('Failed to log feedback:', error);
  }
}

/**
 * Create a dataset for evaluation
 */
export async function createDataset(
  name: string,
  description?: string
): Promise<string | null> {
  const client = getLangSmithClient();
  if (!client) return null;

  try {
    const dataset = await client.createDataset(name, {
      description,
    });
    return dataset.id;
  } catch (error) {
    console.error('Failed to create dataset:', error);
    return null;
  }
}

/**
 * Add examples to a dataset
 */
export async function addDatasetExamples(
  datasetId: string,
  examples: Array<{
    inputs: Record<string, unknown>;
    outputs?: Record<string, unknown>;
  }>
): Promise<void> {
  const client = getLangSmithClient();
  if (!client) return;

  try {
    for (const example of examples) {
      await client.createExample(example.inputs, example.outputs || {}, {
        datasetId,
      });
    }
  } catch (error) {
    console.error('Failed to add examples:', error);
  }
}

export default {
  isLangSmithEnabled,
  getLangSmithClient,
  createTracer,
  createCallbackManager,
  getTracingConfig,
  logFeedback,
  createDataset,
  addDatasetExamples,
};
