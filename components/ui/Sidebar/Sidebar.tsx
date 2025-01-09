'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/cn';
import CreditsDisplay from '../Credits/CreditsDisplay';
import { 
  CreditCard, 
  User, 
  BarChart, 
  FileText,
  Search,
  FileUp,
  GitCompare
} from 'lucide-react';

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
    icon: CreditCard
  },
  {
    label: 'Mes coordonnées',
    href: '/account/profile',
    icon: User
  },
  {
    label: 'Mes analyses',
    href: '/account/analyses',
    icon: BarChart
  },
  {
    label: 'Mes factures',
    href: '/account/invoices',
    icon: FileText
  }
];

export default function Sidebar({ credits, subscriptionId, hasSubscription }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="w-80 bg-background text-text border-r border-gray-200">
      <nav className="p-8 space-y-6">
        <div className="">
          {hasSubscription && typeof credits === 'number' && subscriptionId ? (
            <CreditsDisplay 
              initialCredits={credits} 
              subscriptionId={subscriptionId}
            />
          ) : (
            <Link
              href="/pricing"
              className="block w-full px-4 py-2 text-center bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              S'abonner
            </Link>
          )}
        </div>

        {hasSubscription && (
          <div className="">
            <Link
              href="/account/analyse"
              className={cn(
                'flex gap-3 hover:bg-zinc-100 items-center px-4 py-2 rounded-lg transition-colors',
                pathname === '/account/analyse' ? 'bg-zinc-100' : ''
              )}
            >
              <Search className="w-5 h-5" />
              <span className="">Analyser</span>
            </Link>
            <Link
              href="/account/conversion"
              className={cn(
                'flex gap-3 hover:bg-zinc-100 items-center px-4 py-2 rounded-lg transition-colors',
                pathname === '/account/conversion' ? 'bg-zinc-100' : ''
              )}
            >
              <FileUp className="w-5 h-5" />
              <span className="">Convertir PDF</span>
            </Link>
            <Link
              href="/account/matching"
              className={cn(
                'flex gap-3 hover:bg-zinc-100 items-center px-4 py-2 rounded-lg transition-colors',
                pathname === '/account/matching' ? 'bg-zinc-100' : ''
              )}
            >
              <GitCompare className="w-5 h-5" />
              <span className="">Matching CV/Offre</span>
            </Link>
          </div>
        )}

        <div className="h-px bg-gray-200" />

        <ul className="space-y-2">
          {sidebarLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'flex gap-3 hover:bg-zinc-100 items-center px-4 py-2 rounded-lg transition-colors',
                  pathname === link.href ? 'bg-zinc-100' : 'transparent'
                )}
              >
                <link.icon className="w-5 h-5" />
                <span>{link.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
} 