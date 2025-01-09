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
    <div className="m-auto max-w-2xl space-y-6">
      <div className="">
        <AnalyseForm user={user} />
      </div>
    </div>
  );
} 