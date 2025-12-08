/**
 * AI Agent API Route
 * LangGraph agent with streaming step-by-step feedback
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import {
  createChatModel,
  createTracer,
  isLangSmithEnabled,
  type ModelProvider,
  calculateCost,
} from '@/lib/ai/langchain';
import { QuotaManager, PLAN_LIMITS } from '@/lib/ai';
import { getSubscription } from '@/utils/supabase/queries';

// ============================================
// State Definition for Simple Agent
// ============================================

const SimpleAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (state, update) => [...state, ...update],
    default: () => [],
  }),
  currentStep: Annotation<string>({
    reducer: (_, update) => update,
    default: () => 'thinking',
  }),
  thinking: Annotation<string[]>({
    reducer: (state, update) => [...state, ...update],
    default: () => [],
  }),
  finalResponse: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  error: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

type SimpleAgentStateType = typeof SimpleAgentState.State;

// ============================================
// Helper Functions
// ============================================

function getQuotaManager() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey);
  return new QuotaManager({ supabase: supabaseAdmin });
}

function getPlanFromSubscription(subscription: any): string {
  if (!subscription) return 'free';

  // Get plan from product metadata or name
  const productName = subscription.prices?.products?.name?.toLowerCase() || '';
  const productMetadata = subscription.prices?.products?.metadata || {};

  if (productMetadata.plan) return productMetadata.plan;
  if (productName.includes('enterprise')) return 'enterprise';
  if (productName.includes('pro')) return 'pro';
  if (productName.includes('starter')) return 'starter';

  return 'free';
}

// ============================================
// Main API Handler
// ============================================

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // Helper to send SSE events
  const sendEvent = (type: string, data: any) => {
    return encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

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
      message,
      conversationHistory = [],
      model = 'gpt-4o-mini',
      provider = 'openai',
      temperature = 0.7,
      maxTokens = 2000,
      systemPrompt = 'You are a helpful AI assistant. Think step by step and explain your reasoning clearly.',
    } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Check user quota
    const quotaManager = getQuotaManager();
    const subscription = await getSubscription(supabase);
    const userPlan = getPlanFromSubscription(subscription);

    // Estimate tokens (rough estimate: 4 chars per token)
    const estimatedTokens = Math.ceil(message.length / 4) + 500;
    const estimatedCost = calculateCost(model, estimatedTokens, estimatedTokens * 2);

    const quotaCheck = await quotaManager.checkQuota(
      user.id,
      model,
      provider as any,
      estimatedTokens,
      estimatedCost
    );

    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: quotaCheck.reason || 'Quota exceeded',
          plan: userPlan,
          remaining: quotaCheck.remaining
        },
        { status: 429 }
      );
    }

    // Create streaming response
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial step
          controller.enqueue(sendEvent('step', {
            step: 'initializing',
            message: 'Initialisation de l\'agent...',
            timestamp: Date.now()
          }));

          // Create chat model
          const chatModel = createChatModel({
            provider: provider as ModelProvider,
            model,
            temperature,
            maxTokens,
            streaming: true,
          });

          // Send step: preparing context
          controller.enqueue(sendEvent('step', {
            step: 'preparing',
            message: 'Préparation du contexte...',
            timestamp: Date.now()
          }));

          // Build messages
          const langchainMessages: BaseMessage[] = [
            new SystemMessage(systemPrompt),
          ];

          // Add conversation history
          for (const msg of conversationHistory) {
            if (msg.role === 'user') {
              langchainMessages.push(new HumanMessage(msg.content));
            } else if (msg.role === 'assistant') {
              langchainMessages.push(new AIMessage(msg.content));
            }
          }

          // Add current message
          langchainMessages.push(new HumanMessage(message));

          // Send step: thinking
          controller.enqueue(sendEvent('step', {
            step: 'thinking',
            message: 'Réflexion en cours...',
            timestamp: Date.now()
          }));

          // Create tracer for LangSmith
          const tracer = createTracer();
          const callbacks = tracer ? [tracer] : undefined;

          // Track tokens
          let inputTokens = 0;
          let outputTokens = 0;
          let fullContent = '';

          // Stream the response
          controller.enqueue(sendEvent('step', {
            step: 'generating',
            message: 'Génération de la réponse...',
            timestamp: Date.now()
          }));

          const stream = await chatModel.stream(langchainMessages, { callbacks });

          for await (const chunk of stream) {
            const content = typeof chunk.content === 'string'
              ? chunk.content
              : '';

            if (content) {
              fullContent += content;
              outputTokens += Math.ceil(content.length / 4);

              controller.enqueue(sendEvent('token', {
                content,
                timestamp: Date.now()
              }));
            }
          }

          // Estimate input tokens
          inputTokens = Math.ceil(
            langchainMessages.reduce((acc, m) =>
              acc + (typeof m.content === 'string' ? m.content.length : 0), 0
            ) / 4
          );

          // Calculate actual cost
          const actualCost = calculateCost(model, inputTokens, outputTokens);

          // Record usage
          await quotaManager.recordUsage(user.id, inputTokens + outputTokens, actualCost);

          // Save to conversation history in database
          const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );

          // Log usage
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await supabaseAdmin.from('ai_usage_logs').insert({
            id: logId,
            user_id: user.id,
            provider,
            model,
            endpoint: 'chat',
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            cost: actualCost,
            latency_ms: 0,
            success: true,
            metadata: {
              conversationLength: conversationHistory.length,
              langsmith: isLangSmithEnabled(),
              type: 'agent_chat'
            }
          });

          // Send completion step
          controller.enqueue(sendEvent('step', {
            step: 'complete',
            message: 'Terminé',
            timestamp: Date.now()
          }));

          // Send final response with stats
          controller.enqueue(sendEvent('done', {
            fullContent,
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              cost: actualCost
            },
            model,
            provider,
            plan: userPlan,
            remaining: quotaCheck.remaining,
            langsmith: isLangSmithEnabled()
          }));

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

        } catch (error) {
          console.error('Agent streaming error:', error);

          controller.enqueue(sendEvent('error', {
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now()
          }));

          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// GET - Get Agent Configuration & User Info
// ============================================

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user subscription and plan
    const subscription = await getSubscription(supabase);
    const userPlan = getPlanFromSubscription(subscription);
    const planLimits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;

    // Get quota info
    const quotaManager = getQuotaManager();
    const quota = await quotaManager.getQuota(user.id);
    const usage = await quotaManager.getCurrentUsage(user.id, quota);

    // Available models based on plan
    const availableModels = {
      openai: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', available: planLimits.allowedModels.length === 0 || planLimits.allowedModels.includes('gpt-4o-mini') },
        { id: 'gpt-4o', name: 'GPT-4o', available: planLimits.allowedModels.length === 0 || planLimits.allowedModels.includes('gpt-4o') },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', available: planLimits.allowedModels.length === 0 || planLimits.allowedModels.includes('gpt-4-turbo') },
      ],
      anthropic: [
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', available: planLimits.allowedModels.length === 0 || planLimits.allowedModels.includes('claude-3-5-haiku-20241022') },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', available: planLimits.allowedModels.length === 0 || planLimits.allowedModels.includes('claude-3-5-sonnet-20241022') },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', available: planLimits.allowedModels.length === 0 || planLimits.allowedModels.includes('claude-sonnet-4-20250514') },
      ],
    };

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      plan: userPlan,
      subscription: subscription ? {
        status: subscription.status,
        productName: subscription.prices?.products?.name,
      } : null,
      quota: {
        limits: planLimits,
        usage,
        remaining: {
          tokens: Math.max(0, planLimits.maxTokensPerMonth - usage.tokensThisMonth),
          callsToday: Math.max(0, planLimits.maxCallsPerDay - usage.callsToday),
          cost: Math.max(0, planLimits.maxCostPerMonth - usage.costThisMonth),
        },
      },
      models: availableModels,
      langsmith: {
        enabled: isLangSmithEnabled(),
        project: process.env.LANGCHAIN_PROJECT || 'default',
      },
    });
  } catch (error) {
    console.error('Agent config API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
