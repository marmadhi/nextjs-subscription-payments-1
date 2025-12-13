import { createClient } from '@/utils/supabase/server';
import {
  getProducts,
  getSubscription,
  getUser
} from '@/utils/supabase/queries';
import AppSidebar from '@/components/ui/AppSidebar';
import PricingContent from './PricingContent';

export default async function PricingPage() {
  const supabase = await createClient();
  const [user, products, subscription] = await Promise.all([
    getUser(supabase),
    getProducts(supabase),
    getSubscription(supabase)
  ]);

  return (
    <div className="h-screen bg-zinc-950 flex overflow-hidden">
      <AppSidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <PricingContent
          user={user}
          products={products ?? []}
          subscription={subscription}
        />
      </main>
    </div>
  );
}
