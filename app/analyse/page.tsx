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
    <div className="bg-background p-6 rounded-lg">
      <AnalyseForm user={user} />
    </div>
  );
} 