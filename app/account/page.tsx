import { Suspense } from 'react';
import CustomerPortalForm from '@/components/ui/AccountForms/CustomerPortalForm';
import EmailForm from '@/components/ui/AccountForms/EmailForm';
import NameForm from '@/components/ui/AccountForms/NameForm';
import SubscriptionDetails from '@/components/ui/AccountForms/SubscriptionDetails';
import SuccessMessage from '@/components/ui/AccountForms/SuccessMessage';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import AppSidebar from '@/components/ui/AppSidebar';
import {
  getUserDetails,
  getSubscription,
  getUser
} from '@/utils/supabase/queries';

export default async function Account() {
  const supabase = await createClient();
  const [user, userDetails, subscription] = await Promise.all([
    getUser(supabase),
    getUserDetails(supabase),
    getSubscription(supabase)
  ]);

  if (!user) {
    return redirect('/signin');
  }

  return (
    <div className="h-screen bg-zinc-950 flex overflow-hidden">
      <AppSidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-2xl font-semibold text-white mb-2">
              Account Settings
            </h1>
            <p className="text-zinc-400">
              Manage your subscription and profile
            </p>
          </div>

          {/* Success Message */}
          <Suspense fallback={null}>
            <SuccessMessage />
          </Suspense>

          {/* Content */}
          <div className="space-y-6">
            <SubscriptionDetails subscription={subscription} />
            <CustomerPortalForm subscription={subscription} />
            <NameForm userName={userDetails?.full_name ?? ''} />
            <EmailForm userEmail={user.email} />
          </div>
        </div>
      </main>
    </div>
  );
}
