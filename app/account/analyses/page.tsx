import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUser, getSubscription } from '@/utils/supabase/queries';
import AnalyseItem from '@/components/ui/AnalyseItem';
import Link from 'next/link';

export default async function Analyses() {
  const supabase = createClient();
  const [user, subscription] = await Promise.all([
    getUser(supabase),
    getSubscription(supabase)
  ]);

  if (!user) {
    return redirect('/signin');
  }

  let analyses = [];
  if (subscription) {
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur lors de la récupération des analyses:', error);
    } else {
      analyses = data;
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Mes analyses</h2>
          {subscription && (
            <Link 
              href="/account/analyse" 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Nouvelle analyse
            </Link>
          )}
        </div>

        {subscription ? (
          analyses.length > 0 ? (
            <div className="space-y-4">
              {analyses.map((analyse) => (
                <AnalyseItem key={analyse.id} analyse={analyse} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-zinc-400 mb-4">Aucune analyse effectuée pour le moment</p>
              <p className="text-sm text-zinc-500">
                Commencez par analyser votre premier projet pour voir les résultats ici
              </p>
            </div>
          )
        ) : (
          <div className="text-center py-6">
            <p className="text-zinc-400 mb-4">Pas d'abonnement pour le moment</p>
            <Link 
              href="/pricing" 
              className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
            >
              S'abonner
            </Link>
          </div>
        )}
      </div>
    </div>
  );
} 