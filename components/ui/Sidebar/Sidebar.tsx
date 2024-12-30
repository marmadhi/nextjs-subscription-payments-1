'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/cn';
import CreditsDisplay from '../Credits/CreditsDisplay';

type SidebarProps = {
  credits?: number;
  userId?: string;
  customerId?: string;
  subscriptionId?: string;
  hasSubscription: boolean;
};

const sidebarLinks = [
  {
    label: 'Mon abonnement',
    href: '/account',
    icon: '💳'
  },
  {
    label: 'Mes coordonnées',
    href: '/account/profile',
    icon: '👤'
  },
  {
    label: 'Mes analyses',
    href: '/account/analyses',
    icon: '📊'
  },
  {
    label: 'Mes factures',
    href: '/account/invoices',
    icon: '📄'
  }
];

export default function Sidebar({ credits, subscriptionId, hasSubscription }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="w-64 h-full bg-zinc-900 text-white">
      <nav className="p-4 space-y-6">
        <div className="px-4 py-2">
          {hasSubscription && typeof credits === 'number' && subscriptionId ? (
            <CreditsDisplay 
              initialCredits={credits} 
              subscriptionId={subscriptionId}
            />
          ) : (
            <Link
              href="/pricing"
              className="block w-full px-4 py-2 text-center bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              S'abonner
            </Link>
          )}
        </div>

        {hasSubscription && (
          <div className="px-2">
            <Link
              href="/account/analyse"
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                'bg-blue-600 hover:bg-blue-700 text-white font-medium',
                pathname === '/account/analyse' ? 'bg-blue-700' : ''
              )}
            >
              <span className="text-xl">🔍</span>
              <span className="text-lg">Analyser</span>
            </Link>
          </div>
        )}

        <div className="h-px bg-zinc-800" />

        <ul className="space-y-2">
          {sidebarLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors',
                  'hover:bg-zinc-800',
                  pathname === link.href ? 'bg-zinc-800' : 'transparent'
                )}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
} 