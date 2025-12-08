'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

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
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load config and conversations on mount
  useEffect(() => {
    loadConfig();
    loadConversations();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

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
        setShowHistory(false);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteConversation = async (conversationId: string) => {
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
    setShowHistory(false);
  };

  const getAvailableModels = (): Model[] => {
    if (!config) return [];
    return config.models[selectedProvider].filter(m => m.available);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading agent...</div>
      </div>
    );
  }

  return (
    <section className="min-h-screen bg-black pb-12">
      {/* Header */}
      <div className="max-w-6xl px-4 py-8 mx-auto sm:px-6 lg:px-8">
        <div className="sm:align-center sm:flex sm:flex-col">
          <h1 className="text-4xl font-extrabold text-white sm:text-center sm:text-5xl">
            AI Agent
          </h1>
          <p className="max-w-2xl m-auto mt-3 text-lg text-zinc-400 sm:text-center">
            Powered by LangGraph & LangSmith
          </p>
        </div>
      </div>

      <div className="max-w-6xl px-4 mx-auto sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Settings & Stats */}
          <div className="lg:col-span-1 space-y-4">
            {/* New Conversation Button */}
            <button
              onClick={startNewConversation}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg py-3 transition-colors"
            >
              + New Conversation
            </button>

            {/* Plan & Quota Card */}
            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
              <h3 className="text-lg font-semibold text-white mb-3">Your Plan</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Plan</span>
                  <span className="text-white font-medium capitalize">{config?.plan || 'Free'}</span>
                </div>
                {config?.subscription && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Status</span>
                    <span className="text-green-400 capitalize">{config.subscription.status}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Usage Card */}
            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
              <h3 className="text-lg font-semibold text-white mb-3">Usage</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-400">Tokens</span>
                    <span className="text-zinc-300">
                      {config?.quota.remaining.tokens.toLocaleString()} remaining
                    </span>
                  </div>
                  <div className="w-full bg-zinc-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, ((config?.quota.limits.maxTokensPerMonth - config?.quota.remaining.tokens) / config?.quota.limits.maxTokensPerMonth) * 100)}%`
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-400">Calls Today</span>
                    <span className="text-zinc-300">
                      {config?.quota.remaining.callsToday} remaining
                    </span>
                  </div>
                  <div className="w-full bg-zinc-700 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, ((config?.quota.limits.maxCallsPerDay - config?.quota.remaining.callsToday) / config?.quota.limits.maxCallsPerDay) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Model Selector */}
            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
              <h3 className="text-lg font-semibold text-white mb-3">Model</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Provider</label>
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
                    className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={messages.length > 0}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    {getAvailableModels().map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
                {messages.length > 0 && (
                  <p className="text-xs text-zinc-500">Start a new conversation to change models</p>
                )}
              </div>
            </div>

            {/* LangSmith Status */}
            {config?.langsmith.enabled && (
              <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-sm text-zinc-300">LangSmith Active</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">Project: {config.langsmith.project}</p>
              </div>
            )}

            {/* History Toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg py-2 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {showHistory ? 'Hide History' : 'Show History'} ({conversations.length})
            </button>
          </div>

          {/* Main Chat Area or History */}
          <div className="lg:col-span-3">
            {showHistory ? (
              /* Conversation History */
              <div className="border border-zinc-700 rounded-lg bg-zinc-900/50 p-4">
                <h2 className="text-xl font-semibold text-white mb-4">Conversation History</h2>
                {loadingHistory && (
                  <div className="text-center py-8 text-zinc-400">Loading...</div>
                )}
                {!loadingHistory && conversations.length === 0 && (
                  <div className="text-center py-8 text-zinc-500">
                    No conversations yet. Start a new one!
                  </div>
                )}
                <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        currentConversationId === conv.id
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-zinc-700 hover:border-zinc-500'
                      }`}
                      onClick={() => loadConversation(conv.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{conv.title}</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            {conv.model} | {formatDate(conv.updated_at)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this conversation?')) {
                              deleteConversation(conv.id);
                            }
                          }}
                          className="text-zinc-500 hover:text-red-400 p-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Chat Interface */
              <div className="border border-zinc-700 rounded-lg bg-zinc-900/50 flex flex-col h-[calc(100vh-280px)]">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 && !streamingContent && (
                    <div className="text-center text-zinc-500 py-12">
                      <p className="text-lg">Start a conversation with the AI Agent</p>
                      <p className="text-sm mt-2">Your messages will appear here</p>
                    </div>
                  )}

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-800 text-zinc-100'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className="text-xs mt-2 opacity-60">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Streaming content */}
                  {streamingContent && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg px-4 py-3 bg-zinc-800 text-zinc-100">
                        <p className="whitespace-pre-wrap">{streamingContent}</p>
                        <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1" />
                      </div>
                    </div>
                  )}

                  {/* Agent Steps */}
                  {currentSteps.length > 0 && (
                    <div className="border border-zinc-600 rounded-lg p-3 bg-zinc-800/50">
                      <p className="text-xs text-zinc-400 mb-2 font-medium">Agent Steps</p>
                      <div className="space-y-1">
                        {currentSteps.map((step, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div className={`w-2 h-2 rounded-full ${
                              index === currentSteps.length - 1
                                ? 'bg-blue-400 animate-pulse'
                                : 'bg-green-400'
                            }`} />
                            <span className="text-zinc-300">{step.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Error display */}
                {error && (
                  <div className="mx-4 mb-2 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                    {error}
                  </div>
                )}

                {/* Input Area */}
                <div className="border-t border-zinc-700 p-4">
                  <div className="flex gap-3">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                      rows={2}
                      className="flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-blue-500"
                      disabled={sending}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!inputMessage.trim() || sending}
                      loading={sending}
                      className="px-6"
                    >
                      Send
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Model: {selectedModel} | Provider: {selectedProvider}
                    {currentConversationId && ' | Saved'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
