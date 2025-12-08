/**
 * Base Agent Implementation
 * ReAct-style agent framework with tool execution
 */

import type {
  AgentConfig,
  AgentExecution,
  AgentStep,
  AgentStatus,
  Message,
  ToolDefinition,
  ChatCompletionResponse,
  AIProviderConfig,
  AIProviderType,
  TokenUsage
} from '../types';
import { createProvider } from '../providers';

export interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface AgentRunOptions {
  maxIterations?: number;
  onStep?: (step: AgentStep) => void;
  onStatusChange?: (status: AgentStatus) => void;
  signal?: AbortSignal;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export class Agent {
  private config: AgentConfig;
  private providerConfig: AIProviderConfig;
  private providerType: AIProviderType;
  private toolHandlers: Map<string, ToolHandler>;
  private status: AgentStatus;

  constructor(
    config: AgentConfig,
    providerConfig: AIProviderConfig,
    providerType: AIProviderType = 'openai'
  ) {
    this.config = config;
    this.providerConfig = providerConfig;
    this.providerType = providerType;
    this.toolHandlers = new Map();
    this.status = 'idle';
  }

  /**
   * Register a tool handler
   */
  registerTool(handler: ToolHandler): void {
    this.toolHandlers.set(handler.name, handler);

    // Add to agent config tools
    const toolDef: ToolDefinition = {
      type: 'function',
      function: {
        name: handler.name,
        description: handler.description,
        parameters: handler.parameters as ToolDefinition['function']['parameters']
      }
    };

    const existingIndex = this.config.tools.findIndex(
      (t) => t.function.name === handler.name
    );

    if (existingIndex >= 0) {
      this.config.tools[existingIndex] = toolDef;
    } else {
      this.config.tools.push(toolDef);
    }
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): void {
    this.toolHandlers.delete(name);
    this.config.tools = this.config.tools.filter((t) => t.function.name !== name);
  }

  /**
   * Get current status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Execute a tool by name
   */
  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    const handler = this.toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler.execute(input);
  }

  /**
   * Build the system prompt for the agent
   */
  private buildSystemPrompt(): string {
    const toolDescriptions = this.config.tools
      .map((t) => `- ${t.function.name}: ${t.function.description}`)
      .join('\n');

    return `${this.config.systemPrompt}

You have access to the following tools:
${toolDescriptions}

When you need to use a tool, respond with the tool call. After receiving the tool result, analyze it and either use another tool or provide your final answer.

If you can answer the question without tools, do so directly.
When you have enough information to answer the question, provide your final answer clearly.`;
  }

  /**
   * Run the agent
   */
  async run(input: string, options: AgentRunOptions = {}): Promise<AgentExecution> {
    const { maxIterations = this.config.maxIterations || 10, onStep, onStatusChange, signal } = options;

    const execution: AgentExecution = {
      id: generateId(),
      agentName: this.config.name,
      input,
      steps: [],
      status: 'thinking',
      startTime: new Date(),
      totalTokens: 0,
      totalCost: 0
    };

    this.status = 'thinking';
    onStatusChange?.('thinking');

    const provider = createProvider(this.providerType, this.providerConfig);
    const messages: Message[] = [
      { role: 'system', content: this.buildSystemPrompt() },
      { role: 'user', content: input }
    ];

    let iterations = 0;
    let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (iterations < maxIterations) {
        if (signal?.aborted) {
          execution.status = 'error';
          execution.output = 'Execution aborted';
          break;
        }

        iterations++;

        // Get LLM response
        const response: ChatCompletionResponse = await provider.chat({
          model: this.config.model,
          messages,
          temperature: this.config.temperature || 0.7,
          tools: this.config.tools.length > 0 ? this.config.tools : undefined
        });

        // Track usage
        totalUsage.promptTokens += response.usage.promptTokens;
        totalUsage.completionTokens += response.usage.completionTokens;
        totalUsage.totalTokens += response.usage.totalTokens;

        const choice = response.choices[0];
        const assistantMessage = choice.message;

        // Add assistant message to history
        messages.push(assistantMessage);

        // Check for tool calls
        if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
          this.status = 'executing';
          onStatusChange?.('executing');

          for (const toolCall of assistantMessage.toolCalls) {
            const toolName = toolCall.function.name;
            const toolInput = JSON.parse(toolCall.function.arguments);

            // Record thought step
            const thoughtStep: AgentStep = {
              id: generateId(),
              type: 'thought',
              content: `Using tool: ${toolName}`,
              timestamp: new Date()
            };
            execution.steps.push(thoughtStep);
            onStep?.(thoughtStep);

            // Record action step
            const actionStep: AgentStep = {
              id: generateId(),
              type: 'action',
              content: `Calling ${toolName}`,
              toolName,
              toolInput,
              timestamp: new Date()
            };
            execution.steps.push(actionStep);
            onStep?.(actionStep);

            // Execute tool
            let toolOutput: string;
            try {
              toolOutput = await this.executeTool(toolName, toolInput);
            } catch (error) {
              toolOutput = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }

            // Record observation step
            const observationStep: AgentStep = {
              id: generateId(),
              type: 'observation',
              content: toolOutput,
              toolName,
              toolOutput,
              timestamp: new Date()
            };
            execution.steps.push(observationStep);
            onStep?.(observationStep);

            // Add tool result to messages
            messages.push({
              role: 'tool',
              name: toolCall.id,
              content: toolOutput
            });
          }

          this.status = 'thinking';
          onStatusChange?.('thinking');
        } else {
          // No tool calls - this is the final answer
          const finalStep: AgentStep = {
            id: generateId(),
            type: 'final_answer',
            content: assistantMessage.content,
            timestamp: new Date()
          };
          execution.steps.push(finalStep);
          onStep?.(finalStep);

          execution.output = assistantMessage.content;
          execution.status = 'completed';
          break;
        }

        // Check if we should stop (reached max iterations)
        if (iterations >= maxIterations) {
          execution.status = 'error';
          execution.output = 'Maximum iterations reached without final answer';
        }
      }
    } catch (error) {
      execution.status = 'error';
      execution.output = error instanceof Error ? error.message : 'Unknown error';
    }

    // Finalize execution
    execution.endTime = new Date();
    execution.totalTokens = totalUsage.totalTokens;
    execution.totalCost = provider.calculateCost(this.config.model, totalUsage);

    this.status = execution.status === 'completed' ? 'idle' : 'error';
    onStatusChange?.(this.status);

    return execution;
  }

  /**
   * Stream agent execution
   */
  async *runStream(
    input: string,
    options: AgentRunOptions = {}
  ): AsyncGenerator<AgentStep, AgentExecution, unknown> {
    const { maxIterations = this.config.maxIterations || 10, signal } = options;

    const execution: AgentExecution = {
      id: generateId(),
      agentName: this.config.name,
      input,
      steps: [],
      status: 'thinking',
      startTime: new Date(),
      totalTokens: 0,
      totalCost: 0
    };

    this.status = 'thinking';

    const provider = createProvider(this.providerType, this.providerConfig);
    const messages: Message[] = [
      { role: 'system', content: this.buildSystemPrompt() },
      { role: 'user', content: input }
    ];

    let iterations = 0;
    let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (iterations < maxIterations) {
        if (signal?.aborted) {
          execution.status = 'error';
          execution.output = 'Execution aborted';
          break;
        }

        iterations++;

        // Stream LLM response
        let fullContent = '';
        let toolCalls: Message['toolCalls'] = [];

        const stream = provider.chatStream({
          model: this.config.model,
          messages,
          temperature: this.config.temperature || 0.7,
          tools: this.config.tools.length > 0 ? this.config.tools : undefined
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
          }
        }

        // Get full response for tool handling
        const response = await provider.chat({
          model: this.config.model,
          messages,
          temperature: this.config.temperature || 0.7,
          tools: this.config.tools.length > 0 ? this.config.tools : undefined
        });

        totalUsage.promptTokens += response.usage.promptTokens;
        totalUsage.completionTokens += response.usage.completionTokens;
        totalUsage.totalTokens += response.usage.totalTokens;

        const choice = response.choices[0];
        const assistantMessage = choice.message;
        toolCalls = assistantMessage.toolCalls;

        messages.push(assistantMessage);

        if (toolCalls && toolCalls.length > 0) {
          this.status = 'executing';

          for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name;
            const toolInput = JSON.parse(toolCall.function.arguments);

            const actionStep: AgentStep = {
              id: generateId(),
              type: 'action',
              content: `Calling ${toolName}`,
              toolName,
              toolInput,
              timestamp: new Date()
            };
            execution.steps.push(actionStep);
            yield actionStep;

            let toolOutput: string;
            try {
              toolOutput = await this.executeTool(toolName, toolInput);
            } catch (error) {
              toolOutput = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }

            const observationStep: AgentStep = {
              id: generateId(),
              type: 'observation',
              content: toolOutput,
              toolName,
              toolOutput,
              timestamp: new Date()
            };
            execution.steps.push(observationStep);
            yield observationStep;

            messages.push({
              role: 'tool',
              name: toolCall.id,
              content: toolOutput
            });
          }

          this.status = 'thinking';
        } else {
          const finalStep: AgentStep = {
            id: generateId(),
            type: 'final_answer',
            content: assistantMessage.content,
            timestamp: new Date()
          };
          execution.steps.push(finalStep);
          yield finalStep;

          execution.output = assistantMessage.content;
          execution.status = 'completed';
          break;
        }

        if (iterations >= maxIterations) {
          execution.status = 'error';
          execution.output = 'Maximum iterations reached';
        }
      }
    } catch (error) {
      execution.status = 'error';
      execution.output = error instanceof Error ? error.message : 'Unknown error';
    }

    execution.endTime = new Date();
    execution.totalTokens = totalUsage.totalTokens;
    execution.totalCost = provider.calculateCost(this.config.model, totalUsage);

    this.status = execution.status === 'completed' ? 'idle' : 'error';

    return execution;
  }
}

export default Agent;
