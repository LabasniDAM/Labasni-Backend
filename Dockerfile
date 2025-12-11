# Dockerfile optimisé pour Labasni Backend (Node.js + Python 3.11)
FROM node:20-slim

# ========================================
# ÉTAPE 1 : Installer Python 3.11 (Compatible TensorFlow 2.15)
# ========================================
RUN apt-get update && apt-get install -y \
    software-properties-common \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Ajouter le repository deadsnakes pour Python 3.11
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3.11-distutils \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Créer les liens symboliques vers Python 3.11
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 && \
    update-alternatives --set python3 /usr/bin/python3.11 && \
    update-alternatives --set python /usr/bin/python3.11

# Vérifier la version Python (doit être 3.11.x)
RUN python --version && python3 --version

# ========================================
# ÉTAPE 2 : Installer dépendances système pour ML/CV
# ========================================
RUN apt-get update && apt-get install -y \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgthread-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip pour Python 3.11
RUN python -m pip install --upgrade pip setuptools wheel

# ========================================
# ÉTAPE 3 : Installer dépendances Node.js
# ========================================
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# ========================================
# ÉTAPE 4 : Installer dépendances Python (Versions Compatibles Python 3.11)
# ========================================

# Copier les fichiers requirements
COPY AI-Models/requirements.txt ./AI-Models/requirements.txt
COPY src/python-vto-service/requirements.txt ./src/python-vto-service/requirements.txt

# Installer les dépendances de base
RUN pip install --no-cache-dir \
    numpy==1.24.3 \
    scikit-learn==1.3.2 \
    Pillow==10.0.0 \
    colormath==3.0.0 \
    requests==2.31.0 \
    python-dotenv==1.0.0 \
    cloudinary==1.36.0

# Installer FastAPI et dépendances
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    python-multipart==0.0.6 \
    pydantic==2.5.0

# Installer OpenCV et dépendances CV
RUN pip install --no-cache-dir \
    opencv-python-headless==4.8.1.78 \
    mediapipe==0.10.8 \
    rembg==2.0.50

# Installer PyTorch CPU (compatible Python 3.11)
RUN pip install --no-cache-dir \
    torch==2.1.0+cpu \
    torchvision==0.16.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Installer TensorFlow CPU (compatible Python 3.11)
RUN pip install --no-cache-dir tensorflow-cpu==2.15.0

# Installer Ultralytics (YOLO)
RUN pip install --no-cache-dir ultralytics==8.0.227

# Vérifier les installations avec python3 aussi
RUN python -c "import numpy, torch, tensorflow, cv2; print('✅ All ML libraries installed')" && \
    python3 -c "import numpy, torch, tensorflow, cv2; print('✅ python3 also works')"

# ========================================
# ÉTAPE 5 : Copier le code et build
# ========================================
COPY . .

# Build NestJS
RUN npm run build

# Créer les dossiers nécessaires
RUN mkdir -p temp_uploads cache_images logs

# ========================================
# ÉTAPE 6 : Configuration finale
# ========================================

# Copier et rendre exécutable le script de démarrage
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Exposer les ports
EXPOSE 3000 5001

# Variables d'environnement
ENV NODE_ENV=production \
    PORT=3000 \
    AI_SERVICE_URL=http://localhost:5001 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app:/app/AI-Models \
    PATH="/usr/bin:/usr/local/bin:$PATH"

# Point d'entrée
ENTRYPOINT ["./docker-entrypoint.sh"]