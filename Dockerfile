# Dockerfile optimisé pour Labasni Backend (Node.js + Python)
FROM node:20-slim

# Installer Python 3 et dépendances système (optimisé)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgthread-2.0-0 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Lien symbolique python3 -> python
RUN ln -s /usr/bin/python3 /usr/bin/python && \
    ln -s /usr/bin/pip3 /usr/bin/pip

# Upgrade pip pour éviter les erreurs de build
RUN pip install --upgrade pip setuptools wheel

# Définir le répertoire de travail
WORKDIR /app

# ÉTAPE 1 : Copier et installer dépendances Node.js SEULEMENT
COPY package*.json ./
RUN npm ci --only=production

# ÉTAPE 2 : Copier requirements.txt et installer Python dependencies
# (séparé pour utiliser le cache Docker)
COPY AI-Models/requirements.txt ./AI-Models/requirements.txt
COPY src/python-vto-service/requirements.txt ./src/python-vto-service/requirements.txt

# Installer dépendances Python avec versions CPU (plus léger)
RUN pip install --no-cache-dir \
    numpy==1.24.3 \
    scikit-learn==1.3.0 \
    Pillow==10.0.0 \
    colormath==3.0.0 \
    requests==2.31.0 \
    python-dotenv==1.0.0 \
    cloudinary==1.36.0 \
    fastapi==0.103.1 \
    uvicorn[standard]==0.23.2 \
    python-multipart==0.0.6 \
    pydantic==2.3.0 \
    opencv-python-headless==4.8.0.76 \
    mediapipe==0.10.3 \
    rembg==2.0.50

# Installer torch CPU (beaucoup plus léger que CUDA)
RUN pip install --no-cache-dir \
    torch==2.1.0 --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir torchvision==0.16.0 --index-url https://download.pytorch.org/whl/cpu

# Installer TensorFlow CPU
RUN pip install --no-cache-dir tensorflow-cpu==2.15.0

# Installer ultralytics (YOLO)
RUN pip install --no-cache-dir ultralytics==8.0.196

# ÉTAPE 3 : Copier le code source
COPY . .

# ÉTAPE 4 : Build NestJS
RUN npm run build

# Créer dossiers nécessaires
RUN mkdir -p temp_uploads cache_images logs

# Exposer les ports
EXPOSE 3000 5001

# Copier et rendre exécutable le script de démarrage
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Variables d'environnement par défaut
ENV NODE_ENV=production \
    PORT=3000 \
    AI_SERVICE_URL=http://localhost:5001 \
    PYTHONUNBUFFERED=1

ENTRYPOINT ["./docker-entrypoint.sh"]