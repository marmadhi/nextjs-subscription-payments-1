'use client';

/**
 * Admin Dashboard Component
 * Interactive dashboard for admin users to monitor AI usage and system metrics
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';

interface UsageStats {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Record<string, { calls: number; tokens: number; cost: number }>;
  byModel: Record<string, { calls: number; cost: number; avgLatencyMs: number }>;
}

interface TopUser {
  userId: string;
  email?: string;
  stats: UsageStats;
}

interface DailyUsage {
  date: string;
  cost: number;
  tokens: number;
  calls: number;
}

export default function AdminDashboard() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [period]);

  async function fetchData() {
    setLoading(true);
    setError(null);

    try {
      // Fetch global stats
      const statsRes = await fetch(`/api/admin/stats?period=${period}`);
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
        setTopUsers(data.topUsers || []);
        setDailyUsage(data.dailyUsage || []);
      } else {
        // If admin endpoint doesn't exist yet, show placeholder data
        setStats({
          totalCalls: 0,
          totalTokens: 0,
          totalCost: 0,
          byProvider: {},
          byModel: {}
        });
        setTopUsers([]);
        setDailyUsage([]);
      }
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Period Selector */}
      <div className="flex gap-2">
        {(['day', 'week', 'month'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              period === p
                ? 'bg-pink-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total API Calls"
          value={stats?.totalCalls.toLocaleString() || '0'}
          subtitle="This period"
          icon="📊"
        />
        <StatCard
          title="Total Tokens"
          value={formatNumber(stats?.totalTokens || 0)}
          subtitle="Input + Output"
          icon="🔤"
        />
        <StatCard
          title="Total Cost"
          value={`$${(stats?.totalCost || 0).toFixed(2)}`}
          subtitle="API spend"
          icon="💰"
        />
        <StatCard
          title="Active Users"
          value={topUsers.length.toString()}
          subtitle="With usage this period"
          icon="👥"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage by Provider */}
        <Card title="Usage by Provider">
          <div className="space-y-4">
            {Object.entries(stats?.byProvider || {}).map(([provider, data]) => (
              <div key={provider} className="flex items-center justify-between">
                <div>
                  <span className="text-white font-medium capitalize">{provider}</span>
                  <span className="text-zinc-500 text-sm ml-2">
                    {data.calls.toLocaleString()} calls
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-pink-400 font-medium">
                    ${data.cost.toFixed(2)}
                  </span>
                  <span className="text-zinc-500 text-sm ml-2">
                    {formatNumber(data.tokens)} tokens
                  </span>
                </div>
              </div>
            ))}
            {Object.keys(stats?.byProvider || {}).length === 0 && (
              <p className="text-zinc-500 text-center py-4">No data yet</p>
            )}
          </div>
        </Card>

        {/* Usage by Model */}
        <Card title="Usage by Model">
          <div className="space-y-4 max-h-64 overflow-y-auto">
            {Object.entries(stats?.byModel || {})
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([model, data]) => (
                <div key={model} className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-medium text-sm">{model}</span>
                    <span className="text-zinc-500 text-xs ml-2">
                      {data.calls.toLocaleString()} calls
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-pink-400 font-medium text-sm">
                      ${data.cost.toFixed(2)}
                    </span>
                    <span className="text-zinc-500 text-xs ml-2">
                      {Math.round(data.avgLatencyMs)}ms avg
                    </span>
                  </div>
                </div>
              ))}
            {Object.keys(stats?.byModel || {}).length === 0 && (
              <p className="text-zinc-500 text-center py-4">No data yet</p>
            )}
          </div>
        </Card>
      </div>

      {/* Daily Usage Chart */}
      <Card title="Daily Usage Trend">
        <div className="h-64">
          {dailyUsage.length > 0 ? (
            <div className="flex items-end justify-between h-full gap-1">
              {dailyUsage.slice(-30).map((day, index) => {
                const maxCost = Math.max(...dailyUsage.map((d) => d.cost));
                const height = maxCost > 0 ? (day.cost / maxCost) * 100 : 0;

                return (
                  <div
                    key={day.date}
                    className="flex-1 group relative"
                    style={{ height: '100%' }}
                  >
                    <div
                      className="absolute bottom-0 w-full bg-pink-500/60 hover:bg-pink-500 transition rounded-t"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-zinc-800 px-2 py-1 rounded text-xs whitespace-nowrap z-10">
                      <div className="text-white">{day.date}</div>
                      <div className="text-pink-400">${day.cost.toFixed(2)}</div>
                      <div className="text-zinc-400">{day.calls} calls</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              No usage data available
            </div>
          )}
        </div>
      </Card>

      {/* Top Users Table */}
      <Card title="Top Users by Usage">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-zinc-400 text-sm border-b border-zinc-800">
                <th className="pb-3 font-medium">User</th>
                <th className="pb-3 font-medium text-right">Calls</th>
                <th className="pb-3 font-medium text-right">Tokens</th>
                <th className="pb-3 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {topUsers.slice(0, 10).map((user, index) => (
                <tr key={user.userId} className="text-sm">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">#{index + 1}</span>
                      <span className="text-white font-mono text-xs">
                        {user.email || user.userId.slice(0, 8)}...
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-right text-zinc-300">
                    {user.stats.totalCalls.toLocaleString()}
                  </td>
                  <td className="py-3 text-right text-zinc-300">
                    {formatNumber(user.stats.totalTokens)}
                  </td>
                  <td className="py-3 text-right text-pink-400 font-medium">
                    ${user.stats.totalCost.toFixed(2)}
                  </td>
                </tr>
              ))}
              {topUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-zinc-500">
                    No user data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ActionButton
            label="Run Benchmarks"
            icon="⚡"
            href="/admin/benchmarks"
          />
          <ActionButton
            label="Manage Quotas"
            icon="📊"
            href="/admin/quotas"
          />
          <ActionButton
            label="View Logs"
            icon="📜"
            href="/admin/logs"
          />
          <ActionButton
            label="Settings"
            icon="⚙️"
            href="/admin/settings"
          />
        </div>
      </Card>
    </div>
  );
}

// Helper Components

function StatCard({
  title,
  value,
  subtitle,
  icon
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
}) {
  return (
    <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <span className="text-2xl">{icon}</span>
        <span className="text-3xl font-bold text-white">{value}</span>
      </div>
      <h3 className="text-zinc-400 font-medium">{title}</h3>
      <p className="text-zinc-500 text-sm">{subtitle}</p>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  href
}: {
  label: string;
  icon: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg p-4 transition"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-white font-medium">{label}</span>
    </a>
  );
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toString();
}
