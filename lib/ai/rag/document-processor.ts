/**
 * Document Processor
 * Utilities for processing and chunking documents for RAG
 */

import type { Document, DocumentChunk, DocumentMetadata } from '../types';

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  trimWhitespace?: boolean;
}

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

/**
 * Split text by a list of separators, trying each in order
 */
function splitBySeparators(text: string, separators: string[]): string[] {
  if (separators.length === 0) {
    return [text];
  }

  const [separator, ...restSeparators] = separators;

  if (separator === '') {
    // Split by character
    return text.split('');
  }

  const splits = text.split(separator);

  if (splits.length === 1) {
    // Separator not found, try next
    return splitBySeparators(text, restSeparators);
  }

  // Rejoin with separator to preserve it
  return splits.map((s, i) => (i < splits.length - 1 ? s + separator : s));
}

/**
 * Recursive text splitter for creating document chunks
 */
export function splitText(text: string, options: ChunkingOptions = {}): string[] {
  const {
    chunkSize = 1000,
    chunkOverlap = 200,
    separators = DEFAULT_SEPARATORS,
    trimWhitespace = true
  } = options;

  const chunks: string[] = [];
  let currentChunk = '';

  const splits = splitBySeparators(text, separators);

  for (const split of splits) {
    const potentialChunk = currentChunk + split;

    if (potentialChunk.length <= chunkSize) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk) {
        chunks.push(trimWhitespace ? currentChunk.trim() : currentChunk);
      }

      // Handle overlap
      if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
        currentChunk = currentChunk.slice(-chunkOverlap) + split;
      } else {
        currentChunk = split;
      }

      // If single split is larger than chunk size, split it further
      while (currentChunk.length > chunkSize) {
        const chunk = currentChunk.slice(0, chunkSize);
        chunks.push(trimWhitespace ? chunk.trim() : chunk);
        currentChunk = currentChunk.slice(chunkSize - chunkOverlap);
      }
    }
  }

  if (currentChunk) {
    chunks.push(trimWhitespace ? currentChunk.trim() : currentChunk);
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Process a document into chunks
 */
export function processDocument(
  document: Document,
  options: ChunkingOptions = {}
): DocumentChunk[] {
  const textChunks = splitText(document.content, options);
  let currentIndex = 0;

  return textChunks.map((content, index) => {
    const startIndex = currentIndex;
    const endIndex = startIndex + content.length;
    currentIndex = endIndex;

    return {
      id: generateId(),
      documentId: document.id,
      content,
      embedding: [], // Will be filled by vector store
      metadata: {
        ...document.metadata,
        chunkIndex: index,
        totalChunks: textChunks.length
      },
      startIndex,
      endIndex
    };
  });
}

/**
 * Create a document from text content
 */
export function createDocument(
  content: string,
  metadata: Partial<DocumentMetadata> = {}
): Document {
  return {
    id: generateId(),
    content,
    metadata: {
      source: metadata.source || 'unknown',
      title: metadata.title,
      author: metadata.author,
      createdAt: metadata.createdAt || new Date(),
      updatedAt: metadata.updatedAt || new Date(),
      ...metadata
    }
  };
}

/**
 * Estimate token count for text (approximate)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Extract text from common file formats
 * Note: For production, you'd want to use proper parsers for each format
 */
export async function extractText(
  content: string | Buffer,
  mimeType: string
): Promise<string> {
  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown':
    case 'text/csv':
      return typeof content === 'string' ? content : content.toString('utf-8');

    case 'application/json':
      try {
        const json = JSON.parse(
          typeof content === 'string' ? content : content.toString('utf-8')
        );
        return JSON.stringify(json, null, 2);
      } catch {
        return typeof content === 'string' ? content : content.toString('utf-8');
      }

    case 'text/html':
      // Basic HTML text extraction - in production, use a proper HTML parser
      const html = typeof content === 'string' ? content : content.toString('utf-8');
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    default:
      // For unsupported formats, return as string if possible
      if (typeof content === 'string') {
        return content;
      }
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

/**
 * Merge overlapping chunks back into continuous text
 */
export function mergeChunks(chunks: DocumentChunk[]): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1) return chunks[0].content;

  // Sort by start index
  const sorted = [...chunks].sort((a, b) => a.startIndex - b.startIndex);

  let result = sorted[0].content;
  let currentEnd = sorted[0].endIndex;

  for (let i = 1; i < sorted.length; i++) {
    const chunk = sorted[i];
    if (chunk.startIndex >= currentEnd) {
      // No overlap
      result += chunk.content;
    } else {
      // Has overlap - only add non-overlapping part
      const overlap = currentEnd - chunk.startIndex;
      if (overlap < chunk.content.length) {
        result += chunk.content.slice(overlap);
      }
    }
    currentEnd = Math.max(currentEnd, chunk.endIndex);
  }

  return result;
}

export default {
  splitText,
  processDocument,
  createDocument,
  estimateTokens,
  extractText,
  mergeChunks
};
