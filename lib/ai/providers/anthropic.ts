/**
 * Anthropic Provider Implementation
 */

import { BaseAIProvider, registerProvider } from './base';
import type {
  AIProviderConfig,
  AIModelInfo,
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamChunk,
  Message
} from '../types';

// Anthropic API Types
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: AnthropicTool[];
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Available Anthropic Models with pricing (as of 2024)
const ANTHROPIC_MODELS: AIModelInfo[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming'],
    isDefault: true
  },
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputPricePerMillion: 15,
    outputPricePerMillion: 75,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming']
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming']
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming']
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    inputPricePerMillion: 15,
    outputPricePerMillion: 75,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming']
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming']
  }
];

export class AnthropicProvider extends BaseAIProvider {
  private baseUrl: string;
  private apiVersion: string;

  constructor(config: AIProviderConfig) {
    super(config, 'anthropic');
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
    this.apiVersion = '2023-06-01';
  }

  getModels(): AIModelInfo[] {
    return ANTHROPIC_MODELS;
  }

  private convertMessages(
    messages: Message[]
  ): { system?: string; messages: AnthropicMessage[] } {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
        continue;
      }

      // Convert tool/function roles to assistant with tool_result
      if (msg.role === 'tool' || msg.role === 'function') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.name || 'unknown',
              content: msg.content
            }
          ]
        });
        continue;
      }

      // Handle tool calls in assistant messages
      if (msg.role === 'assistant' && msg.toolCalls) {
        const content: AnthropicContentBlock[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments)
          });
        }
        anthropicMessages.push({ role: 'assistant', content });
        continue;
      }

      anthropicMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      });
    }

    return { system, messages: anthropicMessages };
  }

  private convertResponse(response: AnthropicResponse): ChatCompletionResponse {
    let content = '';
    const toolCalls: ChatCompletionResponse['choices'][0]['message']['toolCalls'] = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        content += block.text;
      } else if (block.type === 'tool_use' && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {})
          }
        });
      }
    }

    const finishReason =
      response.stop_reason === 'tool_use'
        ? 'tool_calls'
        : response.stop_reason === 'max_tokens'
          ? 'length'
          : 'stop';

    return {
      id: response.id,
      model: response.model,
      created: Date.now(),
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined
          },
          finishReason: finishReason as ChatCompletionResponse['choices'][0]['finishReason']
        }
      ],
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { system, messages } = this.convertMessages(request.messages);

    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature,
      top_p: request.topP,
      stream: false
    };

    if (system) {
      anthropicRequest.system = system;
    }

    if (request.stop) {
      anthropicRequest.stop_sequences = Array.isArray(request.stop)
        ? request.stop
        : [request.stop];
    }

    if (request.tools) {
      anthropicRequest.tools = request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters as Record<string, unknown>
      }));
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.apiVersion
      },
      body: JSON.stringify(anthropicRequest)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`
      );
    }

    const data: AnthropicResponse = await response.json();
    return this.convertResponse(data);
  }

  async *chatStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const { system, messages } = this.convertMessages(request.messages);

    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature,
      top_p: request.topP,
      stream: true
    };

    if (system) {
      anthropicRequest.system = system;
    }

    if (request.stop) {
      anthropicRequest.stop_sequences = Array.isArray(request.stop)
        ? request.stop
        : [request.stop];
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.apiVersion
      },
      body: JSON.stringify(anthropicRequest)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let messageId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));

          if (json.type === 'message_start') {
            messageId = json.message.id;
          } else if (json.type === 'content_block_delta') {
            const delta = json.delta;
            if (delta.type === 'text_delta') {
              yield {
                id: messageId,
                model: request.model,
                choices: [
                  {
                    index: 0,
                    delta: { content: delta.text },
                    finishReason: null
                  }
                ]
              };
            }
          } else if (json.type === 'message_stop') {
            yield {
              id: messageId,
              model: request.model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finishReason: 'stop'
                }
              ]
            };
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }

  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // Anthropic doesn't have a native embedding API
    // You would typically use a different provider for embeddings
    throw new Error(
      'Anthropic does not provide an embedding API. Use OpenAI or another provider for embeddings.'
    );
  }

  countTokens(text: string, _model?: string): number {
    // Approximate token count for Claude models
    // Claude uses a similar tokenization to GPT models
    return Math.ceil(text.length / 4);
  }

  async validateConnection(): Promise<boolean> {
    try {
      // Make a minimal API call to validate the key
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': this.apiVersion
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Register the provider
registerProvider('anthropic', (config) => new AnthropicProvider(config));

export default AnthropicProvider;
