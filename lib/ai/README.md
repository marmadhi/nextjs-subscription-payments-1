# AI SaaS Boilerplate Module

A comprehensive, production-ready AI module for building SaaS applications with AI capabilities.

## Features

- **Multi-Provider Support**: OpenAI, Anthropic, and extensible to others
- **RAG Pipeline**: Document ingestion, vector search with pgvector
- **Agent Framework**: ReAct-style agents with tool execution
- **Usage Tracking**: Detailed API call logging and cost tracking
- **Quota Management**: Plan-based limits and rate limiting
- **Benchmarking**: Compare models on performance and cost

## Quick Start

### 1. Environment Setup

Add the following to your `.env.local`:

```bash
# Required
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional
ADMIN_EMAILS=admin@example.com
```

### 2. Database Migration

Run the migration to create AI tables:

```bash
supabase db push
```

### 3. Basic Usage

```typescript
import { AIClient } from '@/lib/ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

const aiClient = new AIClient({
  supabase,
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  },
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o-mini'
});

// Simple chat completion
const response = await aiClient.chat({
  userId: 'user-123', // For tracking
  messages: [
    { role: 'user', content: 'Hello, how are you?' }
  ]
});

console.log(response.choices[0].message.content);
```

## Module Structure

```
lib/ai/
├── index.ts           # Main entry point
├── types.ts           # TypeScript definitions
├── client.ts          # Unified AI client
├── providers/         # AI provider implementations
│   ├── base.ts        # Abstract provider
│   ├── openai.ts      # OpenAI provider
│   └── anthropic.ts   # Anthropic provider
├── rag/               # RAG functionality
│   ├── vector-store.ts
│   ├── document-processor.ts
│   └── rag-pipeline.ts
├── agents/            # Agent framework
│   ├── base-agent.ts
│   └── tools.ts
├── tracking/          # Usage & quota tracking
│   ├── usage-tracker.ts
│   └── quota-manager.ts
└── benchmarks/        # Model benchmarking
    └── benchmark-runner.ts
```

## Providers

### Creating a Chat Completion

```typescript
import { createProvider } from '@/lib/ai';

const provider = createProvider('openai', {
  apiKey: process.env.OPENAI_API_KEY
});

const response = await provider.chat({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Write a haiku about coding.' }
  ],
  temperature: 0.7,
  maxTokens: 100
});
```

### Streaming Responses

```typescript
const stream = provider.chatStream({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story.' }]
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}
```

### Creating Embeddings

```typescript
const response = await provider.embed({
  model: 'text-embedding-3-small',
  input: ['Hello world', 'How are you?']
});

console.log(response.embeddings); // [[...], [...]]
```

## RAG Pipeline

### Ingesting Documents

```typescript
import { RAGPipeline } from '@/lib/ai';

const rag = new RAGPipeline({
  supabase,
  embeddingConfig: { apiKey: process.env.OPENAI_API_KEY },
  chatConfig: { apiKey: process.env.OPENAI_API_KEY },
  chatModel: 'gpt-4o-mini'
});

// Ingest a document
await rag.ingestDocument(
  'Your document content here...',
  { source: 'manual', title: 'My Document' }
);
```

### Querying with RAG

```typescript
const result = await rag.query('What is the main topic?');

console.log(result.answer);
console.log(result.context.results); // Retrieved chunks
console.log(result.usage); // Token usage
```

### Streaming RAG Queries

```typescript
const stream = rag.queryStream('Explain the key concepts.');

for await (const event of stream) {
  if (event.type === 'context') {
    console.log('Retrieved context:', event.context.results.length, 'chunks');
  } else if (event.type === 'chunk') {
    process.stdout.write(event.content);
  }
}
```

## Agent Framework

### Creating an Agent

```typescript
import { Agent, createCalculatorTool, createDateTimeTool } from '@/lib/ai';

const agent = new Agent(
  {
    name: 'assistant',
    description: 'A helpful assistant with tools',
    model: 'gpt-4o',
    systemPrompt: 'You are a helpful assistant. Use tools when needed.',
    tools: []
  },
  { apiKey: process.env.OPENAI_API_KEY },
  'openai'
);

// Register tools
agent.registerTool(createCalculatorTool());
agent.registerTool(createDateTimeTool());

// Run the agent
const execution = await agent.run('What is 15% of 847?');

console.log(execution.output); // Final answer
console.log(execution.steps);  // Step-by-step execution
console.log(execution.totalCost); // Total cost
```

### Custom Tools

```typescript
agent.registerTool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' }
    },
    required: ['city']
  },
  execute: async (input) => {
    const weather = await fetchWeather(input.city);
    return `Weather in ${input.city}: ${weather.temp}°C, ${weather.condition}`;
  }
});
```

## Usage Tracking

### Getting User Stats

```typescript
import { UsageTracker } from '@/lib/ai';

const tracker = new UsageTracker({ supabase });

// Get monthly stats
const stats = await tracker.getUserStats('user-123', 'month');
console.log(stats.totalCalls);
console.log(stats.totalCost);
console.log(stats.byModel);

// Get cost breakdown
const breakdown = await tracker.getCostBreakdown('user-123', 'month');

// Get daily usage for charts
const daily = await tracker.getDailyUsage('user-123', 30);
```

## Quota Management

### Plan Limits

```typescript
import { PLAN_LIMITS } from '@/lib/ai';

// Available plans: free, starter, pro, enterprise
console.log(PLAN_LIMITS.starter);
// {
//   maxTokensPerMonth: 500000,
//   maxCallsPerMinute: 20,
//   maxCallsPerDay: 1000,
//   maxCostPerMonth: 10,
//   allowedModels: [...],
//   allowedProviders: [...]
// }
```

### Checking Quotas

```typescript
import { QuotaManager } from '@/lib/ai';

const quotaManager = new QuotaManager({ supabase });

const check = await quotaManager.checkQuota(
  'user-123',
  'gpt-4o',
  'openai',
  1000, // estimated tokens
  0.01  // estimated cost
);

if (!check.allowed) {
  console.log('Quota exceeded:', check.reason);
}
```

### Upgrading Plans

```typescript
await quotaManager.updatePlan('user-123', 'pro');
```

## Benchmarking

### Running Benchmarks

```typescript
import { BenchmarkRunner, BENCHMARK_TESTS } from '@/lib/ai';

const runner = new BenchmarkRunner({ supabase, saveResults: true });

// Run a specific test
const result = await runner.runTest(
  BENCHMARK_TESTS[0], // General Knowledge test
  {
    provider: 'openai',
    providerConfig: { apiKey: process.env.OPENAI_API_KEY },
    model: 'gpt-4o-mini'
  }
);

console.log(result.aggregated);
// {
//   avgLatencyMs: 234,
//   avgTokensPerSecond: 45.2,
//   totalCost: 0.0042,
//   successRate: 1.0
// }
```

### Comparing Models

```typescript
const results = await runner.compareModels(
  BENCHMARK_TESTS[0],
  [
    { provider: 'openai', providerConfig: {...}, model: 'gpt-4o-mini' },
    { provider: 'anthropic', providerConfig: {...}, model: 'claude-3-5-haiku-20241022' }
  ]
);

// Generate comparison report
const report = runner.generateReport(results);
console.log(report);
```

## API Routes

### Chat Endpoint

```
POST /api/ai/chat
```

Request:
```json
{
  "messages": [{"role": "user", "content": "Hello"}],
  "model": "gpt-4o-mini",
  "provider": "openai",
  "temperature": 0.7,
  "maxTokens": 2000,
  "stream": false
}
```

### Usage Endpoint

```
GET /api/ai/usage?period=month&action=stats
GET /api/ai/usage?action=breakdown
GET /api/ai/usage?action=daily&days=30
GET /api/ai/usage?action=logs&limit=50&offset=0
```

### Quota Endpoint

```
GET /api/ai/quota
POST /api/ai/quota (check specific model/provider)
```

## Database Schema

The module adds the following tables:

- `ai_usage_logs` - API call logs with costs and tokens
- `user_quotas` - User plan limits and tracking
- `conversations` - Chat conversation history
- `messages` - Individual chat messages
- `documents` - RAG document storage
- `document_chunks` - Vector embeddings for RAG
- `agent_executions` - Agent execution history
- `benchmark_results` - Model benchmark data

## Extending

### Adding a New Provider

```typescript
import { BaseAIProvider, registerProvider } from '@/lib/ai';

class MyProvider extends BaseAIProvider {
  // Implement abstract methods
  getModels() { /* ... */ }
  async chat(request) { /* ... */ }
  async *chatStream(request) { /* ... */ }
  async embed(request) { /* ... */ }
  countTokens(text) { /* ... */ }
  async validateConnection() { /* ... */ }
}

// Register the provider
registerProvider('custom', (config) => new MyProvider(config, 'custom'));
```

### Custom Quota Plans

```typescript
import { PLAN_LIMITS } from '@/lib/ai';

// Add custom plan
PLAN_LIMITS.custom = {
  maxTokensPerMonth: 1000000,
  maxCallsPerMinute: 100,
  maxCallsPerDay: 10000,
  maxCostPerMonth: 100,
  allowedModels: ['gpt-4o', 'claude-sonnet-4-20250514'],
  allowedProviders: ['openai', 'anthropic']
};
```

## Best Practices

1. **Always use userId**: Pass the user ID to track usage and enforce quotas
2. **Check quotas first**: Call `checkQuota()` before expensive operations
3. **Handle rate limits**: Implement exponential backoff for 429 errors
4. **Monitor costs**: Use the admin dashboard to track spending
5. **Benchmark before deploying**: Test models to find the best cost/performance ratio

## License

MIT
