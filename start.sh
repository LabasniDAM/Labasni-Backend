#!/bin/bash
set -e

echo "🚀 Starting NestJS backend..."

# Vérifier que le build existe
if [ ! -f "dist/main.js" ]; then
    echo "❌ Erreur: dist/main.js introuvable. Lancez build.sh d'abord."
    exit 1
fi

# Définir les variables d'environnement
export NODE_ENV=production
export PORT=${PORT:-3000}

# Démarrer NestJS
echo "✅ Démarrage sur le port $PORT..."
node dist/main.js