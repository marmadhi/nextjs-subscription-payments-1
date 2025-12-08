/**
 * AI Chat API Route
 * Chat completions using LangChain with LangSmith tracing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  createChatModel,
  createTracer,
  isLangSmithEnabled,
  type ModelProvider,
} from '@/lib/ai/langchain';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const {
      messages,
      model = 'gpt-4o-mini',
      provider = 'openai',
      temperature = 0.7,
      maxTokens = 2000,
      stream = false,
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Create chat model
    const chatModel = createChatModel({
      provider: provider as ModelProvider,
      model,
      temperature,
      maxTokens,
      streaming: stream,
    });

    // Convert messages to LangChain format
    const langchainMessages = messages.map((msg: { role: string; content: string }) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        case 'user':
        default:
          return new HumanMessage(msg.content);
      }
    });

    // Create tracer for LangSmith
    const tracer = createTracer();
    const callbacks = tracer ? [tracer] : undefined;

    // Handle streaming response
    if (stream) {
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            const streamingModel = createChatModel({
              provider: provider as ModelProvider,
              model,
              temperature,
              maxTokens,
              streaming: true,
            });

            const stream = await streamingModel
              .pipe(new StringOutputParser())
              .stream(langchainMessages, { callbacks });

            for await (const chunk of stream) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`)
              );
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  error: error instanceof Error ? error.message : 'Unknown error',
                })}\n\n`
              )
            );
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const response = await chatModel.invoke(langchainMessages, { callbacks });

    return NextResponse.json({
      message: {
        role: 'assistant',
        content: response.content,
      },
      model,
      provider,
      langsmith: isLangSmithEnabled(),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check available models
export async function GET() {
  const models = {
    openai: [
      { id: 'gpt-4o', name: 'GPT-4o', available: !!process.env.OPENAI_API_KEY },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', available: !!process.env.OPENAI_API_KEY },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', available: !!process.env.OPENAI_API_KEY },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', available: !!process.env.OPENAI_API_KEY },
    ],
    anthropic: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', available: !!process.env.ANTHROPIC_API_KEY },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', available: !!process.env.ANTHROPIC_API_KEY },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', available: !!process.env.ANTHROPIC_API_KEY },
    ],
  };

  return NextResponse.json({
    models,
    langsmith: {
      enabled: isLangSmithEnabled(),
      project: process.env.LANGCHAIN_PROJECT || 'default',
    },
  });
}
