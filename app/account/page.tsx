import CustomerPortalForm from '@/components/ui/AccountForms/CustomerPortalForm';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getSubscription, getUser, getCustomer } from '@/utils/supabase/queries';

export default async function Account() {
  const supabase = createClient();
  const [user, subscription, customer] = await Promise.all([
    getUser(supabase),
    getSubscription(supabase),
    getCustomer(supabase)
  ]);

  if (!user) {
    return redirect('/signin');
  }

  if (!subscription) {
    return redirect('/pricing');
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h2 className="text-2xl font-bold text-white mb-4">Vos crédits</h2>
        <div className="flex items-center gap-4">
          <div className="bg-blue-600/20 p-4 rounded-lg">
            <p className="text-3xl font-bold text-blue-400">
              {subscription.credits}
            </p>
            <p className="text-sm text-blue-300">crédits restants</p>
          </div>
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
        
        <div className="mt-6 space-y-2 text-sm text-zinc-500">
          <p>User ID: {user.id}</p>
          <p>Customer ID: {customer?.stripe_customer_id}</p>
          <p>Subscription ID: {subscription.id}</p>
        </div>
      </div>
    </div>
  );
}
