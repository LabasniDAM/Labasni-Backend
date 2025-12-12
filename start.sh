#!/bin/bash
set -e

echo "🚀 Démarrage des services Labasni Backend..."

# Fonction pour nettoyer les processus à la sortie
cleanup() {
    echo "🛑 Arrêt des services..."
    if [ ! -z "$PYTHON_PID" ]; then
        kill $PYTHON_PID 2>/dev/null || true
    fi
    if [ ! -z "$NODE_PID" ]; then
        kill $NODE_PID 2>/dev/null || true
    fi
    exit 0
}

# Capturer les signaux pour nettoyer proprement
trap cleanup SIGTERM SIGINT

# ========================================
# 1. VÉRIFICATION DE L'ENVIRONNEMENT
# ========================================
echo "🔍 Vérification de l'environnement..."

# Vérifier Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 n'est pas installé"
    exit 1
fi
echo "✅ Python: $(python3 --version)"

# Vérifier Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé"
    exit 1
fi
echo "✅ Node: $(node --version)"

# Vérifier que le build NestJS existe
if [ ! -f "dist/main.js" ]; then
    echo "❌ Erreur: dist/main.js introuvable. Le build n'a pas réussi."
    exit 1
fi
echo "✅ Build NestJS trouvé"

# Vérifier les modules Python critiques
echo "🔍 Vérification des modules Python critiques..."
python3 -c "import numpy" 2>/dev/null && echo "✅ numpy installé" || echo "⚠️ numpy manquant"
python3 -c "import torch" 2>/dev/null && echo "✅ torch installé" || echo "⚠️ torch manquant"
python3 -c "import tensorflow" 2>/dev/null && echo "✅ tensorflow installé" || echo "⚠️ tensorflow manquant"
python3 -c "import fastapi" 2>/dev/null && echo "✅ fastapi installé" || echo "⚠️ fastapi manquant"

# ========================================
# 2. CRÉER LES DOSSIERS NÉCESSAIRES
# ========================================
echo "📁 Création des dossiers de travail..."
mkdir -p temp_uploads cache_images logs

# ========================================
# 3. DÉMARRER LE SERVICE PYTHON VTO
# ========================================
if [ -d "src/python-vto-service" ] && [ -f "src/python-vto-service/main.py" ]; then
    echo "🐍 Démarrage du service Python VTO sur le port 5001..."
    
    # Aller dans le dossier du service
    cd src/python-vto-service
    
    # Démarrer uvicorn en arrière-plan
    python3 -m uvicorn main:app --host 0.0.0.0 --port 5001 --log-level info > /app/logs/python-vto.log 2>&1 &
    PYTHON_PID=$!
    
    # Retour au dossier racine
    cd ../..
    
    # Attendre que le service Python soit prêt
    echo "⏳ Attente du démarrage du service Python..."
    sleep 5
    
    # Vérifier que le service Python est bien démarré
    if kill -0 $PYTHON_PID 2>/dev/null; then
        echo "✅ Service Python VTO démarré (PID: $PYTHON_PID)"
        
        # Test de connexion
        if curl -s http://localhost:5001/health > /dev/null 2>&1; then
            echo "✅ Service Python VTO répond aux requêtes"
        else
            echo "⚠️ Service Python VTO démarré mais ne répond pas encore"
        fi
    else
        echo "❌ Le service Python n'a pas démarré correctement"
        echo "📋 Logs Python VTO:"
        cat /app/logs/python-vto.log 2>/dev/null || echo "Aucun log disponible"
        exit 1
    fi
else
    echo "⚠️ Service Python VTO introuvable à src/python-vto-service/main.py"
    echo "⚠️ Démarrage uniquement de NestJS..."
    PYTHON_PID=""
fi

# ========================================
# 4. DÉMARRER LE SERVICE NESTJS
# ========================================
echo "🟢 Démarrage du service NestJS sur le port ${PORT:-3000}..."

# Exporter les variables d'environnement
export NODE_ENV=production
export PORT=${PORT:-3000}

# Démarrer NestJS en arrière-plan
node dist/main.js > /app/logs/nestjs.log 2>&1 &
NODE_PID=$!

# Attendre que NestJS démarre
echo "⏳ Attente du démarrage de NestJS..."
sleep 3

# Vérifier que NestJS est bien démarré
if kill -0 $NODE_PID 2>/dev/null; then
    echo "✅ Service NestJS démarré (PID: $NODE_PID)"
    
    # Test de connexion (attendre jusqu'à 30 secondes)
    echo "🔍 Test de connexion au service NestJS..."
    for i in {1..30}; do
        if curl -s http://localhost:${PORT:-3000}/health > /dev/null 2>&1; then
            echo "✅ Service NestJS répond aux requêtes"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "⚠️ Service NestJS ne répond pas après 30 secondes"
            echo "📋 Logs NestJS:"
            tail -n 50 /app/logs/nestjs.log 2>/dev/null || echo "Aucun log disponible"
        fi
        sleep 1
    done
else
    echo "❌ Le service NestJS n'a pas démarré correctement"
    echo "📋 Logs NestJS:"
    cat /app/logs/nestjs.log 2>/dev/null || echo "Aucun log disponible"
    
    # Nettoyer le service Python si il tourne
    if [ ! -z "$PYTHON_PID" ]; then
        kill $PYTHON_PID 2>/dev/null || true
    fi
    exit 1
fi

# ========================================
# 5. AFFICHAGE DES INFORMATIONS
# ========================================
echo ""
echo "=========================================="
echo "🎉 Tous les services sont opérationnels!"
echo "=========================================="
echo "📍 Services actifs:"
echo "   - NestJS API: http://0.0.0.0:${PORT:-3000} (PID: $NODE_PID)"
if [ ! -z "$PYTHON_PID" ]; then
    echo "   - Python VTO: http://localhost:5001 (PID: $PYTHON_PID)"
fi
echo ""
echo "📋 Logs disponibles:"
echo "   - NestJS: /app/logs/nestjs.log"
if [ ! -z "$PYTHON_PID" ]; then
    echo "   - Python VTO: /app/logs/python-vto.log"
fi
echo ""
echo "🔍 Health Checks:"
echo "   - NestJS: curl http://localhost:${PORT:-3000}/health"
if [ ! -z "$PYTHON_PID" ]; then
    echo "   - Python VTO: curl http://localhost:5001/health"
fi
echo "=========================================="

# ========================================
# 6. SURVEILLANCE DES PROCESSUS
# ========================================
echo "👀 Surveillance des processus en cours..."
echo "   (Appuyez sur Ctrl+C pour arrêter tous les services)"

# Fonction pour surveiller les processus
monitor_processes() {
    while true; do
        # Vérifier NestJS
        if ! kill -0 $NODE_PID 2>/dev/null; then
            echo "❌ Service NestJS s'est arrêté!"
            echo "📋 Dernières lignes du log:"
            tail -n 20 /app/logs/nestjs.log 2>/dev/null
            cleanup
        fi
        
        # Vérifier Python VTO (si présent)
        if [ ! -z "$PYTHON_PID" ] && ! kill -0 $PYTHON_PID 2>/dev/null; then
            echo "❌ Service Python VTO s'est arrêté!"
            echo "📋 Dernières lignes du log:"
            tail -n 20 /app/logs/python-vto.log 2>/dev/null
            cleanup
        fi
        
        sleep 10
    done
}

# Surveiller en arrière-plan
monitor_processes &
MONITOR_PID=$!

# Attendre que l'un des processus se termine
if [ ! -z "$PYTHON_PID" ]; then
    wait $NODE_PID $PYTHON_PID
else
    wait $NODE_PID
fi

# Nettoyer le moniteur
kill $MONITOR_PID 2>/dev/null || true