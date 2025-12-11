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

# Démarrer le service Python VTO en arrière-plan
echo "🐍 Démarrage du service Python VTO sur le port 5001..."
cd /app/src/python-vto-service
python3 -m uvicorn main:app --host 0.0.0.0 --port 5001 &
PYTHON_PID=$!

# Attendre que le service Python soit prêt
echo "⏳ Attente du démarrage du service Python..."
sleep 3

# Vérifier que le service Python est bien démarré
if ! kill -0 $PYTHON_PID 2>/dev/null; then
    echo "❌ Erreur: Le service Python n'a pas démarré correctement"
    exit 1
fi

echo "✅ Service Python VTO démarré (PID: $PYTHON_PID)"

# Démarrer le service NestJS
echo "🟢 Démarrage du service NestJS..."
cd /app
node dist/main.js &
NODE_PID=$!

# Attendre que NestJS démarre
sleep 2

# Vérifier que NestJS est bien démarré
if ! kill -0 $NODE_PID 2>/dev/null; then
    echo "❌ Erreur: Le service NestJS n'a pas démarré correctement"
    kill $PYTHON_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Service NestJS démarré (PID: $NODE_PID)"
echo "🎉 Tous les services sont opérationnels!"

# Attendre que l'un des processus se termine
wait $NODE_PID $PYTHON_PID

