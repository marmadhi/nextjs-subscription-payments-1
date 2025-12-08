-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- AI Usage Logs Table
-- Tracks all AI API calls with costs and tokens
-- ============================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'mistral', 'custom')),
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL CHECK (endpoint IN ('chat', 'completion', 'embedding')),
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for usage logs
CREATE INDEX idx_ai_usage_logs_user_id ON ai_usage_logs(user_id);
CREATE INDEX idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);
CREATE INDEX idx_ai_usage_logs_user_created ON ai_usage_logs(user_id, created_at);
CREATE INDEX idx_ai_usage_logs_provider ON ai_usage_logs(provider);
CREATE INDEX idx_ai_usage_logs_model ON ai_usage_logs(model);

-- RLS for usage logs
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage logs"
    ON ai_usage_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all usage logs"
    ON ai_usage_logs FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- User Quotas Table
-- Stores user plan limits and usage tracking
-- ============================================

CREATE TABLE IF NOT EXISTS user_quotas (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL DEFAULT 'free',
    limits JSONB NOT NULL DEFAULT '{
        "maxTokensPerMonth": 50000,
        "maxCallsPerMinute": 5,
        "maxCallsPerDay": 100,
        "maxCostPerMonth": 1,
        "allowedModels": ["gpt-4o-mini", "claude-3-haiku-20240307"],
        "allowedProviders": ["openai", "anthropic"]
    }'::jsonb,
    usage JSONB NOT NULL DEFAULT '{
        "tokensThisMonth": 0,
        "callsToday": 0,
        "callsThisMinute": 0,
        "costThisMonth": 0
    }'::jsonb,
    reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for quotas
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quota"
    ON user_quotas FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all quotas"
    ON user_quotas FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- Conversations Table
-- Stores user chat conversations
-- ============================================

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    model TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'mistral', 'custom')),
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own conversations"
    ON conversations FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- Messages Table
-- Stores conversation messages
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'function', 'tool')),
    content TEXT NOT NULL,
    name TEXT,
    function_call JSONB,
    tool_calls JSONB,
    tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(conversation_id, created_at);

-- RLS (inherits from conversation ownership)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage messages in own conversations"
    ON messages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

-- ============================================
-- Documents Table
-- Stores documents for RAG
-- ============================================

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_source ON documents(source);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own documents"
    ON documents FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- Document Chunks Table
-- Stores document chunks with embeddings for vector search
-- ============================================

CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI ada-002 / text-embedding-3-small dimension
    metadata JSONB DEFAULT '{}',
    start_index INTEGER NOT NULL DEFAULT 0,
    end_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);

-- Vector similarity search index
CREATE INDEX idx_document_chunks_embedding ON document_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- RLS (inherits from document ownership)
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage chunks of own documents"
    ON document_chunks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM documents
            WHERE documents.id = document_chunks.document_id
            AND documents.user_id = auth.uid()
        )
    );

-- ============================================
-- Agent Executions Table
-- Stores agent execution history
-- ============================================

CREATE TABLE IF NOT EXISTS agent_executions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT,
    steps JSONB DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('idle', 'thinking', 'executing', 'completed', 'error')),
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_executions_user_id ON agent_executions(user_id);
CREATE INDEX idx_agent_executions_created_at ON agent_executions(created_at);
CREATE INDEX idx_agent_executions_agent_name ON agent_executions(agent_name);

-- RLS
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own agent executions"
    ON agent_executions FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- Benchmark Results Table
-- Stores model benchmark results
-- ============================================

CREATE TABLE IF NOT EXISTS benchmark_results (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    test_id TEXT NOT NULL,
    test_name TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'mistral', 'custom')),
    results JSONB NOT NULL DEFAULT '[]',
    aggregated JSONB NOT NULL DEFAULT '{}',
    run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_benchmark_results_model ON benchmark_results(model);
CREATE INDEX idx_benchmark_results_test_id ON benchmark_results(test_id);
CREATE INDEX idx_benchmark_results_run_at ON benchmark_results(run_at);

-- RLS
ALTER TABLE benchmark_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view benchmark results"
    ON benchmark_results FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create benchmark results"
    ON benchmark_results FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can delete own benchmark results"
    ON benchmark_results FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- Vector Search Function
-- RPC function for similarity search
-- ============================================

CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_metadata JSONB DEFAULT '{}'
)
RETURNS TABLE (
    id TEXT,
    document_id TEXT,
    content TEXT,
    embedding vector(1536),
    metadata JSONB,
    start_index INT,
    end_index INT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.embedding,
        dc.metadata,
        dc.start_index,
        dc.end_index,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE
        d.user_id = auth.uid()
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
        AND (
            filter_metadata = '{}'::jsonb
            OR dc.metadata @> filter_metadata
        )
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_quotas_updated_at
    BEFORE UPDATE ON user_quotas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Auto-create quota on user creation
-- ============================================

CREATE OR REPLACE FUNCTION create_user_quota()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_quotas (user_id, plan_id)
    VALUES (NEW.id, 'free')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_quota
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_quota();
