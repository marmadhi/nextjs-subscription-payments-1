import EmailForm from '@/components/ui/AccountForms/EmailForm';
import NameForm from '@/components/ui/AccountForms/NameForm';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserDetails, getUser } from '@/utils/supabase/queries';

export default async function Profile() {
  const supabase = createClient();
  const [user, userDetails] = await Promise.all([
    getUser(supabase),
    getUserDetails(supabase)
  ]);

  if (!user) {
    return redirect('/signin');
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h2 className="text-2xl font-bold text-white mb-4">Mes coordonnées</h2>
        <div className="space-y-4">
          <NameForm userName={userDetails?.full_name ?? ''} />
          <EmailForm userEmail={user.email} />
        </div>
      </div>
    </div>
  );
} 