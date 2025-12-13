'use client';

import type { Tables } from '@/types_db';
import { getStripe } from '@/utils/stripe/client';
import { checkoutWithStripe } from '@/utils/stripe/server';
import { getErrorRedirect } from '@/utils/helpers';
import { User } from '@supabase/supabase-js';
import cn from 'classnames';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

type Subscription = Tables<'subscriptions'>;
type Product = Tables<'products'>;
type Price = Tables<'prices'>;
interface ProductWithPrices extends Product {
  prices: Price[];
}
interface PriceWithProduct extends Price {
  products: Product | null;
}
interface SubscriptionWithProduct extends Subscription {
  prices: PriceWithProduct | null;
}

interface Props {
  user: User | null | undefined;
  products: ProductWithPrices[];
  subscription: SubscriptionWithProduct | null;
}

type BillingInterval = 'lifetime' | 'year' | 'month';

export default function PricingContent({ user, products, subscription }: Props) {
  const intervals = Array.from(
    new Set(
      products.flatMap((product) =>
        product?.prices?.map((price) => price?.interval)
      )
    )
  );
  const router = useRouter();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month');
  const [priceIdLoading, setPriceIdLoading] = useState<string>();
  const currentPath = usePathname();

  const handleStripeCheckout = async (price: Price) => {
    setPriceIdLoading(price.id);

    if (!user) {
      setPriceIdLoading(undefined);
      return router.push('/signin/signup');
    }

    const { errorRedirect, sessionId } = await checkoutWithStripe(
      price,
      '/account?success=true'
    );

    if (errorRedirect) {
      setPriceIdLoading(undefined);
      return router.push(errorRedirect);
    }

    if (!sessionId) {
      setPriceIdLoading(undefined);
      return router.push(
        getErrorRedirect(
          currentPath,
          'An unknown error occurred.',
          'Please try again later or contact a system administrator.'
        )
      );
    }

    const stripe = await getStripe();
    stripe?.redirectToCheckout({ sessionId });

    setPriceIdLoading(undefined);
  };

  if (!products.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold text-white mb-4">
            No pricing plans available
          </h1>
          <p className="text-zinc-400">
            Create subscription plans in your{' '}
            <a
              className="text-blue-400 hover:text-blue-300 underline"
              href="https://dashboard.stripe.com/products"
              rel="noopener noreferrer"
              target="_blank"
            >
              Stripe Dashboard
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-semibold text-white mb-3">
          Choose your plan
        </h1>
        <p className="text-zinc-400 max-w-lg mx-auto">
          Start with our free tier and upgrade as you grow. All plans include access to our AI assistant.
        </p>
      </div>

      {/* Billing Toggle */}
      {(intervals.includes('month') || intervals.includes('year')) && (
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center bg-zinc-900 rounded-lg p-1 border border-zinc-800">
            {intervals.includes('month') && (
              <button
                onClick={() => setBillingInterval('month')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  billingInterval === 'month'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
            )}
            {intervals.includes('year') && (
              <button
                onClick={() => setBillingInterval('year')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  billingInterval === 'year'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Yearly
                <span className="ml-1.5 text-xs text-emerald-400">Save 20%</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => {
          const price = product?.prices?.find(
            (price) => price.interval === billingInterval
          );
          if (!price) return null;

          const priceString = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: price.currency!,
            minimumFractionDigits: 0
          }).format((price?.unit_amount || 0) / 100);

          const isCurrentPlan = subscription?.prices?.products?.name === product.name;
          const isPopular = product.name?.toLowerCase().includes('pro') ||
                          product.name?.toLowerCase().includes('freelancer');

          return (
            <div
              key={product.id}
              className={cn(
                'relative flex flex-col rounded-xl border bg-zinc-900/50 p-6 transition-all',
                isCurrentPlan
                  ? 'border-emerald-500/50 ring-1 ring-emerald-500/20'
                  : isPopular
                    ? 'border-blue-500/50 ring-1 ring-blue-500/20'
                    : 'border-zinc-800 hover:border-zinc-700'
              )}
            >
              {/* Badge */}
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-emerald-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Current Plan
                  </span>
                </div>
              )}
              {!isCurrentPlan && isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Popular
                  </span>
                </div>
              )}

              {/* Plan Name */}
              <h3 className="text-lg font-semibold text-white mb-2">
                {product.name}
              </h3>
              <p className="text-sm text-zinc-400 mb-6 flex-grow">
                {product.description || 'Perfect for getting started'}
              </p>

              {/* Price */}
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">{priceString}</span>
                <span className="text-zinc-400 ml-1">/{billingInterval}</span>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handleStripeCheckout(price)}
                disabled={priceIdLoading === price.id || isCurrentPlan}
                className={cn(
                  'w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors',
                  isCurrentPlan
                    ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                    : isPopular
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                )}
              >
                {priceIdLoading === price.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </span>
                ) : isCurrentPlan ? (
                  'Current Plan'
                ) : subscription ? (
                  'Switch Plan'
                ) : (
                  'Get Started'
                )}
              </button>

              {/* Features */}
              <ul className="mt-6 space-y-3">
                {getProductFeatures(product.name).map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* FAQ or additional info */}
      <div className="mt-16 text-center">
        <p className="text-zinc-500 text-sm">
          All plans include 14-day free trial. No credit card required to start.
        </p>
      </div>
    </div>
  );
}

function getProductFeatures(productName: string | null): string[] {
  const name = productName?.toLowerCase() || '';

  if (name.includes('enterprise') || name.includes('pro')) {
    return [
      'Unlimited AI conversations',
      'All premium models (GPT-4, Claude)',
      'Priority support',
      'Custom integrations',
      'Team collaboration',
      'Analytics dashboard'
    ];
  }

  if (name.includes('freelancer') || name.includes('starter')) {
    return [
      '10,000 tokens per month',
      'Access to GPT-4o-mini',
      'Email support',
      'Conversation history',
      'Export conversations'
    ];
  }

  // Default/Free tier
  return [
    '1,000 tokens per month',
    'Basic AI models',
    'Community support',
    '7-day conversation history'
  ];
}
