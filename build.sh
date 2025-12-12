#!/bin/bash
set -e

echo "🔨 Building NestJS backend..."

# 1. Installer les dépendances Node.js
echo "📦 Installation des dépendances Node.js..."
npm install

# 2. Build NestJS
echo "🔨 Build de l'application NestJS..."
npm run build

# 3. Vérifier que le build a réussi
if [ ! -f "dist/main.js" ]; then
    echo "❌ Erreur: dist/main.js introuvable"
    exit 1
fi

echo "✅ Build terminé avec succès!"