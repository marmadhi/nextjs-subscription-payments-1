import Sidebar from '@/components/ui/Sidebar/Sidebar';
import { createClient } from '@/utils/supabase/server';
import { getSubscription, getUser, getCustomer } from '@/utils/supabase/queries';

export default async function AnalyseLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const [user, subscription, customer] = await Promise.all([
    getUser(supabase),
    getSubscription(supabase),
    getCustomer(supabase)
  ]);

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl px-4 py-8 mx-auto sm:px-6 sm:pt-24 lg:px-8">
        <div className="sm:align-center sm:flex sm:flex-col">
          <h1 className="text-4xl font-extrabold text-white sm:text-center sm:text-6xl">
            Analyse
          </h1>
          <p className="max-w-2xl m-auto mt-5 text-xl text-zinc-200 sm:text-center sm:text-2xl">
            Analysez votre code avec l'aide de l'IA
          </p>
        </div>
      </div>
      <div className="flex max-w-6xl mx-auto">
        <Sidebar 
          credits={subscription?.credits}
          userId={user?.id}
          customerId={customer?.stripe_customer_id}
          subscriptionId={subscription?.id}
          hasSubscription={!!subscription}
        />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
} 