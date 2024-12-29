'use client';

type AnalyseItemProps = {
  analyse: {
    id: string;
    project_name: string;
    created_at: string;
    status: string;
    description?: string;
    result?: { analysis: string };
  };
};

export default function AnalyseItem({ analyse }: AnalyseItemProps) {
  const handleViewResult = () => {
    // TODO: Implémenter l'affichage du résultat
    alert(analyse.result?.analysis || 'Pas de résultat disponible');
  };

  return (
    <div className="p-4 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-medium text-white">
            {analyse.project_name}
          </h3>
          <p className="text-sm text-zinc-400">
            {new Date(analyse.created_at).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
          <p className="mt-1 text-sm">
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
      {analyse.description && (
        <p className="mt-2 text-sm text-zinc-300">
          {analyse.description}
        </p>
      )}
    </div>
  );
} 