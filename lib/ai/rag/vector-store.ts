/**
 * Vector Store Implementation
 * Uses Supabase with pgvector for document storage and similarity search
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Document, DocumentChunk, SearchResult, EmbeddingResponse } from '../types';
import { createProvider } from '../providers';
import type { AIProviderConfig } from '../types';

export interface VectorStoreConfig {
  supabase: SupabaseClient;
  tableName?: string;
  embeddingModel?: string;
  embeddingProvider?: 'openai';
  embeddingConfig?: AIProviderConfig;
  dimensions?: number;
}

export class VectorStore {
  private supabase: SupabaseClient;
  private tableName: string;
  private embeddingModel: string;
  private embeddingProvider: 'openai';
  private embeddingConfig?: AIProviderConfig;
  private dimensions: number;

  constructor(config: VectorStoreConfig) {
    this.supabase = config.supabase;
    this.tableName = config.tableName || 'document_chunks';
    this.embeddingModel = config.embeddingModel || 'text-embedding-3-small';
    this.embeddingProvider = config.embeddingProvider || 'openai';
    this.embeddingConfig = config.embeddingConfig;
    this.dimensions = config.dimensions || 1536;
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingConfig) {
      throw new Error('Embedding config is required');
    }

    const provider = createProvider(this.embeddingProvider, this.embeddingConfig);
    const response: EmbeddingResponse = await provider.embed({
      model: this.embeddingModel,
      input: text
    });

    return response.embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.embeddingConfig) {
      throw new Error('Embedding config is required');
    }

    const provider = createProvider(this.embeddingProvider, this.embeddingConfig);
    const response: EmbeddingResponse = await provider.embed({
      model: this.embeddingModel,
      input: texts
    });

    return response.embeddings;
  }

  /**
   * Add a document chunk to the vector store
   */
  async addChunk(chunk: Omit<DocumentChunk, 'embedding'>, embedding?: number[]): Promise<string> {
    const vectorEmbedding = embedding || (await this.generateEmbedding(chunk.content));

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        id: chunk.id,
        document_id: chunk.documentId,
        content: chunk.content,
        embedding: vectorEmbedding,
        metadata: chunk.metadata,
        start_index: chunk.startIndex,
        end_index: chunk.endIndex
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to add chunk: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Add multiple document chunks
   */
  async addChunks(
    chunks: Omit<DocumentChunk, 'embedding'>[],
    embeddings?: number[][]
  ): Promise<string[]> {
    const vectorEmbeddings =
      embeddings || (await this.generateEmbeddings(chunks.map((c) => c.content)));

    const records = chunks.map((chunk, i) => ({
      id: chunk.id,
      document_id: chunk.documentId,
      content: chunk.content,
      embedding: vectorEmbeddings[i],
      metadata: chunk.metadata,
      start_index: chunk.startIndex,
      end_index: chunk.endIndex
    }));

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(records)
      .select('id');

    if (error) {
      throw new Error(`Failed to add chunks: ${error.message}`);
    }

    return data.map((d) => d.id);
  }

  /**
   * Search for similar documents
   */
  async search(
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      filter?: Record<string, unknown>;
    } = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7, filter } = options;

    const queryEmbedding = await this.generateEmbedding(query);

    // Use Supabase RPC for vector similarity search
    const { data, error } = await this.supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_metadata: filter || {}
    });

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    return data.map(
      (row: {
        id: string;
        document_id: string;
        content: string;
        embedding: number[];
        metadata: Record<string, unknown>;
        start_index: number;
        end_index: number;
        similarity: number;
      }) => ({
        chunk: {
          id: row.id,
          documentId: row.document_id,
          content: row.content,
          embedding: row.embedding,
          metadata: row.metadata as DocumentChunk['metadata'],
          startIndex: row.start_index,
          endIndex: row.end_index
        },
        score: row.similarity,
        distance: 1 - row.similarity
      })
    );
  }

  /**
   * Delete chunks by document ID
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('document_id', documentId);

    if (error) {
      throw new Error(`Failed to delete chunks: ${error.message}`);
    }
  }

  /**
   * Delete a specific chunk
   */
  async deleteChunk(chunkId: string): Promise<void> {
    const { error } = await this.supabase.from(this.tableName).delete().eq('id', chunkId);

    if (error) {
      throw new Error(`Failed to delete chunk: ${error.message}`);
    }
  }

  /**
   * Get chunk by ID
   */
  async getChunk(chunkId: string): Promise<DocumentChunk | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', chunkId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get chunk: ${error.message}`);
    }

    return {
      id: data.id,
      documentId: data.document_id,
      content: data.content,
      embedding: data.embedding,
      metadata: data.metadata,
      startIndex: data.start_index,
      endIndex: data.end_index
    };
  }

  /**
   * Get all chunks for a document
   */
  async getChunksByDocumentId(documentId: string): Promise<DocumentChunk[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('document_id', documentId)
      .order('start_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to get chunks: ${error.message}`);
    }

    return data.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      embedding: row.embedding,
      metadata: row.metadata,
      startIndex: row.start_index,
      endIndex: row.end_index
    }));
  }

  /**
   * Update chunk metadata
   */
  async updateChunkMetadata(
    chunkId: string,
    metadata: Partial<DocumentChunk['metadata']>
  ): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({ metadata })
      .eq('id', chunkId);

    if (error) {
      throw new Error(`Failed to update metadata: ${error.message}`);
    }
  }
}

export default VectorStore;
