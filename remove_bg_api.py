#!/usr/bin/env python3

import sys
import argparse
import requests
import os

# ⚠️ REMPLACE "YOUR_API_KEY_HERE" PAR TA VRAIE CLÉ API
API_KEY = "sPoUetb6QukK5u8wkNyQwJhE" #api cle aziz n efface pas 

def remove_background(input_path, output_path):

    try:
        # Vérifie que la clé API est configurée
        if API_KEY == "YOUR_API_KEY_HERE":
            print("❌ Erreur : Configure ta clé API dans le script", file=sys.stderr)
            print("Obtiens-la sur: https://www.remove.bg/api", file=sys.stderr)
            return False
        
        # Vérifie que le fichier existe
        if not os.path.exists(input_path):
            print(f"❌ Erreur : Fichier introuvable : {input_path}", file=sys.stderr)
            return False
        
        print(f"🔄 Suppression du background pour : {input_path}")
        
        # Lit l'image
        with open(input_path, 'rb') as image_file:
            response = requests.post(
                'https://api.remove.bg/v1.0/removebg',
                files={'image_file': image_file},
                data={'size': 'auto'},  # 'auto', 'preview', 'full', 'medium', 'hd', '4k'
                headers={'X-Api-Key': API_KEY},
                timeout=30
            )
        
        # Vérifie le statut
        if response.status_code == requests.codes.ok:
            # Sauvegarde l'image sans BG
            with open(output_path, 'wb') as out_file:
                out_file.write(response.content)
            
            print(f"✅ Background supprimé : {output_path}")
            
            # Affiche les crédits restants
            credits_remaining = response.headers.get('X-Credits-Remaining', 'N/A')
            print(f"💰 Crédits restants : {credits_remaining}")
            
            return True
        else:
            # Gère les erreurs
            error_data = response.json()
            errors = error_data.get('errors', [])
            
            if errors:
                error_title = errors[0].get('title', 'Erreur inconnue')
                error_detail = errors[0].get('detail', '')
                print(f"❌ Erreur API : {error_title}", file=sys.stderr)
                if error_detail:
                    print(f"   Détail : {error_detail}", file=sys.stderr)
            else:
                print(f"❌ Erreur HTTP {response.status_code}", file=sys.stderr)
            
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Erreur : Timeout (délai dépassé)", file=sys.stderr)
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Erreur réseau : {str(e)}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"❌ Erreur inattendue : {str(e)}", file=sys.stderr)
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Supprime le background d\'une image via API remove.bg'
    )
    parser.add_argument('--input', required=True, help='Chemin de l\'image d\'entrée')
    parser.add_argument('--output', required=True, help='Chemin de l\'image de sortie')
    
    args = parser.parse_args()
    
    success = remove_background(args.input, args.output)
    sys.exit(0 if success else 1)