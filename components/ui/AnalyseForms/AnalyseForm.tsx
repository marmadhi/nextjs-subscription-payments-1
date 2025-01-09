'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

interface Job {
  id: string;
  file_name: string;
  content: string;
  user_id: string;
  file_path: string;
}

export default function AnalyseForm({ user }: { user: User }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [codeToAnalyse, setCodeToAnalyse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userJobs, setUserJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [inputMethod, setInputMethod] = useState<'direct' | 'file' | 'existing'>('direct');

  useEffect(() => {
    const fetchUserJobs = async () => {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('jobs')
        .select('id, file_name, content, user_id, file_path')
        .eq('user_id', user.id);

      if (error) {
        console.error('Erreur lors de la récupération des jobs:', error);
        return;
      }

      if (data) {
        setUserJobs(data);
      }
    };

    fetchUserJobs();
  }, [user.id]);

  const handleFileUpload = async (file: File) => {
    const supabase = createClient();
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random()}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('jobs')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const fileContent = await file.text();

    const { data: jobData, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        file_name: file.name,
        content: fileContent,
        file_path: fileName
      })
      .select()
      .single();

    if (jobError) throw jobError;

    const { data: updatedJobs } = await supabase
      .from('jobs')
      .select('id, name, content, user_id')
      .eq('user_id', user.id);
    if (updatedJobs) {
      setUserJobs(updatedJobs.map(job => ({
        ...job,
        file_name: file.name,
        file_path: fileName
      })));
    }

    return fileContent;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      let contentToAnalyse = codeToAnalyse;

      if (inputMethod === 'file' && selectedFile) {
        contentToAnalyse = await handleFileUpload(selectedFile);
      } else if (inputMethod === 'existing' && selectedJob) {
        const selectedJobData = userJobs.find(
          job => job.id === selectedJob && job.user_id === user.id
        );
        if (!selectedJobData) {
          throw new Error('Fichier non trouvé ou non autorisé');
        }
        contentToAnalyse = selectedJobData.content;
      }

      const supabase = createClient();
      
      const { data: analyse, error } = await supabase
        .from('analyses')
        .insert({
          user_id: user.id,
          project_name: projectName,
          code: contentToAnalyse,
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
          code: contentToAnalyse
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
      <form onSubmit={handleSubmit} className="space-y-6 text-zinc-950">
        <div>
          <label htmlFor="projectName" className="block text-zinc-950 mb-2">
            Nom du projet
          </label>
          <input
            type="text"
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full px-4 py-2 bg-background border border-gray-200 rounded-lg"
            required
          />
        </div>

        <div className="space-y-4">
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="direct"
                checked={inputMethod === 'direct'}
                onChange={(e) => setInputMethod('direct')}
                className="mr-2"
              />
              Saisie directe
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="file"
                checked={inputMethod === 'file'}
                onChange={(e) => setInputMethod('file')}
                className="mr-2"
              />
              Upload fichier
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="existing"
                checked={inputMethod === 'existing'}
                onChange={(e) => setInputMethod('existing')}
                className="mr-2"
              />
              Fichier existant
            </label>
          </div>

          {inputMethod === 'direct' && (
            <div>
              <label htmlFor="code" className="block text-zinc-950 mb-2">
                Code à analyser
              </label>
              <textarea
                id="code"
                value={codeToAnalyse}
                onChange={(e) => setCodeToAnalyse(e.target.value)}
                rows={10}
                className="w-full px-4 py-2 bg-background border border-gray-200 rounded-lg"
                required={inputMethod === 'direct'}
              />
            </div>
          )}

          {inputMethod === 'file' && (
            <div>
              <label htmlFor="file" className="block text-zinc-950 mb-2">
                Sélectionner un fichier
              </label>
              <input
                type="file"
                id="file"
                accept=".txt,.js,.ts,.jsx,.tsx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full"
                required={inputMethod === 'file'}
              />
            </div>
          )}

          {inputMethod === 'existing' && (
            <div>
              <label htmlFor="existingFile" className="block text-zinc-950 mb-2">
                Sélectionner un fichier existant
              </label>
              <select
                id="existingFile"
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-gray-200 rounded-lg"
                required={inputMethod === 'existing'}
              >
                <option value="">Sélectionner un fichier</option>
                {userJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.file_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={` px-4 py-2 bg-black text-white rounded-lg hover:bg-blue-700 transition-colors ${
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
          <h2 className="text-xl font-semibold mb-4">Résultat de l'analyse</h2>
          <div className="p-6 bg-background border border-gray-200 text-zinc-950 rounded-lg prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap">{analysisResult}</pre>
          </div>
        </div>
      )}
    </div>
  );
} 