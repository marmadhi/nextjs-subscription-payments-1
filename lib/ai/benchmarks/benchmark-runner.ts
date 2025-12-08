/**
 * Benchmark Runner
 * Run benchmarks to compare AI models on performance and cost
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BenchmarkTest,
  BenchmarkPrompt,
  BenchmarkResult,
  PromptResult,
  AggregatedMetrics,
  AIProviderType,
  AIProviderConfig,
  AIModelInfo
} from '../types';
import { createProvider } from '../providers';

export interface BenchmarkConfig {
  supabase?: SupabaseClient;
  tableName?: string;
  saveResults?: boolean;
}

export interface ModelConfig {
  provider: AIProviderType;
  providerConfig: AIProviderConfig;
  model: string;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Pre-built benchmark tests
 */
export const BENCHMARK_TESTS: BenchmarkTest[] = [
  {
    id: 'general-knowledge',
    name: 'General Knowledge',
    description: 'Tests general knowledge and factual accuracy',
    prompts: [
      {
        id: 'gk-1',
        userPrompt: 'What is the capital of France?',
        expectedOutput: 'Paris',
        category: 'geography'
      },
      {
        id: 'gk-2',
        userPrompt: 'Who wrote "Romeo and Juliet"?',
        expectedOutput: 'William Shakespeare',
        category: 'literature'
      },
      {
        id: 'gk-3',
        userPrompt: 'What is the chemical symbol for gold?',
        expectedOutput: 'Au',
        category: 'science'
      },
      {
        id: 'gk-4',
        userPrompt: 'In what year did World War II end?',
        expectedOutput: '1945',
        category: 'history'
      },
      {
        id: 'gk-5',
        userPrompt: 'What is the largest planet in our solar system?',
        expectedOutput: 'Jupiter',
        category: 'astronomy'
      }
    ],
    metrics: ['latency', 'tokens_per_second', 'cost', 'accuracy']
  },
  {
    id: 'code-generation',
    name: 'Code Generation',
    description: 'Tests code generation capabilities',
    prompts: [
      {
        id: 'code-1',
        userPrompt: 'Write a Python function that calculates the factorial of a number.',
        category: 'python'
      },
      {
        id: 'code-2',
        userPrompt: 'Write a JavaScript function that reverses a string.',
        category: 'javascript'
      },
      {
        id: 'code-3',
        userPrompt: 'Write a SQL query to find the top 5 customers by total order value.',
        category: 'sql'
      },
      {
        id: 'code-4',
        userPrompt: 'Write a TypeScript interface for a User object with id, name, email, and createdAt fields.',
        category: 'typescript'
      },
      {
        id: 'code-5',
        userPrompt: 'Write a bash script that finds all .txt files in a directory and counts the total lines.',
        category: 'bash'
      }
    ],
    metrics: ['latency', 'tokens_per_second', 'cost', 'coherence']
  },
  {
    id: 'reasoning',
    name: 'Reasoning & Logic',
    description: 'Tests logical reasoning and problem-solving',
    prompts: [
      {
        id: 'reason-1',
        userPrompt:
          'If all roses are flowers and some flowers fade quickly, can we conclude that some roses fade quickly? Explain your reasoning.',
        category: 'logic'
      },
      {
        id: 'reason-2',
        userPrompt:
          'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?',
        expectedOutput: '$0.05',
        category: 'math'
      },
      {
        id: 'reason-3',
        userPrompt:
          'There are 3 boxes. One contains only apples, one contains only oranges, and one contains both. The boxes are labeled incorrectly. You can pick one fruit from one box. How can you determine the contents of all boxes?',
        category: 'puzzle'
      },
      {
        id: 'reason-4',
        userPrompt:
          'If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?',
        expectedOutput: '5 minutes',
        category: 'math'
      },
      {
        id: 'reason-5',
        userPrompt:
          'A farmer has 17 sheep. All but 9 die. How many sheep are left?',
        expectedOutput: '9',
        category: 'logic'
      }
    ],
    metrics: ['latency', 'tokens_per_second', 'cost', 'accuracy']
  },
  {
    id: 'creative-writing',
    name: 'Creative Writing',
    description: 'Tests creative and narrative capabilities',
    prompts: [
      {
        id: 'creative-1',
        userPrompt: 'Write a haiku about artificial intelligence.',
        category: 'poetry'
      },
      {
        id: 'creative-2',
        userPrompt:
          'Write the opening paragraph of a mystery novel set in a small coastal town.',
        category: 'fiction'
      },
      {
        id: 'creative-3',
        userPrompt:
          'Create a product description for a revolutionary new smartphone that can read minds.',
        category: 'marketing'
      },
      {
        id: 'creative-4',
        userPrompt: 'Write a short dialogue between a robot and a child meeting for the first time.',
        category: 'dialogue'
      },
      {
        id: 'creative-5',
        userPrompt: 'Describe a sunset on Mars in vivid detail.',
        category: 'descriptive'
      }
    ],
    metrics: ['latency', 'tokens_per_second', 'cost', 'coherence', 'relevance']
  },
  {
    id: 'summarization',
    name: 'Summarization',
    description: 'Tests text summarization capabilities',
    prompts: [
      {
        id: 'summary-1',
        systemPrompt: 'You are a summarization assistant. Provide concise summaries.',
        userPrompt: `Summarize this text in one sentence: "The Industrial Revolution, which took place from the 18th to 19th centuries, was a period during which predominantly agrarian, rural societies in Europe and America became industrial and urban. Prior to the Industrial Revolution, which began in Britain in the late 1700s, manufacturing was often done in people's homes, using hand tools or basic machines. Industrialization marked a shift to powered, special-purpose machinery, factories and mass production."`,
        category: 'text'
      },
      {
        id: 'summary-2',
        userPrompt:
          'In 2-3 sentences, explain the main concept of machine learning.',
        category: 'technical'
      }
    ],
    metrics: ['latency', 'tokens_per_second', 'cost', 'relevance']
  }
];

export class BenchmarkRunner {
  private config: BenchmarkConfig;
  private supabase?: SupabaseClient;
  private tableName: string;

  constructor(config: BenchmarkConfig = {}) {
    this.config = config;
    this.supabase = config.supabase;
    this.tableName = config.tableName || 'benchmark_results';
  }

  /**
   * Run a benchmark test on a single model
   */
  async runTest(
    test: BenchmarkTest,
    modelConfig: ModelConfig,
    options: {
      temperature?: number;
      maxTokens?: number;
      onProgress?: (progress: { completed: number; total: number; current: string }) => void;
    } = {}
  ): Promise<BenchmarkResult> {
    const { temperature = 0.7, maxTokens = 1000, onProgress } = options;

    const provider = createProvider(modelConfig.provider, modelConfig.providerConfig);
    const modelInfo = provider.getModelInfo(modelConfig.model);

    const results: PromptResult[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalLatency = 0;
    let successCount = 0;

    for (let i = 0; i < test.prompts.length; i++) {
      const prompt = test.prompts[i];

      onProgress?.({
        completed: i,
        total: test.prompts.length,
        current: prompt.id
      });

      try {
        const startTime = performance.now();

        const response = await provider.chat({
          model: modelConfig.model,
          messages: [
            ...(prompt.systemPrompt
              ? [{ role: 'system' as const, content: prompt.systemPrompt }]
              : []),
            { role: 'user' as const, content: prompt.userPrompt }
          ],
          temperature,
          maxTokens
        });

        const endTime = performance.now();
        const latencyMs = endTime - startTime;

        const output = response.choices[0]?.message.content || '';
        const tokensPerSecond =
          response.usage.completionTokens / (latencyMs / 1000);

        const cost = modelInfo
          ? provider.calculateCost(modelConfig.model, response.usage)
          : 0;

        // Calculate accuracy if expected output is provided
        let scores: Record<string, number> | undefined;
        if (prompt.expectedOutput) {
          const normalizedOutput = output.toLowerCase().trim();
          const normalizedExpected = prompt.expectedOutput.toLowerCase().trim();
          const accuracyScore = normalizedOutput.includes(normalizedExpected)
            ? 1
            : 0;
          scores = { accuracy: accuracyScore };
        }

        results.push({
          promptId: prompt.id,
          output,
          latencyMs,
          tokensPerSecond,
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          cost,
          scores
        });

        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;
        totalLatency += latencyMs;
        successCount++;
      } catch (error) {
        results.push({
          promptId: prompt.id,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          latencyMs: 0,
          tokensPerSecond: 0,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0
        });
      }
    }

    // Calculate aggregated metrics
    const aggregated: AggregatedMetrics = {
      avgLatencyMs: successCount > 0 ? totalLatency / successCount : 0,
      avgTokensPerSecond:
        successCount > 0
          ? results
              .filter((r) => r.tokensPerSecond > 0)
              .reduce((sum, r) => sum + r.tokensPerSecond, 0) / successCount
          : 0,
      totalCost: results.reduce((sum, r) => sum + r.cost, 0),
      avgCostPerPrompt:
        successCount > 0
          ? results.reduce((sum, r) => sum + r.cost, 0) / successCount
          : 0,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      successRate: test.prompts.length > 0 ? successCount / test.prompts.length : 0
    };

    // Calculate average scores if applicable
    const scoredResults = results.filter((r) => r.scores);
    if (scoredResults.length > 0) {
      const scoreKeys = Object.keys(scoredResults[0].scores || {});
      aggregated.scores = {};
      for (const key of scoreKeys) {
        aggregated.scores[key] =
          scoredResults.reduce((sum, r) => sum + (r.scores?.[key] || 0), 0) /
          scoredResults.length;
      }
    }

    const result: BenchmarkResult = {
      id: generateId(),
      testId: test.id,
      model: modelConfig.model,
      provider: modelConfig.provider,
      results,
      aggregated,
      runAt: new Date()
    };

    // Save results if configured
    if (this.config.saveResults && this.supabase) {
      await this.saveResult(result, test.name);
    }

    onProgress?.({
      completed: test.prompts.length,
      total: test.prompts.length,
      current: 'completed'
    });

    return result;
  }

  /**
   * Run a benchmark test on multiple models for comparison
   */
  async compareModels(
    test: BenchmarkTest,
    models: ModelConfig[],
    options: {
      temperature?: number;
      maxTokens?: number;
      onProgress?: (progress: {
        modelIndex: number;
        totalModels: number;
        currentModel: string;
        promptProgress: { completed: number; total: number };
      }) => void;
    } = {}
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < models.length; i++) {
      const modelConfig = models[i];

      const result = await this.runTest(test, modelConfig, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        onProgress: (promptProgress) => {
          options.onProgress?.({
            modelIndex: i,
            totalModels: models.length,
            currentModel: modelConfig.model,
            promptProgress
          });
        }
      });

      results.push(result);
    }

    return results;
  }

  /**
   * Run all benchmark tests on a model
   */
  async runAllTests(
    modelConfig: ModelConfig,
    options: {
      tests?: BenchmarkTest[];
      temperature?: number;
      maxTokens?: number;
      onProgress?: (progress: {
        testIndex: number;
        totalTests: number;
        currentTest: string;
      }) => void;
    } = {}
  ): Promise<BenchmarkResult[]> {
    const tests = options.tests || BENCHMARK_TESTS;
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];

      options.onProgress?.({
        testIndex: i,
        totalTests: tests.length,
        currentTest: test.name
      });

      const result = await this.runTest(test, modelConfig, {
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });

      results.push(result);
    }

    return results;
  }

  /**
   * Save a benchmark result to the database
   */
  async saveResult(result: BenchmarkResult, testName: string): Promise<void> {
    if (!this.supabase) {
      throw new Error('Supabase client not configured');
    }

    const { error } = await this.supabase.from(this.tableName).insert({
      id: result.id,
      test_id: result.testId,
      test_name: testName,
      model: result.model,
      provider: result.provider,
      results: result.results,
      aggregated: result.aggregated,
      run_at: result.runAt.toISOString()
    });

    if (error) {
      throw new Error(`Failed to save benchmark result: ${error.message}`);
    }
  }

  /**
   * Get historical benchmark results for a model
   */
  async getModelHistory(
    model: string,
    options: { limit?: number; testId?: string } = {}
  ): Promise<BenchmarkResult[]> {
    if (!this.supabase) {
      throw new Error('Supabase client not configured');
    }

    const { limit = 10, testId } = options;

    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .eq('model', model)
      .order('run_at', { ascending: false })
      .limit(limit);

    if (testId) {
      query = query.eq('test_id', testId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get benchmark history: ${error.message}`);
    }

    return (data || []).map(this.mapResultFromDb);
  }

  /**
   * Get comparison data for multiple models
   */
  async getModelComparison(
    models: string[],
    testId: string
  ): Promise<BenchmarkResult[]> {
    if (!this.supabase) {
      throw new Error('Supabase client not configured');
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('test_id', testId)
      .in('model', models)
      .order('run_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get comparison data: ${error.message}`);
    }

    // Get latest result for each model
    const latestByModel = new Map<string, BenchmarkResult>();
    for (const row of data || []) {
      const result = this.mapResultFromDb(row);
      if (!latestByModel.has(result.model)) {
        latestByModel.set(result.model, result);
      }
    }

    return Array.from(latestByModel.values());
  }

  /**
   * Generate a comparison report
   */
  generateReport(results: BenchmarkResult[]): string {
    if (results.length === 0) {
      return 'No benchmark results to report.';
    }

    const lines: string[] = [
      '# Benchmark Comparison Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Summary',
      '',
      '| Model | Provider | Avg Latency | Tokens/sec | Total Cost | Success Rate |',
      '|-------|----------|-------------|------------|------------|--------------|'
    ];

    for (const result of results) {
      lines.push(
        `| ${result.model} | ${result.provider} | ${result.aggregated.avgLatencyMs.toFixed(0)}ms | ${result.aggregated.avgTokensPerSecond.toFixed(1)} | $${result.aggregated.totalCost.toFixed(4)} | ${(result.aggregated.successRate * 100).toFixed(1)}% |`
      );
    }

    // Add detailed metrics if scores are available
    const hasScores = results.some((r) => r.aggregated.scores);
    if (hasScores) {
      lines.push('', '## Accuracy Scores', '');

      const scoreKeys = new Set<string>();
      for (const result of results) {
        if (result.aggregated.scores) {
          Object.keys(result.aggregated.scores).forEach((k) => scoreKeys.add(k));
        }
      }

      const headerRow = ['| Model', ...Array.from(scoreKeys), '|'].join(' | ');
      const separatorRow =
        '|' + Array(scoreKeys.size + 1).fill('------').join('|') + '|';

      lines.push(headerRow, separatorRow);

      for (const result of results) {
        const scores = Array.from(scoreKeys).map(
          (k) => `${((result.aggregated.scores?.[k] || 0) * 100).toFixed(1)}%`
        );
        lines.push(`| ${result.model} | ${scores.join(' | ')} |`);
      }
    }

    // Cost efficiency ranking
    lines.push('', '## Cost Efficiency (Tokens per Dollar)', '');

    const costEfficiency = results
      .map((r) => ({
        model: r.model,
        efficiency:
          r.aggregated.totalCost > 0
            ? r.aggregated.totalTokens / r.aggregated.totalCost
            : 0
      }))
      .sort((a, b) => b.efficiency - a.efficiency);

    for (let i = 0; i < costEfficiency.length; i++) {
      lines.push(
        `${i + 1}. **${costEfficiency[i].model}**: ${costEfficiency[i].efficiency.toFixed(0)} tokens/$`
      );
    }

    return lines.join('\n');
  }

  private mapResultFromDb(row: Record<string, unknown>): BenchmarkResult {
    return {
      id: row.id as string,
      testId: row.test_id as string,
      model: row.model as string,
      provider: row.provider as AIProviderType,
      results: row.results as PromptResult[],
      aggregated: row.aggregated as AggregatedMetrics,
      runAt: new Date(row.run_at as string)
    };
  }
}

export default BenchmarkRunner;
