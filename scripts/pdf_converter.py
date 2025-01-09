import sys
import json
from PyPDF2 import PdfReader
from base64 import b64decode
from io import BytesIO

def convert_pdf_to_text(pdf_base64):
    try:
        print("🐍 Python: Début de la conversion...", file=sys.stderr)
        
        # Décoder le PDF depuis base64
        pdf_bytes = b64decode(pdf_base64)
        print("🐍 Python: PDF décodé depuis base64", file=sys.stderr)
        
        pdf_file = BytesIO(pdf_bytes)
        
        # Lire le PDF
        reader = PdfReader(pdf_file)
        print(f"🐍 Python: PDF chargé, {len(reader.pages)} pages trouvées", file=sys.stderr)
        
        text = ""
        # Extraire le texte
        for i, page in enumerate(reader.pages, 1):
            text += page.extract_text() + "\n"
            print(f"🐍 Python: Page {i}/{len(reader.pages)} extraite", file=sys.stderr)

        # Retourner le résultat
        result = {
            "success": True,
            "text": text,
            "numpages": len(reader.pages)
        }
        print("🐍 Python: Conversion terminée avec succès", file=sys.stderr)
        print(json.dumps(result))
        
    except Exception as e:
        print(f"🐍 Python ERROR: {str(e)}", file=sys.stderr)
        error = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error))

if __name__ == "__main__":
    print("🐍 Python: Démarrage du script", file=sys.stderr)
    pdf_base64 = sys.stdin.read().strip()
    convert_pdf_to_text(pdf_base64) 