import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function structureWithOpenAI(text: string) {
  console.log("🤖 Début de la structuration OpenAI...");
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
  console.log("🤖 Structuration OpenAI terminée");
  return response.choices[0].message.content;
}

function cleanLLMOutput(text: string): string {
  try {
    // Trouver le premier caractère {
    const startIndex = text.indexOf('{');
    // Trouver le dernier caractère }
    const endIndex = text.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('JSON invalide: accolades non trouvées');
    }
    
    // Extraire uniquement le contenu entre les accolades
    const jsonString = text.substring(startIndex, endIndex + 1);
    
    // Vérifier que c'est un JSON valide
    JSON.parse(jsonString);
    
    return jsonString;
  } catch (error) {
    console.error('🔴 Erreur nettoyage JSON:', error);
    throw new Error('Format JSON invalide');
  }
}

export async function POST(request: Request) {
  console.log("\n🟢 --- DÉBUT DE LA CONVERSION ---");
  
  try {
    const { filePath } = await request.json();
    console.log("📦 FilePath reçu:", filePath);
    
    const supabase = createClient();
    console.log("🔌 Client Supabase créé");
    
    console.log("📥 Téléchargement du fichier depuis Supabase...");
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('resumes')
      .download(filePath);

    if (downloadError) {
      console.error("🔴 Erreur téléchargement:", downloadError);
      throw downloadError;
    }
    console.log("✅ Fichier téléchargé avec succès");

    // Convertir en base64
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64Data = buffer.toString('base64');
    console.log("📝 Fichier converti en base64");

    // Python
    console.log("🐍 Lancement du script Python...");
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

    if (exitCode !== 0) {
      console.error("🔴 Erreur Python:", error);
      throw new Error(`Erreur Python: ${error}`);
    }

    console.log("✅ Script Python terminé");
    const pythonResult = JSON.parse(result);
    
    if (!pythonResult.success) {
      throw new Error(pythonResult.error);
    }

    console.log("🤖 Envoi à OpenAI pour structuration...");
    const llmResponse = await structureWithOpenAI(pythonResult.text);
    if (!llmResponse) throw new Error('Pas de réponse du LLM');
    const cleanedJson = cleanLLMOutput(llmResponse);
    console.log("✅ Structuration et nettoyage terminés");

    const response = { 
      success: true,
      raw_text: pythonResult.text,
      markdown_text: cleanedJson,
      numpages: pythonResult.numpages
    };

    console.log("🏁 --- FIN DE LA CONVERSION ---\n");
    return NextResponse.json(response);

  } catch (error) {
    console.error("🔴 Erreur finale:", error);
    return NextResponse.json({ 
      error: 'Erreur de conversion',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 