/**
 * OpenAI Provider Implementation
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

// OpenAI API Types
interface OpenAIMessage {
  role: string;
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  functions?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  response_format?: { type: 'text' | 'json_object' };
  user?: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Available OpenAI Models with pricing (as of 2024)
const OPENAI_MODELS: AIModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'],
    isDefault: true
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode']
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputPricePerMillion: 10,
    outputPricePerMillion: 30,
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode']
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    contextWindow: 8192,
    maxOutputTokens: 8192,
    inputPricePerMillion: 30,
    outputPricePerMillion: 60,
    capabilities: ['chat', 'function_calling', 'streaming']
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    contextWindow: 16385,
    maxOutputTokens: 4096,
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 1.5,
    capabilities: ['chat', 'function_calling', 'streaming', 'json_mode']
  },
  {
    id: 'text-embedding-3-small',
    name: 'Text Embedding 3 Small',
    provider: 'openai',
    contextWindow: 8191,
    maxOutputTokens: 0,
    inputPricePerMillion: 0.02,
    outputPricePerMillion: 0,
    capabilities: ['embedding']
  },
  {
    id: 'text-embedding-3-large',
    name: 'Text Embedding 3 Large',
    provider: 'openai',
    contextWindow: 8191,
    maxOutputTokens: 0,
    inputPricePerMillion: 0.13,
    outputPricePerMillion: 0,
    capabilities: ['embedding']
  }
];

export class OpenAIProvider extends BaseAIProvider {
  private baseUrl: string;

  constructor(config: AIProviderConfig) {
    super(config, 'openai');
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  getModels(): AIModelInfo[] {
    return OPENAI_MODELS;
  }

  private convertMessage(msg: Message): OpenAIMessage {
    const openaiMsg: OpenAIMessage = {
      role: msg.role,
      content: msg.content
    };

    if (msg.name) openaiMsg.name = msg.name;
    if (msg.functionCall) {
      openaiMsg.function_call = {
        name: msg.functionCall.name,
        arguments: msg.functionCall.arguments
      };
    }
    if (msg.toolCalls) {
      openaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      }));
    }

    return openaiMsg;
  }

  private convertResponse(response: OpenAIResponse): ChatCompletionResponse {
    return {
      id: response.id,
      model: response.model,
      created: response.created,
      choices: response.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message.role as Message['role'],
          content: choice.message.content || '',
          functionCall: choice.message.function_call
            ? {
                name: choice.message.function_call.name,
                arguments: choice.message.function_call.arguments
              }
            : undefined,
          toolCalls: choice.message.tool_calls?.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments
            }
          }))
        },
        finishReason: choice.finish_reason as ChatCompletionResponse['choices'][0]['finishReason']
      })),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      }
    };
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const openaiRequest: OpenAIRequest = {
      model: request.model,
      messages: request.messages.map((m) => this.convertMessage(m)),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      frequency_penalty: request.frequencyPenalty,
      presence_penalty: request.presencePenalty,
      stop: request.stop,
      stream: false,
      user: request.user
    };

    if (request.functions) {
      openaiRequest.functions = request.functions.map((f) => ({
        name: f.name,
        description: f.description,
        parameters: f.parameters as Record<string, unknown>
      }));
    }

    if (request.tools) {
      openaiRequest.tools = request.tools.map((t) => ({
        type: t.type,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters as Record<string, unknown>
        }
      }));
    }

    if (request.responseFormat) {
      openaiRequest.response_format = request.responseFormat;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(this.config.organization && {
          'OpenAI-Organization': this.config.organization
        })
      },
      body: JSON.stringify(openaiRequest)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`
      );
    }

    const data: OpenAIResponse = await response.json();
    return this.convertResponse(data);
  }

  async *chatStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const openaiRequest: OpenAIRequest = {
      model: request.model,
      messages: request.messages.map((m) => this.convertMessage(m)),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      frequency_penalty: request.frequencyPenalty,
      presence_penalty: request.presencePenalty,
      stop: request.stop,
      stream: true,
      user: request.user
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(this.config.organization && {
          'OpenAI-Organization': this.config.organization
        })
      },
      body: JSON.stringify(openaiRequest)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          yield {
            id: json.id,
            model: json.model,
            choices: json.choices.map((c: Record<string, unknown>) => ({
              index: c.index,
              delta: {
                role: (c.delta as Record<string, unknown>)?.role,
                content: (c.delta as Record<string, unknown>)?.content
              },
              finishReason: c.finish_reason
            }))
          };
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(this.config.organization && {
          'OpenAI-Organization': this.config.organization
        })
      },
      body: JSON.stringify({
        model: request.model,
        input: request.input,
        user: request.user
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    return {
      model: data.model,
      embeddings: data.data.map((d: { embedding: number[] }) => d.embedding),
      usage: {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens
      }
    };
  }

  countTokens(text: string, _model?: string): number {
    // Approximate token count (4 chars per token is a rough estimate)
    // For production, use tiktoken library
    return Math.ceil(text.length / 4);
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(this.config.organization && {
            'OpenAI-Organization': this.config.organization
          })
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Register the provider
registerProvider('openai', (config) => new OpenAIProvider(config));

export default OpenAIProvider;
