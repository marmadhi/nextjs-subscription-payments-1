import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import MatchingForm from '@/components/ui/Matchingforms/MatchingForm';
import 'github-markdown-css';

export default async function MatchingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-bold">Analyse de compatibilité CV/Offre</h1>
      <MatchingForm user={user} />
    </div>
  );
}