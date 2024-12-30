'use client';

import CustomerPortalForm from '@/components/ui/AccountForms/CustomerPortalForm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import CreditsDisplay from '@/components/ui/Credits/CreditsDisplay';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function Account() {
  const [subscription, setSubscription] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        redirect('/signin');
      }

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*, prices(*, products(*))')
        .single();

      if (sub) {
        setSubscription(sub);
      }
    }

    loadData();
  }, []);

  if (!subscription) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h2 className="text-2xl font-bold text-white mb-4">Vos crédits</h2>
        <div className="flex items-center gap-4">
          <CreditsDisplay 
            initialCredits={subscription.credits} 
            subscriptionId={subscription.id}
          />
          <div className="text-zinc-400">
            <p>Plan {subscription.prices?.products?.name}</p>
            <p className="text-sm">
              Renouvellement le {' '}
              {new Date(subscription.current_period_end).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 bg-zinc-900 rounded-lg">
        <h2 className="text-2xl font-bold text-white mb-4">Gérer l'abonnement</h2>
        <CustomerPortalForm subscription={subscription} />
      </div>
    </div>
  );
}
