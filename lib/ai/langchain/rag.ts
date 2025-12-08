/**
 * LangChain RAG (Retrieval-Augmented Generation)
 * Document ingestion, vector storage, and retrieval
 */

import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  RunnableSequence,
  RunnablePassthrough,
} from '@langchain/core/runnables';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { SupabaseClient } from '@supabase/supabase-js';
import { createChatModel, createEmbeddings, ModelConfig } from './models';
import { createTracer } from './tracing';

// ============================================
// Types
// ============================================

export interface RAGConfig {
  supabase: SupabaseClient;
  tableName?: string;
  queryName?: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface DocumentInput {
  content: string;
  metadata?: {
    source?: string;
    title?: string;
    author?: string;
    [key: string]: unknown;
  };
}

export interface RetrievalResult {
  content: string;
  metadata: Record<string, unknown>;
  score?: number;
}

// ============================================
// RAG Pipeline Class
// ============================================

export class RAGPipeline {
  private vectorStore: SupabaseVectorStore;
  private textSplitter: RecursiveCharacterTextSplitter;
  private embeddings: ReturnType<typeof createEmbeddings>;
  private config: RAGConfig;

  constructor(config: RAGConfig) {
    this.config = config;
    this.embeddings = createEmbeddings(config.embeddingModel);

    // Initialize text splitter
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize || 1000,
      chunkOverlap: config.chunkOverlap || 200,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    });

    // Initialize vector store
    this.vectorStore = new SupabaseVectorStore(this.embeddings, {
      client: config.supabase,
      tableName: config.tableName || 'document_chunks',
      queryName: config.queryName || 'match_documents',
    });
  }

  /**
   * Ingest a single document
   */
  async ingestDocument(input: DocumentInput): Promise<string[]> {
    const docs = await this.textSplitter.createDocuments(
      [input.content],
      [input.metadata || {}]
    );

    const ids = await this.vectorStore.addDocuments(docs);
    return ids;
  }

  /**
   * Ingest multiple documents
   */
  async ingestDocuments(inputs: DocumentInput[]): Promise<string[]> {
    const allDocs: Document[] = [];

    for (const input of inputs) {
      const docs = await this.textSplitter.createDocuments(
        [input.content],
        [input.metadata || {}]
      );
      allDocs.push(...docs);
    }

    const ids = await this.vectorStore.addDocuments(allDocs);
    return ids;
  }

  /**
   * Retrieve relevant documents
   */
  async retrieve(
    query: string,
    options?: {
      k?: number;
      filter?: Record<string, unknown>;
      scoreThreshold?: number;
    }
  ): Promise<RetrievalResult[]> {
    const { k = 4, filter, scoreThreshold } = options || {};

    const results = await this.vectorStore.similaritySearchWithScore(
      query,
      k,
      filter
    );

    return results
      .filter(([_, score]) => !scoreThreshold || score >= scoreThreshold)
      .map(([doc, score]) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score,
      }));
  }

  /**
   * Create a retrieval chain for Q&A
   */
  createRetrievalChain(modelConfig: ModelConfig) {
    const model = createChatModel(modelConfig);
    const retriever = this.vectorStore.asRetriever({
      k: 4,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a helpful assistant that answers questions based on the provided context.
If the context doesn't contain enough information to answer the question, say so clearly.
Always cite the sources when using information from the context.

Context:
{context}`,
      ],
      ['human', '{question}'],
    ]);

    // Format retrieved documents
    const formatDocs = (docs: Document[]) => {
      return docs
        .map((doc, i) => {
          const source = doc.metadata.source || 'Unknown source';
          return `[${i + 1}] ${source}:\n${doc.pageContent}`;
        })
        .join('\n\n---\n\n');
    };

    const chain = RunnableSequence.from([
      {
        context: retriever.pipe(formatDocs),
        question: new RunnablePassthrough(),
      },
      prompt,
      model,
      new StringOutputParser(),
    ]);

    return chain;
  }

  /**
   * Query the RAG pipeline
   */
  async query(
    question: string,
    modelConfig: ModelConfig,
    options?: {
      includeContext?: boolean;
    }
  ): Promise<{
    answer: string;
    context?: RetrievalResult[];
  }> {
    const tracer = createTracer();
    const chain = this.createRetrievalChain(modelConfig);

    const answer = await chain.invoke(question, {
      callbacks: tracer ? [tracer] : undefined,
    });

    if (options?.includeContext) {
      const context = await this.retrieve(question);
      return { answer, context };
    }

    return { answer };
  }

  /**
   * Stream a RAG query response
   */
  async *streamQuery(
    question: string,
    modelConfig: ModelConfig
  ): AsyncGenerator<string> {
    const model = createChatModel({ ...modelConfig, streaming: true });
    const retriever = this.vectorStore.asRetriever({ k: 4 });

    // Retrieve context
    const docs = await retriever.invoke(question);
    const context = docs
      .map((doc, i) => {
        const source = doc.metadata.source || 'Unknown source';
        return `[${i + 1}] ${source}:\n${doc.pageContent}`;
      })
      .join('\n\n---\n\n');

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a helpful assistant that answers questions based on the provided context.
If the context doesn't contain enough information to answer the question, say so clearly.

Context:
${context}`,
      ],
      ['human', '{question}'],
    ]);

    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    const stream = await chain.stream({ question });

    for await (const chunk of stream) {
      yield chunk;
    }
  }

  /**
   * Delete documents by metadata filter
   */
  async deleteDocuments(filter: Record<string, unknown>): Promise<void> {
    // Note: SupabaseVectorStore doesn't have a built-in delete method
    // You may need to implement this directly via Supabase
    const { supabase, tableName } = this.config;

    let query = supabase.from(tableName || 'document_chunks').delete();

    for (const [key, value] of Object.entries(filter)) {
      query = query.eq(`metadata->>${key}`, value);
    }

    await query;
  }

  /**
   * Get the underlying vector store
   */
  getVectorStore(): SupabaseVectorStore {
    return this.vectorStore;
  }
}

// ============================================
// Conversational RAG with Memory
// ============================================

export class ConversationalRAG extends RAGPipeline {
  private conversationHistory: Map<string, Array<{ role: string; content: string }>>;

  constructor(config: RAGConfig) {
    super(config);
    this.conversationHistory = new Map();
  }

  /**
   * Query with conversation context
   */
  async conversationalQuery(
    question: string,
    modelConfig: ModelConfig,
    conversationId: string
  ): Promise<{
    answer: string;
    conversationId: string;
  }> {
    const history = this.conversationHistory.get(conversationId) || [];

    const model = createChatModel(modelConfig);
    const retriever = this.getVectorStore().asRetriever({ k: 4 });

    // Create contextualized question
    let contextualizedQuestion = question;
    if (history.length > 0) {
      const contextPrompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `Given the chat history and a follow-up question, rephrase the follow-up question to be a standalone question.`,
        ],
        ...history.map((msg) => [msg.role as 'human' | 'assistant', msg.content] as const),
        ['human', '{question}'],
      ]);

      const contextChain = contextPrompt.pipe(model).pipe(new StringOutputParser());
      contextualizedQuestion = await contextChain.invoke({ question });
    }

    // Retrieve and answer
    const docs = await retriever.invoke(contextualizedQuestion);
    const context = docs
      .map((doc, i) => `[${i + 1}] ${doc.pageContent}`)
      .join('\n\n');

    const answerPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a helpful assistant. Answer the question based on the provided context.

Context:
${context}`,
      ],
      ...history.map((msg) => [msg.role as 'human' | 'assistant', msg.content] as const),
      ['human', '{question}'],
    ]);

    const answerChain = answerPrompt.pipe(model).pipe(new StringOutputParser());
    const answer = await answerChain.invoke({ question });

    // Update history
    history.push({ role: 'human', content: question });
    history.push({ role: 'assistant', content: answer });
    this.conversationHistory.set(conversationId, history);

    return { answer, conversationId };
  }

  /**
   * Clear conversation history
   */
  clearHistory(conversationId: string): void {
    this.conversationHistory.delete(conversationId);
  }

  /**
   * Get conversation history
   */
  getHistory(conversationId: string): Array<{ role: string; content: string }> {
    return this.conversationHistory.get(conversationId) || [];
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a RAG pipeline
 */
export function createRAGPipeline(config: RAGConfig): RAGPipeline {
  return new RAGPipeline(config);
}

/**
 * Create a conversational RAG pipeline
 */
export function createConversationalRAG(config: RAGConfig): ConversationalRAG {
  return new ConversationalRAG(config);
}

export default {
  RAGPipeline,
  ConversationalRAG,
  createRAGPipeline,
  createConversationalRAG,
};
