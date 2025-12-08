/**
 * Conversations API Route
 * Manage conversation history
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// GET - List conversations or get specific conversation
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('id');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get specific conversation with messages
    if (conversationId) {
      const { data: conversation, error: convError } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single();

      if (convError || !conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }

      const { data: messages, error: msgError } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (msgError) {
        return NextResponse.json(
          { error: 'Failed to load messages' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        conversation,
        messages: messages || [],
      });
    }

    // List all conversations
    const { data: conversations, error: listError } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (listError) {
      return NextResponse.json(
        { error: 'Failed to load conversations' },
        { status: 500 }
      );
    }

    // Get total count
    const { count } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return NextResponse.json({
      conversations: conversations || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Conversations API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new conversation or add message
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, conversationId, title, model, provider, messages } = body;

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create new conversation
    if (action === 'create') {
      const id = `conv_${uuidv4()}`;

      const { data: conversation, error: createError } = await supabaseAdmin
        .from('conversations')
        .insert({
          id,
          user_id: user.id,
          title: title || 'New Conversation',
          model: model || 'gpt-4o-mini',
          provider: provider || 'openai',
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        );
      }

      return NextResponse.json({ conversation });
    }

    // Add messages to conversation
    if (action === 'addMessages' && conversationId && messages) {
      // Verify ownership
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single();

      if (!conv) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }

      // Insert messages
      const messagesToInsert = messages.map((msg: any) => ({
        id: `msg_${uuidv4()}`,
        conversation_id: conversationId,
        role: msg.role,
        content: msg.content,
        tokens: msg.tokens || 0,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('messages')
        .insert(messagesToInsert);

      if (insertError) {
        return NextResponse.json(
          { error: 'Failed to add messages' },
          { status: 500 }
        );
      }

      // Update conversation updated_at and stats
      const totalTokens = messages.reduce((sum: number, m: any) => sum + (m.tokens || 0), 0);

      await supabaseAdmin
        .from('conversations')
        .update({
          total_tokens: totalTokens,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      return NextResponse.json({ success: true });
    }

    // Update conversation title
    if (action === 'updateTitle' && conversationId && title) {
      const { error: updateError } = await supabaseAdmin
        .from('conversations')
        .update({ title })
        .eq('id', conversationId)
        .eq('user_id', user.id);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update conversation' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Conversations API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete conversation
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('id');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete conversation (messages will cascade)
    const { error: deleteError } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', user.id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete conversation' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Conversations API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
