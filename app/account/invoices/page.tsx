import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUser, getSubscription, getCustomer } from '@/utils/supabase/queries';
import { stripe } from '@/utils/stripe/config';
import type { Stripe } from 'stripe';

export default async function Invoices() {
  const supabase = createClient();
  console.log('🚀 Début de la fonction Invoices');

  const [user, subscription, customer] = await Promise.all([
    getUser(supabase),
    getSubscription(supabase),
    getCustomer(supabase)
  ]);

  console.log('👤 User récupéré:', {
    userId: user?.id,
    userEmail: user?.email
  });

  console.log('💳 Customer récupéré:', customer);

  if (!user || !subscription) {
    console.log('❌ Utilisateur ou souscription manquant:', { 
      hasUser: !!user, 
      hasSubscription: !!subscription 
    });
    return redirect('/signin');
  }

  let invoices: Stripe.Invoice[] = [];
  if (customer?.stripe_customer_id) {
    try {
      const stripeInvoices = await stripe.invoices.list({
        customer: customer.stripe_customer_id,
        limit: 10
      });
      
      console.log('📜 Réponse Stripe:', {
        total: stripeInvoices.data.length,
        premiereFature: stripeInvoices.data[0] || 'aucune'
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
        {invoices.length > 0 ? (
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
        )}
      </div>
    </div>
  );
} 