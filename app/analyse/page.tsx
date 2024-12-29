import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUser, getSubscription } from '@/utils/supabase/queries';
import AnalyseForm from '@/components/ui/AnalyseForms/AnalyseForm';

export default async function Analyse() {
  const supabase = createClient();
  const [user, subscription] = await Promise.all([
    getUser(supabase),
    getSubscription(supabase)
  ]);

  if (!user) {
    return redirect('/signin');
  }

  if (!subscription) {
    return redirect('/pricing');
  }

  return (
    <div className="bg-zinc-900 rounded-lg p-6">
      <AnalyseForm user={user} />
    </div>
  );
} 