import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUser, getSubscription, getCustomer } from '@/utils/supabase/queries';
import { stripe } from '@/utils/stripe/config';
import type { Stripe } from 'stripe';
import Link from 'next/link';

export default async function Invoices() {
  const supabase = createClient();
  const [user, subscription, customer] = await Promise.all([
    getUser(supabase),
    getSubscription(supabase),
    getCustomer(supabase)
  ]);

  if (!user) {
    return redirect('/signin');
  }

  let invoices: Stripe.Invoice[] = [];
  if (subscription && customer?.stripe_customer_id) {
    try {
      const stripeInvoices = await stripe.invoices.list({
        customer: customer.stripe_customer_id,
        limit: 10
      });
      invoices = stripeInvoices.data;
    } catch (stripeError) {
      console.error('❌ Erreur Stripe:', stripeError);
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-zinc-900 rounded-lg">
        <h2 className="text-2xl font-bold text-white mb-4">Mes factures</h2>
        {subscription ? (
          invoices.length > 0 ? (
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex justify-between items-center p-4 bg-zinc-800 rounded">
                  <div>
                    <p className="text-white">
                      {new Date(invoice.created * 1000).toLocaleDateString()}
                    </p>
                    <p className="text-zinc-400">
                      {(invoice.amount_paid / 100).toFixed(2)} {invoice.currency.toUpperCase()}
                    </p>
                  </div>
                  {invoice.hosted_invoice_url && (
                    <a
                      href={invoice.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-400"
                    >
                      Voir la facture
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-300">Aucune facture disponible</p>
          )
        ) : (
          <div className="text-center py-6">
            <p className="text-zinc-400 mb-4">Pas d'abonnement pour le moment</p>
            <Link 
              href="/pricing" 
              className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
            >
              S'abonner
            </Link>
          </div>
        )}
      </div>
    </div>
  );
} 