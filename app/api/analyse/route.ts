import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req: Request) {
  let analyseId: string | undefined;
  
  try {
    const body = await req.json();
    ({ analyseId } = body);
    const { projectName, code } = body;
    
    const supabase = createClient();

    // D'abord récupérer l'analyse pour avoir le user_id
    const { data: analyse, error: analyseError } = await supabase
      .from('analyses')
      .select('user_id')
      .eq('id', analyseId)
      .single();

    if (analyseError || !analyse) {
      console.error('❌ Erreur récupération analyse:', analyseError);
      throw analyseError;
    }

    // Récupérer la subscription active du user
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('id, credits')
      .eq('user_id', analyse.user_id)
      .in('status', ['trialing', 'active'])
      .single();

    console.log('📊 Données subscription:', {
      user_id: analyse.user_id,
      subscription_id: subscription?.id,
      credits: subscription?.credits
    });

    if (subError || !subscription) {
      console.error('❌ Erreur vérification crédits:', subError);
      return NextResponse.json({ 
        error: 'Abonnement non trouvé',
        details: 'Impossible de vérifier les crédits'
      }, { status: 400 });
    }

    if (subscription.credits <= 0) {
      return NextResponse.json({ 
        error: 'Crédits insuffisants',
        details: 'Veuillez recharger vos crédits'
      }, { status: 400 });
    }

    // Mise à jour status
    const { error: updateError } = await supabase
      .from('analyses')
      .update({ status: 'processing' })
      .eq('id', analyseId);

    if (updateError) throw updateError;

    // Appel GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es un expert en analyse de code. Tu dois fournir une analyse détaillée du code fourni."
        },
        {
          role: "user",
          content: `Analyse ce code du projet "${projectName}" :\n\n${code}`
        }
      ]
    });

    // Sauvegarde résultat d'abord
    const { error: saveError } = await supabase
      .from('analyses')
      .update({
        status: 'completed',
        result: { analysis: completion.choices[0].message.content }
      })
      .eq('id', analyseId);

    if (saveError) throw saveError;

    // Décrémenter les crédits après, de manière non bloquante
    console.log('🔄 Tentative de décrémentation des crédits avec:', {
      p_user_id: analyse.user_id,
      p_amount: 1
    });

    const { data: decrementData, error: creditError } = await supabase
      .rpc('decrement_credits', {
        p_user_id: analyse.user_id,
        p_amount: 1
      });

    console.log('📝 Résultat décrémentation:', {
      data: decrementData,
      error: creditError
    });

    if (creditError) {
      console.error('❌ Erreur mise à jour crédits:', creditError);
    }

    // Vérification post-décrémentation
    const { data: updatedSub } = await supabase
      .from('subscriptions')
      .select('credits')
      .eq('user_id', analyse.user_id)
      .single();

    console.log('✅ Crédits après mise à jour:', updatedSub?.credits);

    return NextResponse.json({ 
      success: true,
      creditsLeft: subscription.credits - 1
    });

  } catch (error) {
    console.error('💥 Erreur:', error);
    
    if (analyseId) {
      const supabase = createClient();
      await supabase
        .from('analyses')
        .update({ status: 'error' })
        .eq('id', analyseId);
    }

    return NextResponse.json({ 
      error: 'Erreur analyse',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 