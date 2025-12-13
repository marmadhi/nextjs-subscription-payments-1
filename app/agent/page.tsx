'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
}

interface AgentStep {
  step: string;
  message: string;
  timestamp: number;
}

interface Model {
  id: string;
  name: string;
  available: boolean;
}

interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  updated_at: string;
  total_tokens: number;
}

interface AgentConfig {
  user: { id: string; email: string };
  plan: string;
  subscription: { status: string; productName: string } | null;
  quota: {
    limits: any;
    usage: any;
    remaining: { tokens: number; callsToday: number; cost: number };
  };
  models: {
    openai: Model[];
    anthropic: Model[];
  };
  langsmith: { enabled: boolean; project: string };
}

export default function AgentPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [currentSteps, setCurrentSteps] = useState<AgentStep[]>([]);
  const [streamingContent, setStreamingContent] = useState('');

  // Model selection
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'anthropic'>('openai');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');

  // Conversation history
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load config and conversations on mount
  useEffect(() => {
    loadConfig();
    loadConversations();
  }, []);

  // Auto-scroll to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, [messages, streamingContent, autoScroll]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [inputMessage]);

  // Detect if user scrolls up to disable auto-scroll
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isNearBottom);
    }
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/ai/agent');
      if (response.status === 401) {
        router.push('/signin');
        return;
      }
      if (!response.ok) throw new Error('Failed to load agent config');

      const data = await response.json();
      setConfig(data);
      setError(null);

      // Set initial provider and model based on what's available
      const openaiModels = data.models?.openai?.filter((m: Model) => m.available) || [];
      const anthropicModels = data.models?.anthropic?.filter((m: Model) => m.available) || [];

      if (openaiModels.length > 0) {
        setSelectedProvider('openai');
        setSelectedModel(openaiModels[0].id);
      } else if (anthropicModels.length > 0) {
        setSelectedProvider('anthropic');
        setSelectedModel(anthropicModels[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/ai/conversations?limit=50');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const createConversation = async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          model: selectedModel,
          provider: selectedProvider,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentConversationId(data.conversation.id);
        setConversations(prev => [data.conversation, ...prev]);
        return data.conversation.id;
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
    return null;
  };

  const saveMessages = async (conversationId: string, newMessages: Message[]) => {
    try {
      await fetch('/api/ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addMessages',
          conversationId,
          messages: newMessages.map(m => ({
            role: m.role,
            content: m.content,
            tokens: m.tokens || 0,
          })),
        }),
      });
    } catch (err) {
      console.error('Failed to save messages:', err);
    }
  };

  const updateConversationTitle = async (conversationId: string, firstMessage: string) => {
    const title = firstMessage.length > 50
      ? firstMessage.substring(0, 47) + '...'
      : firstMessage;

    try {
      await fetch('/api/ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateTitle',
          conversationId,
          title,
        }),
      });

      setConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, title } : c)
      );
    } catch (err) {
      console.error('Failed to update conversation title:', err);
    }
  };

  const loadConversation = async (conversationId: string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/ai/conversations?id=${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentConversationId(conversationId);
        setSelectedModel(data.conversation.model);
        setSelectedProvider(data.conversation.provider);
        setMessages(
          data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.created_at),
            tokens: m.tokens,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    try {
      const response = await fetch(`/api/ai/conversations?id=${conversationId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        if (currentConversationId === conversationId) {
          setCurrentConversationId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const sendMessage = useCallback(async () => {
    if (!inputMessage.trim() || sending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    const isNewConversation = !currentConversationId && messages.length === 0;

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setSending(true);
    setCurrentSteps([]);
    setStreamingContent('');
    setError(null);
    setAutoScroll(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Create conversation if needed
    let conversationId = currentConversationId;
    if (isNewConversation) {
      conversationId = await createConversation();
      if (conversationId) {
        await updateConversationTitle(conversationId, userMessage.content);
      }
    }

    try {
      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          model: selectedModel,
          provider: selectedProvider,
        }),
      });

      if (response.status === 429) {
        const data = await response.json();
        setError(`Quota exceeded: ${data.error}. Upgrade your plan for more usage.`);
        setSending(false);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let fullContent = '';
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              switch (parsed.type) {
                case 'step':
                  setCurrentSteps(prev => [...prev, parsed]);
                  break;

                case 'token':
                  fullContent += parsed.content;
                  setStreamingContent(fullContent);
                  break;

                case 'done':
                  outputTokens = parsed.usage?.outputTokens || 0;
                  loadConfig();
                  loadConversations();
                  break;

                case 'error':
                  setError(parsed.message);
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Add assistant message
      if (fullContent) {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: fullContent,
          timestamp: new Date(),
          tokens: outputTokens,
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Save messages to conversation
        if (conversationId) {
          await saveMessages(conversationId, [userMessage, assistantMessage]);
        }
      }

      setStreamingContent('');
      setCurrentSteps([]);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [inputMessage, sending, messages, selectedModel, selectedProvider, currentConversationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setStreamingContent('');
    setCurrentSteps([]);
    setError(null);
  };

  const getAvailableModels = (): Model[] => {
    if (!config) return [];
    return config.models[selectedProvider].filter(m => m.available);
  };

  const getAvailableProviders = (): Array<{ id: 'openai' | 'anthropic'; name: string }> => {
    if (!config) return [];
    const providers: Array<{ id: 'openai' | 'anthropic'; name: string }> = [];

    if (config.models.openai.some(m => m.available)) {
      providers.push({ id: 'openai', name: 'OpenAI' });
    }
    if (config.models.anthropic.some(m => m.available)) {
      providers.push({ id: 'anthropic', name: 'Anthropic' });
    }

    return providers;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const groupConversationsByDate = () => {
    const today: Conversation[] = [];
    const yesterday: Conversation[] = [];
    const lastWeek: Conversation[] = [];
    const older: Conversation[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

    conversations.forEach(conv => {
      const date = new Date(conv.updated_at);
      if (date >= todayStart) {
        today.push(conv);
      } else if (date >= yesterdayStart) {
        yesterday.push(conv);
      } else if (date >= weekStart) {
        lastWeek.push(conv);
      } else {
        older.push(conv);
      }
    });

    return { today, yesterday, lastWeek, older };
  };

  if (loading) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  const groupedConversations = groupConversationsByDate();

  return (
    <div className="h-screen bg-zinc-950 flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-300 overflow-hidden`}
      >
        {/* Sidebar Header */}
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={startNewConversation}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto py-2">
          {loadingHistory && (
            <div className="px-3 py-2 text-zinc-500 text-sm">Loading...</div>
          )}

          {/* Today */}
          {groupedConversations.today.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">Today</div>
              {groupedConversations.today.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={currentConversationId === conv.id}
                  onClick={() => loadConversation(conv.id)}
                  onDelete={(e) => deleteConversation(conv.id, e)}
                />
              ))}
            </div>
          )}

          {/* Yesterday */}
          {groupedConversations.yesterday.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">Yesterday</div>
              {groupedConversations.yesterday.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={currentConversationId === conv.id}
                  onClick={() => loadConversation(conv.id)}
                  onDelete={(e) => deleteConversation(conv.id, e)}
                />
              ))}
            </div>
          )}

          {/* Last 7 days */}
          {groupedConversations.lastWeek.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">Previous 7 days</div>
              {groupedConversations.lastWeek.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={currentConversationId === conv.id}
                  onClick={() => loadConversation(conv.id)}
                  onDelete={(e) => deleteConversation(conv.id, e)}
                />
              ))}
            </div>
          )}

          {/* Older */}
          {groupedConversations.older.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">Older</div>
              {groupedConversations.older.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={currentConversationId === conv.id}
                  onClick={() => loadConversation(conv.id)}
                  onDelete={(e) => deleteConversation(conv.id, e)}
                />
              ))}
            </div>
          )}

          {conversations.length === 0 && !loadingHistory && (
            <div className="px-3 py-8 text-center text-zinc-500 text-sm">
              No conversations yet
            </div>
          )}
        </div>

        {/* Sidebar Footer - Navigation & Usage */}
        <div className="border-t border-zinc-800">
          {/* Navigation Links */}
          <div className="p-2 space-y-1">
            <a
              href="/"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </a>
            <a
              href="/pricing"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pricing
            </a>
            <a
              href="/account"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Account
            </a>
          </div>

          {/* Usage Stats */}
          <div className="p-3 border-t border-zinc-800">
            <div className="text-xs text-zinc-500 mb-2">Usage</div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Tokens</span>
                  <span className="text-zinc-300">{(config?.quota?.remaining?.tokens ?? 0).toLocaleString()}</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full transition-all"
                    style={{
                      width: `${config?.quota?.limits?.maxTokensPerMonth ? Math.min(100, (((config.quota.limits.maxTokensPerMonth - (config.quota.remaining?.tokens ?? 0)) / config.quota.limits.maxTokensPerMonth) * 100)) : 0}%`
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Daily calls</span>
                  <span className="text-zinc-300">{config?.quota?.remaining?.callsToday ?? 0}</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1">
                  <div
                    className="bg-emerald-500 h-1 rounded-full transition-all"
                    style={{
                      width: `${config?.quota?.limits?.maxCallsPerDay ? Math.min(100, (((config.quota.limits.maxCallsPerDay - (config.quota.remaining?.callsToday ?? 0)) / config.quota.limits.maxCallsPerDay) * 100)) : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 capitalize">{config?.plan || 'Free'} Plan</span>
                <a href="/pricing" className="text-blue-400 hover:text-blue-300">Upgrade</a>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex-shrink-0 border-b border-zinc-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              {getAvailableProviders().length > 1 ? (
                <>
                  <select
                    value={selectedProvider}
                    onChange={(e) => {
                      const newProvider = e.target.value as 'openai' | 'anthropic';
                      setSelectedProvider(newProvider);
                      const models = config?.models[newProvider].filter(m => m.available) || [];
                      if (models.length > 0) {
                        setSelectedModel(models[0].id);
                      }
                    }}
                    disabled={messages.length > 0}
                    className="bg-transparent border-none text-zinc-300 text-sm focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {getAvailableProviders().map(provider => (
                      <option key={provider.id} value={provider.id} className="bg-zinc-900">
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-zinc-600">/</span>
                </>
              ) : getAvailableProviders().length === 1 ? (
                <>
                  <span className="text-zinc-300 text-sm">{getAvailableProviders()[0].name}</span>
                  <span className="text-zinc-600">/</span>
                </>
              ) : null}
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={messages.length > 0}
                className="bg-transparent border-none text-zinc-300 text-sm focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {getAvailableModels().map(model => (
                  <option key={model.id} value={model.id} className="bg-zinc-900">
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config?.langsmith.enabled && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800/50 text-xs text-zinc-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                LangSmith
              </div>
            )}
          </div>
        </header>

        {/* Messages Area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.length === 0 && !streamingContent && (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h2 className="text-xl font-medium text-zinc-200 mb-2">How can I help you today?</h2>
                <p className="text-zinc-500 text-sm max-w-md">
                  Start a conversation with the AI assistant. Your messages are saved automatically.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className="mb-6">
                <div className={`flex gap-4 ${message.role === 'user' ? '' : ''}`}>
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-blue-600'
                      : 'bg-emerald-600'
                  }`}>
                    {message.role === 'user' ? (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-300 mb-1">
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div className="text-zinc-100 whitespace-pre-wrap break-words">
                      {message.content}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Streaming content */}
            {streamingContent && (
              <div className="mb-6">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-emerald-600">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-300 mb-1">Assistant</div>
                    <div className="text-zinc-100 whitespace-pre-wrap break-words">
                      {streamingContent}
                      <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse ml-0.5" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Agent Steps */}
            {currentSteps.length > 0 && (
              <div className="mb-6 ml-12">
                <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
                  <div className="text-xs font-medium text-zinc-500 mb-2">Processing</div>
                  <div className="space-y-1.5">
                    {currentSteps.map((step, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          index === currentSteps.length - 1
                            ? 'bg-blue-400 animate-pulse'
                            : 'bg-emerald-400'
                        }`} />
                        <span className="text-zinc-400">{step.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="px-4 pb-2">
            <div className="max-w-3xl mx-auto">
              <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-zinc-800 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative bg-zinc-900 rounded-xl border border-zinc-700 focus-within:border-zinc-500 transition-colors">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                rows={1}
                className="w-full bg-transparent px-4 py-3 pr-12 text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none max-h-[200px]"
                disabled={sending}
              />
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || sending}
                className="absolute right-2 bottom-2 p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:hover:bg-zinc-700 transition-colors"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4 text-zinc-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

// Conversation Item Component
function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete
}: {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      className={`group mx-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-zinc-800'
          : 'hover:bg-zinc-800/50'
      }`}
      onClick={onClick}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 truncate">{conversation.title || 'New conversation'}</p>
        </div>
        {showDelete && (
          <button
            onClick={onDelete}
            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
