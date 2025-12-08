/**
 * AI Chat API Route
 * Handles chat completions with usage tracking and quota management
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { AIClient } from '@/lib/ai';

// Initialize AI client
function getAIClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Create admin supabase client for tracking
  const { createClient: createAdminClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey);

  return new AIClient({
    supabase: supabaseAdmin,
    providers: {
      openai: process.env.OPENAI_API_KEY
        ? { apiKey: process.env.OPENAI_API_KEY }
        : undefined,
      anthropic: process.env.ANTHROPIC_API_KEY
        ? { apiKey: process.env.ANTHROPIC_API_KEY }
        : undefined
    },
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    enableTracking: true,
    enableQuotas: true
  });
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError
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
      stream = false
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    const aiClient = getAIClient();

    // Check quota before making the request
    const quotaCheck = await aiClient.checkQuota(user.id, model, provider);
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Quota exceeded',
          reason: quotaCheck.reason,
          remaining: quotaCheck.remaining
        },
        { status: 429 }
      );
    }

    // Handle streaming response
    if (stream) {
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            const stream = aiClient.chatStream({
              userId: user.id,
              provider,
              model,
              messages,
              temperature,
              maxTokens
            });

            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  error: error instanceof Error ? error.message : 'Unknown error'
                })}\n\n`
              )
            );
            controller.close();
          }
        }
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        }
      });
    }

    // Non-streaming response
    const response = await aiClient.chat({
      userId: user.id,
      provider,
      model,
      messages,
      temperature,
      maxTokens
    });

    return NextResponse.json({
      message: response.choices[0]?.message,
      usage: response.usage,
      model: response.model
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
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', available: !!process.env.OPENAI_API_KEY }
    ],
    anthropic: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', available: !!process.env.ANTHROPIC_API_KEY },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', available: !!process.env.ANTHROPIC_API_KEY },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', available: !!process.env.ANTHROPIC_API_KEY }
    ]
  };

  return NextResponse.json({ models });
}
