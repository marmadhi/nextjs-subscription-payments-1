'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type CreditsDisplayProps = {
  initialCredits: number;
  subscriptionId: string;
};

export default function CreditsDisplay({ initialCredits, subscriptionId }: CreditsDisplayProps) {
  const [credits, setCredits] = useState(initialCredits);
  const supabase = createClient();

  useEffect(() => {
    if (!subscriptionId) {
      console.log('❌ Pas de subscriptionId');
      return;
    }

    const channelName = `credits-${subscriptionId}-${Math.random()}`;
    console.log(`🔌 Configuration du channel "${channelName}" pour subscription:`, subscriptionId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `id=eq.${subscriptionId}`
        },
        (payload) => {
          console.log(`📦 [${channelName}] Payload reçu:`, payload);
          const newCredits = (payload.new as any)?.credits;
          if (typeof newCredits === 'number') {
            console.log(`💰 [${channelName}] Mise à jour des crédits: ${credits} -> ${newCredits}`);
            setCredits(newCredits);
          }
        }
      )
      .subscribe((status) => {
        console.log(`📡 [${channelName}] Statut de la connexion:`, status);
      });

    console.log(`🔍 [${channelName}] Valeurs initiales:`, { initialCredits, credits, subscriptionId });

    return () => {
      console.log(`🧹 Nettoyage du channel "${channelName}" pour:`, subscriptionId);
      supabase.removeChannel(channel);
    };
  }, [subscriptionId, supabase]);

  useEffect(() => {
    console.log('💳 Crédits mis à jour:', credits);
  }, [credits]);

  return (
    <div className="bg-blue-600/20 p-4 rounded-lg">
      <p className="text-3xl font-bold text-blue-400">{credits}</p>
      <p className="text-sm text-blue-300">crédits restants</p>
    </div>
  );
} 