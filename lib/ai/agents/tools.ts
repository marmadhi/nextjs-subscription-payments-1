/**
 * Built-in Agent Tools
 * Common tools that can be used by agents
 */

import type { ToolHandler } from './base-agent';

/**
 * Web Search Tool
 * Searches the web for information
 */
export function createWebSearchTool(
  searchFn: (query: string) => Promise<Array<{ title: string; url: string; snippet: string }>>
): ToolHandler {
  return {
    name: 'web_search',
    description: 'Search the web for current information. Use this when you need up-to-date information or facts.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        }
      },
      required: ['query']
    },
    execute: async (input) => {
      const results = await searchFn(input.query as string);
      return results
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
        .join('\n\n');
    }
  };
}

/**
 * Calculator Tool
 * Performs mathematical calculations
 */
export function createCalculatorTool(): ToolHandler {
  return {
    name: 'calculator',
    description: 'Perform mathematical calculations. Supports basic arithmetic and common math functions.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(3.14159/2)")'
        }
      },
      required: ['expression']
    },
    execute: async (input) => {
      try {
        const expression = input.expression as string;
        // Safe math evaluation using Function constructor
        // Only allow basic math operations
        const sanitized = expression.replace(
          /[^0-9+\-*/%().sqrt|sin|cos|tan|log|exp|pow|abs|ceil|floor|round|min|max|PI|E\s,]/g,
          ''
        );

        const mathFns = `
          const sqrt = Math.sqrt;
          const sin = Math.sin;
          const cos = Math.cos;
          const tan = Math.tan;
          const log = Math.log;
          const exp = Math.exp;
          const pow = Math.pow;
          const abs = Math.abs;
          const ceil = Math.ceil;
          const floor = Math.floor;
          const round = Math.round;
          const min = Math.min;
          const max = Math.max;
          const PI = Math.PI;
          const E = Math.E;
        `;

        const result = new Function(`${mathFns}; return (${sanitized})`)();
        return `Result: ${result}`;
      } catch (error) {
        return `Error: Unable to calculate "${input.expression}". ${error instanceof Error ? error.message : ''}`;
      }
    }
  };
}

/**
 * Date/Time Tool
 * Gets current date and time information
 */
export function createDateTimeTool(): ToolHandler {
  return {
    name: 'get_datetime',
    description: 'Get the current date and time. Can return in different formats and timezones.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'The timezone (e.g., "America/New_York", "Europe/London", "UTC"). Default is UTC.'
        },
        format: {
          type: 'string',
          enum: ['iso', 'date', 'time', 'full'],
          description: 'Output format: iso (ISO 8601), date (date only), time (time only), full (human readable)'
        }
      },
      required: []
    },
    execute: async (input) => {
      const timezone = (input.timezone as string) || 'UTC';
      const format = (input.format as string) || 'full';

      try {
        const date = new Date();
        const options: Intl.DateTimeFormatOptions = { timeZone: timezone };

        switch (format) {
          case 'iso':
            return date.toISOString();
          case 'date':
            return date.toLocaleDateString('en-US', { ...options, dateStyle: 'full' });
          case 'time':
            return date.toLocaleTimeString('en-US', { ...options, timeStyle: 'long' });
          case 'full':
          default:
            return date.toLocaleString('en-US', {
              ...options,
              dateStyle: 'full',
              timeStyle: 'long'
            });
        }
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Invalid timezone'}`;
      }
    }
  };
}

/**
 * JSON Parser Tool
 * Parses and extracts data from JSON
 */
export function createJSONParserTool(): ToolHandler {
  return {
    name: 'parse_json',
    description: 'Parse JSON and extract specific fields using a path (e.g., "user.name", "items[0].price")',
    parameters: {
      type: 'object',
      properties: {
        json: {
          type: 'string',
          description: 'The JSON string to parse'
        },
        path: {
          type: 'string',
          description: 'Optional path to extract (e.g., "user.name", "items[0]"). If not provided, returns the full parsed object.'
        }
      },
      required: ['json']
    },
    execute: async (input) => {
      try {
        const data = JSON.parse(input.json as string);
        const path = input.path as string | undefined;

        if (!path) {
          return JSON.stringify(data, null, 2);
        }

        // Navigate the path
        const parts = path.split(/[.[\]]+/).filter(Boolean);
        let current = data;

        for (const part of parts) {
          if (current === undefined || current === null) {
            return `Path not found: ${path}`;
          }
          current = current[part];
        }

        if (typeof current === 'object') {
          return JSON.stringify(current, null, 2);
        }
        return String(current);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Invalid JSON'}`;
      }
    }
  };
}

/**
 * HTTP Request Tool
 * Makes HTTP requests to APIs
 */
export function createHTTPTool(
  allowedDomains?: string[]
): ToolHandler {
  return {
    name: 'http_request',
    description: 'Make HTTP requests to APIs. Supports GET and POST methods.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to request'
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST'],
          description: 'HTTP method (default: GET)'
        },
        headers: {
          type: 'object',
          description: 'Optional headers as key-value pairs'
        },
        body: {
          type: 'string',
          description: 'Optional request body (for POST)'
        }
      },
      required: ['url']
    },
    execute: async (input) => {
      try {
        const url = new URL(input.url as string);

        // Check allowed domains
        if (allowedDomains && !allowedDomains.includes(url.hostname)) {
          return `Error: Domain ${url.hostname} is not allowed`;
        }

        const response = await fetch(url.toString(), {
          method: (input.method as string) || 'GET',
          headers: (input.headers as Record<string, string>) || {},
          body: input.body as string | undefined
        });

        const contentType = response.headers.get('content-type') || '';
        let responseText: string;

        if (contentType.includes('application/json')) {
          const json = await response.json();
          responseText = JSON.stringify(json, null, 2);
        } else {
          responseText = await response.text();
        }

        // Truncate if too long
        if (responseText.length > 4000) {
          responseText = responseText.slice(0, 4000) + '\n... (truncated)';
        }

        return `Status: ${response.status}\n\n${responseText}`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Request failed'}`;
      }
    }
  };
}

/**
 * RAG Search Tool
 * Searches the RAG vector store
 */
export function createRAGSearchTool(
  searchFn: (query: string, limit?: number) => Promise<Array<{ content: string; source: string; score: number }>>
): ToolHandler {
  return {
    name: 'search_documents',
    description: 'Search the knowledge base for relevant information. Use this when you need specific information from documents.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 5)'
        }
      },
      required: ['query']
    },
    execute: async (input) => {
      const results = await searchFn(input.query as string, (input.limit as number) || 5);

      if (results.length === 0) {
        return 'No relevant documents found.';
      }

      return results
        .map(
          (r, i) =>
            `[${i + 1}] Source: ${r.source} (Score: ${(r.score * 100).toFixed(1)}%)\n${r.content}`
        )
        .join('\n\n---\n\n');
    }
  };
}

/**
 * Code Executor Tool
 * Executes JavaScript code in a sandboxed environment
 * WARNING: Use with caution - this can be a security risk
 */
export function createCodeExecutorTool(timeout = 5000): ToolHandler {
  return {
    name: 'execute_code',
    description: 'Execute JavaScript code. Returns the result of the last expression. Use for calculations and data processing.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The JavaScript code to execute'
        }
      },
      required: ['code']
    },
    execute: async (input) => {
      try {
        const code = input.code as string;

        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Execution timeout')), timeout);
        });

        // Execute with timeout
        const executionPromise = new Promise<string>((resolve, reject) => {
          try {
            // Wrap in async function to support await
            const wrappedCode = `
              (async () => {
                ${code}
              })()
            `;

            const result = eval(wrappedCode);

            // Handle promise results
            if (result instanceof Promise) {
              result.then(
                (r) => resolve(typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r)),
                (e) => reject(e)
              );
            } else {
              resolve(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
            }
          } catch (error) {
            reject(error);
          }
        });

        const result = await Promise.race([executionPromise, timeoutPromise]);
        return `Result:\n${result}`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Execution failed'}`;
      }
    }
  };
}

export default {
  createWebSearchTool,
  createCalculatorTool,
  createDateTimeTool,
  createJSONParserTool,
  createHTTPTool,
  createRAGSearchTool,
  createCodeExecutorTool
};
