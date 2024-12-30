import Sidebar from '@/components/ui/Sidebar/Sidebar';
import { createClient } from '@/utils/supabase/server';
import { getSubscription, getUser, getCustomer } from '@/utils/supabase/queries';
import { redirect } from 'next/navigation';

export default async function AccountLayout({
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

  if (!user) {
    redirect('/signin');
  }

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar 
        credits={subscription?.credits}
        userId={user.id}
        customerId={customer?.stripe_customer_id}
        subscriptionId={subscription?.id}
        hasSubscription={!!subscription}
      />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
} 