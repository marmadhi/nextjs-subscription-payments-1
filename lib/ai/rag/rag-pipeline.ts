/**
 * RAG Pipeline
 * Complete Retrieval-Augmented Generation pipeline
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Document,
  DocumentChunk,
  SearchResult,
  RAGContext,
  Message,
  ChatCompletionResponse,
  AIProviderConfig,
  AIProviderType
} from '../types';
import { VectorStore } from './vector-store';
import { processDocument, createDocument, estimateTokens, type ChunkingOptions } from './document-processor';
import { createProvider } from '../providers';

export interface RAGPipelineConfig {
  supabase: SupabaseClient;
  embeddingConfig: AIProviderConfig;
  chatConfig: AIProviderConfig;
  chatProvider?: AIProviderType;
  chatModel?: string;
  embeddingModel?: string;
  chunkingOptions?: ChunkingOptions;
  maxContextTokens?: number;
  searchLimit?: number;
  searchThreshold?: number;
}

export interface RAGQueryOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  includeSourceReferences?: boolean;
  filter?: Record<string, unknown>;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context.
If the context doesn't contain relevant information to answer the question, say so clearly.
Always cite the sources when using information from the context.`;

export class RAGPipeline {
  private vectorStore: VectorStore;
  private chatConfig: AIProviderConfig;
  private chatProvider: AIProviderType;
  private chatModel: string;
  private chunkingOptions: ChunkingOptions;
  private maxContextTokens: number;
  private searchLimit: number;
  private searchThreshold: number;

  constructor(config: RAGPipelineConfig) {
    this.vectorStore = new VectorStore({
      supabase: config.supabase,
      embeddingModel: config.embeddingModel || 'text-embedding-3-small',
      embeddingConfig: config.embeddingConfig
    });

    this.chatConfig = config.chatConfig;
    this.chatProvider = config.chatProvider || 'openai';
    this.chatModel = config.chatModel || 'gpt-4o-mini';
    this.chunkingOptions = config.chunkingOptions || { chunkSize: 1000, chunkOverlap: 200 };
    this.maxContextTokens = config.maxContextTokens || 4000;
    this.searchLimit = config.searchLimit || 10;
    this.searchThreshold = config.searchThreshold || 0.7;
  }

  /**
   * Ingest a document into the RAG system
   */
  async ingestDocument(
    content: string,
    metadata: Partial<Document['metadata']> = {}
  ): Promise<{ documentId: string; chunkCount: number }> {
    const document = createDocument(content, metadata);
    const chunks = processDocument(document, this.chunkingOptions);

    await this.vectorStore.addChunks(
      chunks.map((c) => ({
        id: c.id,
        documentId: c.documentId,
        content: c.content,
        metadata: c.metadata,
        startIndex: c.startIndex,
        endIndex: c.endIndex
      }))
    );

    return {
      documentId: document.id,
      chunkCount: chunks.length
    };
  }

  /**
   * Ingest multiple documents
   */
  async ingestDocuments(
    documents: Array<{ content: string; metadata?: Partial<Document['metadata']> }>
  ): Promise<Array<{ documentId: string; chunkCount: number }>> {
    const results = [];

    for (const doc of documents) {
      const result = await this.ingestDocument(doc.content, doc.metadata);
      results.push(result);
    }

    return results;
  }

  /**
   * Retrieve relevant context for a query
   */
  async retrieve(
    query: string,
    options: { limit?: number; threshold?: number; filter?: Record<string, unknown> } = {}
  ): Promise<RAGContext> {
    const { limit = this.searchLimit, threshold = this.searchThreshold, filter } = options;

    const results = await this.vectorStore.search(query, { limit, threshold, filter });

    // Calculate total tokens and trim if necessary
    let totalTokens = 0;
    const selectedResults: SearchResult[] = [];

    for (const result of results) {
      const tokens = estimateTokens(result.chunk.content);
      if (totalTokens + tokens <= this.maxContextTokens) {
        selectedResults.push(result);
        totalTokens += tokens;
      } else {
        break;
      }
    }

    return {
      query,
      results: selectedResults,
      totalTokens
    };
  }

  /**
   * Format context for the LLM
   */
  private formatContext(context: RAGContext, includeReferences: boolean): string {
    if (context.results.length === 0) {
      return 'No relevant context found.';
    }

    return context.results
      .map((result, index) => {
        const source = result.chunk.metadata.source || 'Unknown source';
        const title = result.chunk.metadata.title || '';
        const header = includeReferences
          ? `[Source ${index + 1}: ${title ? `${title} - ` : ''}${source}]`
          : '';

        return `${header}\n${result.chunk.content}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Query the RAG system
   */
  async query(
    query: string,
    options: RAGQueryOptions = {}
  ): Promise<{
    answer: string;
    context: RAGContext;
    usage: ChatCompletionResponse['usage'];
  }> {
    const {
      systemPrompt = DEFAULT_SYSTEM_PROMPT,
      temperature = 0.7,
      maxTokens = 2000,
      includeSourceReferences = true,
      filter
    } = options;

    // Retrieve relevant context
    const context = await this.retrieve(query, { filter });

    // Format the context
    const formattedContext = this.formatContext(context, includeSourceReferences);

    // Build messages
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Context:\n${formattedContext}\n\n---\n\nQuestion: ${query}`
      }
    ];

    // Get response from LLM
    const provider = createProvider(this.chatProvider, this.chatConfig);
    const response = await provider.chat({
      model: this.chatModel,
      messages,
      temperature,
      maxTokens
    });

    const answer = response.choices[0]?.message.content || '';

    // Append source references if requested
    let finalAnswer = answer;
    if (includeSourceReferences && context.results.length > 0) {
      const sources = context.results
        .map((r, i) => {
          const title = r.chunk.metadata.title || r.chunk.metadata.source;
          return `${i + 1}. ${title}`;
        })
        .join('\n');

      if (!answer.toLowerCase().includes('source')) {
        finalAnswer = `${answer}\n\n**Sources:**\n${sources}`;
      }
    }

    return {
      answer: finalAnswer,
      context,
      usage: response.usage
    };
  }

  /**
   * Stream a RAG query response
   */
  async *queryStream(
    query: string,
    options: RAGQueryOptions = {}
  ): AsyncGenerator<
    { type: 'context'; context: RAGContext } | { type: 'chunk'; content: string },
    void,
    unknown
  > {
    const {
      systemPrompt = DEFAULT_SYSTEM_PROMPT,
      temperature = 0.7,
      maxTokens = 2000,
      includeSourceReferences = true,
      filter
    } = options;

    // Retrieve relevant context
    const context = await this.retrieve(query, { filter });
    yield { type: 'context', context };

    // Format the context
    const formattedContext = this.formatContext(context, includeSourceReferences);

    // Build messages
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Context:\n${formattedContext}\n\n---\n\nQuestion: ${query}`
      }
    ];

    // Stream response from LLM
    const provider = createProvider(this.chatProvider, this.chatConfig);
    const stream = provider.chatStream({
      model: this.chatModel,
      messages,
      temperature,
      maxTokens
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta.content;
      if (content) {
        yield { type: 'chunk', content };
      }
    }
  }

  /**
   * Delete a document and all its chunks
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.vectorStore.deleteByDocumentId(documentId);
  }

  /**
   * Get document chunks
   */
  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    return this.vectorStore.getChunksByDocumentId(documentId);
  }

  /**
   * Get the underlying vector store for advanced operations
   */
  getVectorStore(): VectorStore {
    return this.vectorStore;
  }
}

export default RAGPipeline;
