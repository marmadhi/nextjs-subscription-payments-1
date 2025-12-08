# LangChain AI Module

Module AI utilisant LangChain, LangGraph et LangSmith pour le boilerplate SaaS.

## Installation

```bash
npm install
```

## Configuration

### Variables d'environnement requises

Créez un fichier `.env.local` avec:

```bash
# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# LangSmith (Monitoring)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_...
LANGCHAIN_PROJECT=ai-saas-dev
```

### Obtenir les clés API

1. **OpenAI**: https://platform.openai.com/api-keys
2. **Anthropic**: https://console.anthropic.com/settings/keys
3. **LangSmith**: https://smith.langchain.com (gratuit pour commencer)

## Utilisation

### Chat simple

```typescript
import { createChatModel } from '@/lib/ai/langchain';
import { HumanMessage } from '@langchain/core/messages';

const model = createChatModel({
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
});

const response = await model.invoke([
  new HumanMessage('Bonjour, comment ça va?')
]);

console.log(response.content);
```

### Agent avec outils (LangGraph)

```typescript
import { createAssistantAgent } from '@/lib/ai/langchain';

const agent = createAssistantAgent({
  provider: 'openai',
  model: 'gpt-4o',
});

const result = await agent.invoke('Calcule 15% de 847');

console.log(result.output);
console.log(result.toolCalls); // Nombre d'appels d'outils
```

### RAG (Retrieval-Augmented Generation)

```typescript
import { createRAGPipeline } from '@/lib/ai/langchain';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

const rag = createRAGPipeline({
  supabase,
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Ingérer des documents
await rag.ingestDocument({
  content: 'Contenu de votre document...',
  metadata: { source: 'manual', title: 'Mon Doc' }
});

// Poser une question
const { answer, context } = await rag.query(
  'Quelle est la question principale?',
  { provider: 'openai', model: 'gpt-4o-mini' },
  { includeContext: true }
);
```

### Streaming

```typescript
const model = createChatModel({
  provider: 'anthropic',
  model: 'claude-3-5-haiku-20241022',
  streaming: true,
});

for await (const chunk of await model.stream([
  new HumanMessage('Raconte-moi une histoire')
])) {
  process.stdout.write(chunk.content);
}
```

## LangSmith Monitoring

Quand `LANGCHAIN_TRACING_V2=true`, toutes les traces sont automatiquement envoyées à LangSmith.

### Voir les traces

1. Allez sur https://smith.langchain.com
2. Sélectionnez votre projet
3. Explorez les traces, latences, tokens, etc.

### Ajouter du feedback

```typescript
import { logFeedback } from '@/lib/ai/langchain';

// Après avoir reçu un runId de LangSmith
await logFeedback(runId, 1.0, 'Excellente réponse');
```

## Architecture

```
lib/ai/langchain/
├── index.ts      # Point d'entrée
├── models.ts     # Configuration des modèles
├── tracing.ts    # LangSmith integration
├── agents.ts     # LangGraph agents
└── rag.ts        # RAG pipeline
```

## Modèles supportés

### OpenAI
- `gpt-4o` - Le plus capable
- `gpt-4o-mini` - Rapide et économique (recommandé)
- `gpt-4-turbo` - Bon équilibre
- `gpt-3.5-turbo` - Le plus économique

### Anthropic
- `claude-sonnet-4-20250514` - Le plus récent
- `claude-3-5-sonnet-20241022` - Très capable
- `claude-3-5-haiku-20241022` - Rapide et économique

## Pricing (USD/1M tokens)

| Modèle | Input | Output |
|--------|-------|--------|
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-4o | $2.50 | $10.00 |
| claude-3-5-haiku | $0.80 | $4.00 |
| claude-3-5-sonnet | $3.00 | $15.00 |
