'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import Button from '@/components/ui/Button';
import { Loader2, Upload, X } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface CV {
  id: string;
  name: string;
  path: string;
}

interface Job {
  id: string;
  title: string;
  content: string;
}

export default function MatchingForm({ user }: { user: User }): JSX.Element {
  const [selectedCVs, setSelectedCVs] = useState<CV[]>([]);
  const [availableCVs, setAvailableCVs] = useState<CV[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobContent, setJobContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyseId, setAnalyseId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    loadUserCVs();
    loadUserJobs();
  }, []);

  const loadUserCVs = async () => {
    const { data, error } = await supabase
      .from('resumes')
      .select('id, name:file_name, path:file_path')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur chargement CVs:', error);
      return;
    }

    if (data) {
      setAvailableCVs(data);
    }
  };

  const loadUserJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, title, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur chargement offres:', error);
      return;
    }

    if (data) {
      setAvailableJobs(data);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('resumes')
        .insert({
          file_name: file.name,
          file_path: filePath,
          user_id: user.id
        });

      if (dbError) throw dbError;

      await loadUserCVs();
    } catch (error) {
      console.error('Erreur upload:', error);
      setError('Erreur lors de l\'upload du fichier');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const { data: analyse, error: createError } = await supabase
        .from('analyses')
        .insert({
          user_id: user.id,
          status: 'pending',
          code: jobContent,
          description: `Analyse de ${selectedCVs.length} CV(s)`,
          project_name: `Matching ${new Date().toLocaleDateString()}`
        })
        .select()
        .single();

      if (createError) throw createError;

      const response = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvPaths: selectedCVs.map(cv => cv.path),
          jobContent,
          analyseId: analyse.id
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const { data: finalAnalyse } = await supabase
        .from('analyses')
        .select('*')
        .eq('id', analyse.id)
        .single();

      if (finalAnalyse?.result) {
        setAnalysisResult(finalAnalyse.result);
      }

      setAnalyseId(analyse.id);
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      setError(error instanceof Error ? error.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job);
    setJobContent(job.content);
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">
              Sélectionnez les CV à analyser
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="cv-upload"
              />
              <label
                htmlFor="cv-upload"
                className="cursor-pointer inline-flex items-center"
              >
                <Button type="button" variant="flat" disabled={uploadingFile}>
                  {uploadingFile ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Ajouter un CV
                </Button>
              </label>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* CVs disponibles */}
            <div className="p-4 border rounded-lg space-y-2">
              <h3 className="font-medium mb-2">CVs disponibles</h3>
              {availableCVs.map(cv => (
                <Button
                  key={cv.id}
                  type="button"
                  variant="flat"
                  className="w-full justify-start"
                  onClick={() => setSelectedCVs(prev => [...prev, cv])}
                  disabled={selectedCVs.some(s => s.id === cv.id)}
                >
                  {cv.name}
                </Button>
              ))}
            </div>

            {/* CVs sélectionnés */}
            <div className="p-4 border rounded-lg space-y-2">
              <h3 className="font-medium mb-2">CVs sélectionnés</h3>
              {selectedCVs.map(cv => (
                <div 
                  key={cv.id}
                  className="flex items-center justify-between p-2 bg-background rounded"
                >
                  <span>{cv.name}</span>
                  <Button
                    type="button"
                    variant="flat"
                    onClick={() => setSelectedCVs(prev => 
                      prev.filter(s => s.id !== cv.id)
                    )}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">
              Sélectionnez une offre d'emploi
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Offres disponibles */}
            <div className="p-4 border rounded-lg space-y-2">
              <h3 className="font-medium mb-2">Offres disponibles</h3>
              {availableJobs.map(job => (
                <Button
                  key={job.id}
                  type="button"
                  variant="flat"
                  className="w-full justify-start"
                  onClick={() => handleJobSelect(job)}
                  disabled={selectedJob?.id === job.id}
                >
                  {job.title}
                </Button>
              ))}
            </div>

            {/* Contenu de l'offre */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">
                {selectedJob ? selectedJob.title : 'Nouvelle offre'}
              </h3>
              <textarea
                value={jobContent}
                onChange={(e) => setJobContent(e.target.value)}
                className="w-full h-64 p-4 rounded-lg border bg-background"
                placeholder="Collez le contenu de l'offre d'emploi ici..."
                required
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            {error}
          </div>
        )}

        <Button 
          type="submit" 
          disabled={isLoading || !jobContent || selectedCVs.length === 0}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyse en cours...
            </>
          ) : (
            'Lancer l\'analyse'
          )}
        </Button>

        {analyseId && (
          <p className="text-center text-sm">
            Analyse lancée ! Consultez les résultats dans votre historique.
          </p>
        )}
      </form>

      {analysisResult && (
        <div className="mt-8 space-y-6">
          <h2 className="text-xl font-semibold">Résultats de l'analyse</h2>
          
          <div className="p-6 bg-background/50 border rounded-lg space-y-6">
            <div>
              <h3 className="font-medium mb-2">Offre d'emploi structurée</h3>
              <div className="prose prose-invert max-w-none">
                {analysisResult.job_markdown}
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-4">Résultats par CV</h3>
              <div className="space-y-4">
                {analysisResult.matches.map((match: any, index: number) => (
                  <div key={index} className="p-4 bg-background border rounded-lg">
                    <h4 className="font-medium mb-2">CV: {match.cvPath.split('/').pop()}</h4>
                    <div className="prose prose-invert max-w-none">
                      {match.compatibility}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
