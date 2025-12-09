'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Link from 'next/link';

interface QuotaData {
  plan: string;
  limits: {
    maxTokensPerMonth: number;
    maxCallsPerDay: number;
    maxCostPerMonth: number;
    allowedModels: string[];
  };
  usage: {
    tokensThisMonth: number;
    callsToday: number;
    costThisMonth: number;
  };
  remaining: {
    tokens: number;
    callsToday: number;
    cost: number;
  };
  percentUsed: {
    tokens: number;
    cost: number;
    callsToday: number;
  };
}

interface SubscriptionDetailsProps {
  subscription: any;
}

export default function SubscriptionDetails({ subscription }: SubscriptionDetailsProps) {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuota();
  }, []);

  const loadQuota = async () => {
    try {
      const response = await fetch('/api/ai/quota');
      if (response.ok) {
        const data = await response.json();
        setQuota(data);
      }
    } catch (error) {
      console.error('Failed to load quota:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR').format(num);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400';
      case 'trialing':
        return 'text-blue-400';
      case 'canceled':
        return 'text-red-400';
      default:
        return 'text-zinc-400';
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <>
      {/* Subscription Status Card */}
      <Card
        title="Subscription Status"
        description={
          subscription
            ? `Your subscription is ${subscription.status}`
            : 'You have no active subscription'
        }
      >
        {subscription ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-zinc-400">Plan</p>
                <p className="text-lg font-semibold text-white">
                  {subscription.prices?.products?.name || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-400">Status</p>
                <p className={`text-lg font-semibold capitalize ${getStatusColor(subscription.status)}`}>
                  {subscription.status}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-400">Price</p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency((subscription.prices?.unit_amount || 0) / 100)}
                  /{subscription.prices?.interval}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-400">Next billing</p>
                <p className="text-lg font-semibold text-white">
                  {new Date(subscription.current_period_end).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              View Plans
            </Link>
          </div>
        )}
      </Card>

      {/* AI Usage Quota Card */}
      <Card
        title="AI Usage & Quotas"
        description={
          loading
            ? 'Loading your usage data...'
            : quota
              ? `Plan: ${quota.plan.charAt(0).toUpperCase() + quota.plan.slice(1)}`
              : 'Unable to load quota data'
        }
      >
        {loading ? (
          <div className="mt-4 animate-pulse space-y-4">
            <div className="h-4 bg-zinc-700 rounded w-3/4"></div>
            <div className="h-4 bg-zinc-700 rounded w-1/2"></div>
            <div className="h-4 bg-zinc-700 rounded w-2/3"></div>
          </div>
        ) : quota ? (
          <div className="mt-4 space-y-6">
            {/* Tokens Usage */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">Tokens this month</span>
                <span className="text-white">
                  {formatNumber(quota.usage.tokensThisMonth)} / {formatNumber(quota.limits.maxTokensPerMonth)}
                </span>
              </div>
              <div className="w-full bg-zinc-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${getProgressColor(quota.percentUsed.tokens)}`}
                  style={{ width: `${Math.min(100, quota.percentUsed.tokens)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {formatNumber(quota.remaining.tokens)} tokens remaining
              </p>
            </div>

            {/* Calls Today */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">API Calls today</span>
                <span className="text-white">
                  {quota.usage.callsToday} / {quota.limits.maxCallsPerDay}
                </span>
              </div>
              <div className="w-full bg-zinc-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${getProgressColor(quota.percentUsed.callsToday)}`}
                  style={{ width: `${Math.min(100, quota.percentUsed.callsToday)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {quota.remaining.callsToday} calls remaining today
              </p>
            </div>

            {/* Cost This Month */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">Cost this month</span>
                <span className="text-white">
                  {formatCurrency(quota.usage.costThisMonth)} / {formatCurrency(quota.limits.maxCostPerMonth)}
                </span>
              </div>
              <div className="w-full bg-zinc-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${getProgressColor(quota.percentUsed.cost)}`}
                  style={{ width: `${Math.min(100, quota.percentUsed.cost)}%` }}
                />
              </div>
            </div>

            {/* Available Models */}
            <div>
              <p className="text-sm text-zinc-400 mb-2">Available Models</p>
              <div className="flex flex-wrap gap-2">
                {quota.limits.allowedModels.length === 0 ? (
                  <span className="text-xs bg-green-900/50 text-green-400 px-2 py-1 rounded">
                    All models available
                  </span>
                ) : (
                  quota.limits.allowedModels.map((model) => (
                    <span
                      key={model}
                      className="text-xs bg-zinc-700 text-zinc-300 px-2 py-1 rounded"
                    >
                      {model}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Upgrade CTA */}
            {quota.plan === 'free' && (
              <div className="pt-4 border-t border-zinc-700">
                <Link
                  href="/"
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                >
                  Upgrade for more usage
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 text-zinc-500">
            <p>No quota data available. Please try again later.</p>
          </div>
        )}
      </Card>
    </>
  );
}
