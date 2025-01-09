'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';

interface Resume {
  id: string;
  file_name: string;
  user_id: string;
  file_path: string;
}

interface ConversionResult {
  success: boolean;
  raw_text: string;
  markdown_text: string;
  numpages: number;
}

export default function ConversionForm({ user }: { user: User }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userResumes, setUserResumes] = useState<Resume[]>([]);
  const [selectedResume, setSelectedResume] = useState<string>('');
  const [inputMethod, setInputMethod] = useState<'file' | 'existing'>('file');

  useEffect(() => {
    const fetchUserResumes = async () => {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('resumes')
        .select('id, file_name, user_id, file_path')
        .eq('user_id', user.id);

      if (error) {
        console.error('Erreur lors de la récupération des resumes:', error);
        return;
      }

      if (data) {
        setUserResumes(data);
      }
    };

    fetchUserResumes();
  }, [user.id]);

  const handleFileUpload = async (file: File) => {
    const supabase = createClient();
    const fileName = `${user.id}/${Date.now()}-${Math.random()}.pdf`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: resumeData, error: resumeError } = await supabase
      .from('resumes')
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_path: fileName
      })
      .select()
      .single();

    if (resumeError) throw resumeError;

    return fileName;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setConversionResult(null);

    try {
      let filePath: string;

      if (inputMethod === 'file' && selectedFile) {
        filePath = await handleFileUpload(selectedFile);
        console.log("📁 Fichier uploadé, filePath:", filePath);
      } else if (inputMethod === 'existing' && selectedResume) {
        const selectedResumeData = userResumes.find(
          resume => resume.id === selectedResume && resume.user_id === user.id
        );
        if (!selectedResumeData) {
          throw new Error('Fichier non trouvé ou non autorisé');
        }
        filePath = selectedResumeData.file_path;
      } else {
        throw new Error('Aucun fichier sélectionné');
      }

      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });

      const data = await response.json();
      console.log("✨ Réponse de l'API:", data);

      if (!response.ok) throw new Error(data.error);

      setConversionResult(data);

    } catch (error) {
      console.error('❌ Erreur:', error);
      setError(error instanceof Error ? error.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6 text-zinc-950">
        <div className="space-y-4">
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="file"
                checked={inputMethod === 'file'}
                onChange={(e) => setInputMethod('file')}
                className="mr-2"
              />
              Upload fichier PDF
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

          {inputMethod === 'file' && (
            <div>
              <label htmlFor="file" className="block text-zinc-950 mb-2">
                Sélectionner un fichier PDF
              </label>
              <input
                type="file"
                id="file"
                accept=".pdf"
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
                value={selectedResume}
                onChange={(e) => setSelectedResume(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-gray-200 rounded-lg"
                required={inputMethod === 'existing'}
              >
                <option value="">Sélectionner un fichier</option>
                {userResumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.file_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`px-4 py-2 bg-black text-white rounded-lg hover:bg-blue-700 transition-colors ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Conversion en cours...' : 'Convertir en texte'}
        </button>
      </form>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {conversionResult && (
        <div className="mt-8 space-y-8">
          <div style={{ display: 'none' }}>
            <h2 className="text-xl font-semibold mb-4">Texte brut extrait ({conversionResult.numpages} pages)</h2>
            <div className="p-6 bg-background border border-gray-200 text-zinc-950 rounded-lg prose prose-invert max-w-none">
              <pre className="whitespace-pre-wrap">{conversionResult.raw_text}</pre>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Version structurée (json)</h2>
            <div className="p-6 bg-background border border-gray-200 text-zinc-950 rounded-lg prose prose-invert max-w-none">
              <pre className="whitespace-pre-wrap">{conversionResult.markdown_text}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 