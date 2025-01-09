'use client';

import { useState } from 'react';

type AnalyseItemProps = {
  analyse: {
    id: string;
    project_name: string;
    created_at: string;
    status: string;
    description?: string;
    result?: { 
      analysis: string;
      job_markdown: string;
      matches: any[];
    };
    timestamp_id: number;
    shortId?: string;
  };
};

export default function AnalyseItem({ analyse }: AnalyseItemProps) {
  const [showResult, setShowResult] = useState(false);

  const handleViewResult = () => {
    setShowResult(!showResult);
  };

  return (
    <div className="p-4 bg-background border border-gray-200 rounded-lg transition-colors">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-medium text-text">
              {analyse.project_name}
            </h3>
            <span className="text-sm text-text-secondary">
              #{analyse.shortId}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            {new Date(analyse.created_at).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
          <p className="mt-1">
            <span className={`px-2 py-1 rounded-full text-xs ${
              analyse.status === 'completed' ? 'bg-green-900/50 text-green-200' :
              analyse.status === 'processing' ? 'bg-yellow-900/50 text-yellow-200' :
              analyse.status === 'failed' ? 'bg-red-900/50 text-red-200' :
              'bg-zinc-900/50 text-zinc-200'
            }`}>
              {analyse.status}
            </span>
          </p>
        </div>
        {analyse.status === 'completed' && (
          <div className="flex gap-2">
            <button 
              onClick={handleViewResult}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Voir le résultat
            </button>
          </div>
        )}
      </div>
      
      {showResult && analyse.result && (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="font-medium mb-2">Offre d'emploi structurée</h3>
            <div className="prose prose-invert max-w-none">
              {analyse.result.job_markdown}
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-4">Résultats par CV</h3>
            <div className="space-y-4">
              {analyse.result.matches.map((match: any, index: number) => (
                <div key={index} className="p-4 bg-background/50 border rounded-lg">
                  <h4 className="font-medium mb-2">CV: {match.cvPath.split('/').pop()}</h4>
                  <div className="prose prose-invert max-w-none">
                    {match.compatibility}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 