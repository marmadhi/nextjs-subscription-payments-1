import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET() {
  try {
    // Initialiser Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16'
    });

    // Récupérer les produits actifs
    const products = await stripe.products.list({ active: true });
    console.log('Produits actifs trouvés:', products.data.length);
    
    // Récupérer tous les prix actifs
    const prices = await stripe.prices.list({ active: true });
    console.log('Prix trouvés:', prices.data.length);

    // Après la récupération des prix
    console.log('Liste complète des prix actifs:', prices.data.map(p => ({
      id: p.id,
      product: p.product,
      active: p.active,
      interval: p.recurring?.interval
    })));

    // Initialiser Supabase
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookies().get(name)?.value;
          }
        }
      }
    );

    // Nettoyer les tables
    await supabase.from('prices').delete().neq('id', '');
    await supabase.from('products').delete().neq('id', '');

    // Synchroniser les produits actifs
    for (const product of products.data) {
      const productData = {
        id: product.id,
        active: true,
        name: product.name,
        description: product.description || '',
        image: product.images?.[0] || null,
        metadata: product.metadata || {}
      };
      
      const { error: productError } = await supabase
        .from('products')
        .upsert(productData);

      if (productError) {
        console.error('Erreur insertion produit:', product.id, productError);
      } else {
        console.log('Produit synchronisé:', product.name);
      }
    }

    // Synchroniser tous les prix des produits actifs
    const activeProductIds = products.data.map(p => p.id);
    const relevantPrices = prices.data.filter(price => activeProductIds.includes(price.product as string));

    for (const price of relevantPrices) {
      const priceData = {
        id: price.id,
        product_id: price.product,
        active: price.active,
        currency: price.currency,
        type: price.type,
        unit_amount: price.unit_amount,
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
        trial_period_days: price.recurring?.trial_period_days,
        metadata: price.metadata || {}
      };

      console.log('Tentative synchronisation prix:', {
        product: price.product,
        amount: price.unit_amount,
        interval: price.recurring?.interval
      });

      const { error: priceError } = await supabase
        .from('prices')
        .upsert(priceData);

      if (priceError) {
        console.error('Erreur insertion prix:', priceError);
      } else {
        console.log('Prix synchronisé pour produit:', price.product);
      }
    }

    // Vérification finale
    const { data: productsInDb, error: productsError } = await supabase
      .from('products')
      .select('*');

    const { data: pricesInDb, error: pricesError } = await supabase
      .from('prices')
      .select('*');

    return NextResponse.json({ 
      success: true, 
      activeProducts: products.data.length,
      syncedProducts: productsInDb?.length || 0,
      totalPrices: prices.data.length,
      relevantPrices: relevantPrices.length,
      syncedPrices: pricesInDb?.length || 0,
      debug: {
        productIds: activeProductIds,
        priceDetails: relevantPrices.map(p => ({
          id: p.id,
          product: p.product,
          interval: p.recurring?.interval,
          unit_amount: p.unit_amount,
          currency: p.currency
        }))
      }
    });

  } catch (error) {
    console.error('Error syncing products:', error);
    return NextResponse.json({ 
      error: 'Error syncing products',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}