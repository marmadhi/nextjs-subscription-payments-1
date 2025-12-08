/**
 * LangGraph Agent Framework
 * Sophisticated agent workflows with state management
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createChatModel, ModelConfig } from './models';
import { createTracer } from './tracing';

// ============================================
// State Definition
// ============================================

// Define the state using Annotation
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (state, update) => [...state, ...update],
    default: () => [],
  }),
  currentStep: Annotation<string>({
    reducer: (_, update) => update,
    default: () => 'start',
  }),
  toolCalls: Annotation<number>({
    reducer: (state, update) => state + update,
    default: () => 0,
  }),
  error: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;

// ============================================
// Built-in Tools
// ============================================

/**
 * Calculator tool
 */
export const calculatorTool = new DynamicStructuredTool({
  name: 'calculator',
  description: 'Useful for performing mathematical calculations',
  schema: z.object({
    expression: z.string().describe('Mathematical expression to evaluate'),
  }),
  func: async ({ expression }) => {
    try {
      // Safe evaluation using Function
      const sanitized = expression.replace(/[^0-9+\-*/%().sqrt\s]/g, '');
      const result = new Function(`return ${sanitized}`)();
      return `Result: ${result}`;
    } catch (error) {
      return `Error: Unable to calculate "${expression}"`;
    }
  },
});

/**
 * Current date/time tool
 */
export const dateTimeTool = new DynamicStructuredTool({
  name: 'get_current_datetime',
  description: 'Get the current date and time',
  schema: z.object({
    timezone: z.string().optional().describe('Timezone (e.g., "UTC", "America/New_York")'),
  }),
  func: async ({ timezone }) => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone || 'UTC',
      dateStyle: 'full',
      timeStyle: 'long',
    };
    return new Date().toLocaleString('en-US', options);
  },
});

/**
 * Web search tool (placeholder - implement with your preferred search API)
 */
export const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Search the web for current information',
  schema: z.object({
    query: z.string().describe('Search query'),
  }),
  func: async ({ query }) => {
    // Placeholder - integrate with Tavily, SerpAPI, or other search providers
    return `[Web search for "${query}" - implement with your preferred search API]`;
  },
});

// ============================================
// Agent Configuration
// ============================================

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  model: ModelConfig;
  tools?: DynamicStructuredTool[];
  maxIterations?: number;
}

// ============================================
// ReAct Agent with LangGraph
// ============================================

/**
 * Create a ReAct-style agent using LangGraph
 */
export function createReActAgent(config: AgentConfig) {
  const {
    name,
    systemPrompt,
    model: modelConfig,
    tools = [],
    maxIterations = 10,
  } = config;

  // Create the chat model
  const model = createChatModel(modelConfig);

  // Bind tools to the model if any
  const modelWithTools = tools.length > 0
    ? model.bindTools(tools)
    : model;

  // Create tool node
  const toolNode = new ToolNode(tools);

  // Define the agent node
  async function agentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
    const messages = [
      new SystemMessage(systemPrompt),
      ...state.messages,
    ];

    try {
      const response = await modelWithTools.invoke(messages);
      return {
        messages: [response],
        currentStep: 'agent',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        currentStep: 'error',
      };
    }
  }

  // Define the tools node
  async function toolsNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return { currentStep: 'tools' };
    }

    try {
      const toolResults = await toolNode.invoke({ messages: [lastMessage] });
      return {
        messages: toolResults.messages,
        toolCalls: 1,
        currentStep: 'tools',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Tool execution error',
        currentStep: 'error',
      };
    }
  }

  // Define routing logic
  function shouldContinue(state: AgentStateType): string {
    // Check for errors
    if (state.error) {
      return END;
    }

    // Check max iterations
    if (state.toolCalls >= maxIterations) {
      return END;
    }

    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

    // If there are tool calls, go to tools node
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return 'tools';
    }

    // Otherwise, we're done
    return END;
  }

  // Build the graph
  const workflow = new StateGraph(AgentState)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      [END]: END,
    })
    .addEdge('tools', 'agent');

  // Compile the graph
  const app = workflow.compile();

  return {
    name,
    graph: app,

    /**
     * Run the agent with a user message
     */
    async invoke(input: string, options?: { threadId?: string }): Promise<{
      output: string;
      messages: BaseMessage[];
      toolCalls: number;
      error: string | null;
    }> {
      const tracer = createTracer();

      const config = {
        configurable: {
          thread_id: options?.threadId || `${name}-${Date.now()}`,
        },
        callbacks: tracer ? [tracer] : undefined,
      };

      const result = await app.invoke(
        {
          messages: [new HumanMessage(input)],
        },
        config
      );

      const lastMessage = result.messages[result.messages.length - 1];
      const output = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      return {
        output,
        messages: result.messages,
        toolCalls: result.toolCalls,
        error: result.error,
      };
    },

    /**
     * Stream the agent execution
     */
    async *stream(input: string, options?: { threadId?: string }): AsyncGenerator<{
      type: 'message' | 'tool_call' | 'tool_result' | 'final';
      content: string;
      data?: unknown;
    }> {
      const config = {
        configurable: {
          thread_id: options?.threadId || `${name}-${Date.now()}`,
        },
        streamMode: 'values' as const,
      };

      const stream = await app.stream(
        {
          messages: [new HumanMessage(input)],
        },
        config
      );

      for await (const state of stream) {
        const lastMessage = state.messages[state.messages.length - 1];

        if (lastMessage instanceof AIMessage) {
          if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
            for (const toolCall of lastMessage.tool_calls) {
              yield {
                type: 'tool_call',
                content: `Calling tool: ${toolCall.name}`,
                data: toolCall,
              };
            }
          } else {
            yield {
              type: 'message',
              content: typeof lastMessage.content === 'string'
                ? lastMessage.content
                : JSON.stringify(lastMessage.content),
            };
          }
        } else if (lastMessage.name) {
          // Tool result
          yield {
            type: 'tool_result',
            content: typeof lastMessage.content === 'string'
              ? lastMessage.content
              : JSON.stringify(lastMessage.content),
            data: { toolName: lastMessage.name },
          };
        }
      }

      yield { type: 'final', content: 'Execution complete' };
    },
  };
}

// ============================================
// Pre-built Agent Templates
// ============================================

/**
 * Create a general assistant agent
 */
export function createAssistantAgent(modelConfig: ModelConfig) {
  return createReActAgent({
    name: 'assistant',
    systemPrompt: `You are a helpful AI assistant. You can use tools when needed to answer questions accurately.

When you need to perform calculations, use the calculator tool.
When you need the current date or time, use the get_current_datetime tool.
When you need current information from the web, use the web_search tool.

Always think step by step and explain your reasoning.`,
    model: modelConfig,
    tools: [calculatorTool, dateTimeTool, webSearchTool],
    maxIterations: 10,
  });
}

/**
 * Create a research agent
 */
export function createResearchAgent(modelConfig: ModelConfig) {
  return createReActAgent({
    name: 'researcher',
    systemPrompt: `You are a research assistant specialized in finding and analyzing information.

Your capabilities:
- Search the web for current information
- Analyze and summarize findings
- Provide well-sourced answers

Always cite your sources and be transparent about uncertainty.`,
    model: modelConfig,
    tools: [webSearchTool, dateTimeTool],
    maxIterations: 15,
  });
}

/**
 * Create a coding assistant agent
 */
export function createCodingAgent(modelConfig: ModelConfig) {
  return createReActAgent({
    name: 'coder',
    systemPrompt: `You are an expert programming assistant.

Your capabilities:
- Write clean, efficient code
- Debug and explain code
- Suggest best practices
- Perform calculations when needed

Always explain your code and consider edge cases.`,
    model: modelConfig,
    tools: [calculatorTool],
    maxIterations: 5,
  });
}

export default {
  createReActAgent,
  createAssistantAgent,
  createResearchAgent,
  createCodingAgent,
  calculatorTool,
  dateTimeTool,
  webSearchTool,
};
