'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

export default function AnalyseForm({ user }: { user: User }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [codeToAnalyse, setCodeToAnalyse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const supabase = createClient();
      
      const { data: analyse, error } = await supabase
        .from('analyses')
        .insert({
          user_id: user.id,
          project_name: projectName,
          code: codeToAnalyse,
          description: `Analyse du projet ${projectName}`
        })
        .select()
        .single();

      if (error) throw error;

      const response = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analyseId: analyse.id,
          projectName,
          code: codeToAnalyse
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      // Récupérer le résultat de l'analyse
      const { data: updatedAnalyse } = await supabase
        .from('analyses')
        .select('result')
        .eq('id', analyse.id)
        .single();

      if (updatedAnalyse?.result?.analysis) {
        setAnalysisResult(updatedAnalyse.result.analysis);
      }

    } catch (error) {
      console.error('Erreur:', error);
      setError(error instanceof Error ? error.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium text-white mb-2">
            Nom du projet
          </label>
          <input
            type="text"
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
            required
          />
        </div>

        <div>
          <label htmlFor="code" className="block text-sm font-medium text-white mb-2">
            Code à analyser
          </label>
          <textarea
            id="code"
            value={codeToAnalyse}
            onChange={(e) => setCodeToAnalyse(e.target.value)}
            rows={10}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Analyse en cours...' : 'Lancer l\'analyse'}
        </button>
      </form>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {analysisResult && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-white mb-4">Résultat de l'analyse</h2>
          <div className="p-6 bg-zinc-800 rounded-lg prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap">{analysisResult}</pre>
          </div>
        </div>
      )}
    </div>
  );
} 