import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function cleanLLMOutput(text: string): string {
  try {
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('JSON invalide: accolades non trouvées');
    }
    
    const jsonString = text.substring(startIndex, endIndex + 1);
    JSON.parse(jsonString); // Validation
    return jsonString;
  } catch (error) {
    console.error('🔴 Erreur nettoyage JSON:', error);
    throw new Error('Format JSON invalide');
  }
}

async function convertPdfToText(filePath: string) {
  console.log("📄 Conversion du PDF:", filePath);
  const supabase = createClient();
  
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('resumes')
    .download(filePath);

  if (downloadError) throw downloadError;

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const base64Data = buffer.toString('base64');

  const pythonProcess = spawn('python', [
    path.join(process.cwd(), 'scripts', 'pdf_converter.py')
  ]);

  let result = '';
  let error = '';

  pythonProcess.stdin.write(base64Data);
  pythonProcess.stdin.end();

  pythonProcess.stdout.on('data', (data) => {
    result += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    console.log("🐍 Log Python:", data.toString());
    error += data.toString();
  });

  const exitCode = await new Promise((resolve) => {
    pythonProcess.on('close', resolve);
  });

  if (exitCode !== 0) throw new Error(`Erreur Python: ${error}`);
  console.log("✅ Conversion PDF réussie");
  
  return JSON.parse(result);
}

async function structureCvWithOpenAI(text: string) {
  console.log("🤖 Structuration du CV avec OpenAI...");
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: "Tu es un expert en RH qui structure toutes les informations d'un CV en json."
      },
      {
        role: "user",
        content: `Voici le texte extrait d'un CV. Transforme-le en json structuré avec les sections suivantes sans oublier une seule information :
- Informations personnelles
- Formations
- Expériences professionnelles
- Compétences
- Langues
- Autres informations pertinentes

Texte du CV :
${text}`
      }
    ],
    temperature: 0.7,
    max_tokens: 4096
  });
  console.log("✅ Structuration CV terminée");
  return response.choices[0].message.content;
}

async function analyzeCompatibility(cvJson: string, jobMarkdown: string) {
  console.log("🔍 Analyse de compatibilité...");
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "Tu es un expert RH spécialisé dans l'analyse de compatibilité entre CV et offres d'emploi."
      },
      {
        role: "user",
        content: `Analyse la compatibilité entre ce CV et cette offre d'emploi. 
        Donne un score sur 100 et explique ton analyse.
        
        CV (format JSON):
        ${cvJson}
        
        Offre d'emploi:
        ${jobMarkdown}`
      }
    ],
    temperature: 0.7
  });
  console.log("✅ Analyse de compatibilité terminée");
  return response.choices[0].message.content;
}

export async function POST(request: Request) {
  console.log("\n🟢 --- DÉBUT DU MATCHING ---");
  let analyseId: string | undefined;
  
  try {
    const body = await request.json();
    analyseId = body.analyseId;
    const { cvPaths, jobContent } = body;
    
    console.log("📦 Données reçues:", { nbCVs: cvPaths.length, analyseId });
    
    const supabase = createClient();

    // Vérification des crédits
    const { data: analyse, error: analyseError } = await supabase
      .from('analyses')
      .select('user_id')
      .eq('id', analyseId)
      .single();

    if (analyseError || !analyse) {
      throw new Error('Analyse non trouvée');
    }

    // Vérifier les crédits disponibles
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('credits')
      .eq('user_id', analyse.user_id)
      .in('status', ['trialing', 'active'])
      .single();

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
    await supabase
      .from('analyses')
      .update({ status: 'processing' })
      .eq('id', analyseId);

    console.log("🔄 Traitement de l'offre d'emploi...");
    const jobMarkdown = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Structure cette offre d'emploi en markdown."
        },
        {
          role: "user",
          content: jobContent
        }
      ]
    });

    const jobMarkdownResponse = jobMarkdown.choices[0].message.content;
    if (!jobMarkdownResponse) throw new Error('Pas de réponse markdown');
    console.log("✅ Offre d'emploi structurée");

    // Analyse de chaque CV
    console.log("🔄 Analyse des CVs...");
    const results = await Promise.all(cvPaths.map(async (cvPath: string) => {
      console.log(`📄 Traitement du CV: ${cvPath}`);
      
      // Conversion PDF -> Texte
      const { text } = await convertPdfToText(cvPath);
      
      // Structuration en JSON
      const llmResponse = await structureCvWithOpenAI(text);
      if (!llmResponse) throw new Error('Pas de réponse du LLM');
      const cvJson = cleanLLMOutput(llmResponse);
      
      // Analyse de compatibilité
      const compatibility = await analyzeCompatibility(cvJson, jobMarkdownResponse);

      return {
        cvPath,
        cvJson,
        compatibility
      };
    }));

    console.log("💾 Sauvegarde des résultats...");
    // Sauvegarde des résultats
    await supabase
      .from('analyses')
      .update({
        status: 'completed',
        result: {
          job_markdown: jobMarkdown.choices[0].message.content,
          matches: results
        }
      })
      .eq('id', analyseId);

    // Décrémenter les crédits
    console.log("💳 Mise à jour des crédits...");
    const { error: creditError } = await supabase.rpc('decrement_credits', {
      p_user_id: analyse.user_id,
      p_amount: 1
    });

    if (creditError) {
      console.error('❌ Erreur mise à jour crédits:', creditError);
    }

    console.log("🏁 --- FIN DU MATCHING ---\n");
    return new NextResponse(JSON.stringify({ 
      success: true,
      results,
      creditsLeft: subscription.credits - 1
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
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

    return new NextResponse(JSON.stringify({ 
      error: 'Erreur analyse',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}