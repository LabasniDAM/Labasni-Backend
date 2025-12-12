#!/bin/bash
set -e

echo "🚀 Début du build Labasni Backend..."

# ========================================
# 1. INSTALLATION DES DÉPENDANCES NODE.JS
# ========================================
echo "📦 Installation des dépendances Node.js..."
npm install

# ========================================
# 2. BUILD DE L'APPLICATION NESTJS
# ========================================
echo "🔨 Build de l'application NestJS..."
npm run build

# ========================================
# 3. INSTALLATION DE PYTHON ET PIP
# ========================================
echo "🐍 Configuration de Python..."

# Vérifier que Python 3 est disponible
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 n'est pas installé"
    exit 1
fi

# Vérifier la version de Python
PYTHON_VERSION=$(python3 --version)
echo "✅ $PYTHON_VERSION détecté"

# Upgrade pip
echo "📦 Mise à jour de pip..."
python3 -m pip install --upgrade pip setuptools wheel

# ========================================
# 4. INSTALLATION DES DÉPENDANCES PYTHON
# ========================================
echo "📦 Installation des dépendances Python..."

# Créer un fichier requirements consolidé si nécessaire
if [ -f "requirements.txt" ]; then
    echo "✅ Utilisation de requirements.txt à la racine"
    pip install --no-cache-dir -r requirements.txt
elif [ -f "AI-Models/requirements.txt" ]; then
    echo "✅ Utilisation de AI-Models/requirements.txt"
    pip install --no-cache-dir -r AI-Models/requirements.txt
else
    echo "⚠️ Aucun requirements.txt trouvé, installation des packages essentiels..."
    pip install --no-cache-dir \
        numpy \
        scikit-learn \
        torch \
        torchvision \
        tensorflow-cpu==2.15.0 \
        Pillow \
        colormath \
        requests \
        python-dotenv \
        cloudinary \
        fastapi \
        uvicorn \
        python-multipart \
        pydantic \
        opencv-python-headless \
        mediapipe \
        rembg \
        ultralytics
fi

# ========================================
# 5. VÉRIFICATION DES INSTALLATIONS
# ========================================
echo "🔍 Vérification des installations Python..."
python3 -c "import numpy; print(f'✅ numpy {numpy.__version__}')" || echo "❌ numpy manquant"
python3 -c "import torch; print(f'✅ torch {torch.__version__}')" || echo "❌ torch manquant"
python3 -c "import tensorflow; print(f'✅ tensorflow {tensorflow.__version__}')" || echo "❌ tensorflow manquant"
python3 -c "import cv2; print(f'✅ opencv {cv2.__version__}')" || echo "❌ opencv manquant"
python3 -c "import fastapi; print(f'✅ fastapi installé')" || echo "❌ fastapi manquant"

# ========================================
# 6. CRÉATION DES DOSSIERS NÉCESSAIRES
# ========================================
echo "📁 Création des dossiers de travail..."
mkdir -p temp_uploads cache_images logs

echo "✅ Build terminé avec succès!"