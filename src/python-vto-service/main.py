"""
Service FastAPI pour Virtual Try-On avec Cloudinary
Port: 5001
VERSION DÉMO : Sans rembg, utilise uniquement processedImageURL
"""

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
import numpy as np
import cv2
import mediapipe as mp
from PIL import Image
# from rembg import remove  # ✅ DÉSACTIVÉ pour démo
import os
import requests
from io import BytesIO
from typing import Dict, Optional, List
import logging
import hashlib
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
import time

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Labasni VTO Service", version="2.0-DEMO")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# CONFIGURATION CLOUDINARY
# ==========================================
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME", "dechk1ohr"),
    api_key=os.getenv("CLOUDINARY_API_KEY", "your_api_key"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET", "your_api_secret")
)

# ==========================================
# CONFIGURATION
# ==========================================
CACHE_FOLDER = "cache_images"
os.makedirs(CACHE_FOLDER, exist_ok=True)

SCALE_FACTOR = {
    "top": 1.7,
    "bottom": 1.5,
    "footwear": 1.1,
    "outerwear": 1.8,
    "accessory": 1.2
}

OFFSET_Y = {
    "top": -0.15,
    "bottom": -0.1,
    "footwear": -0.4,
    "outerwear": -0.2,
    "accessory": -0.3
}

DRAW_ORDER = ["footwear", "bottom", "top", "outerwear", "accessory"]

# ==========================================
# MEDIAPIPE
# ==========================================
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)
logger.info("✅ MediaPipe initialisé")

# ==========================================
# CACHE EN MÉMOIRE
# ==========================================
image_cache = {}
MAX_CACHE_SIZE = 100

def get_cache_key(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()

def get_cache_path(cache_key: str, processed: bool = False) -> str:
    suffix = "_processed.png" if processed else "_original.png"
    return os.path.join(CACHE_FOLDER, cache_key + suffix)

# ==========================================
# TÉLÉCHARGEMENT D'IMAGES (SANS REMBG)
# ==========================================
def download_image_from_url(url: str) -> Image.Image:
    """Télécharge une image depuis une URL avec optimisations Cloudinary"""
    try:
        # 🚀 Si c'est une URL Cloudinary, ajouter des transformations pour réduire la taille
        if 'cloudinary.com' in url and '/upload/' in url:
            # Vérifier si des transformations sont déjà présentes
            if 'f_auto' not in url:
                # Ajouter les transformations pour optimiser le téléchargement
                # Utiliser w_1200 pour le traitement (plus grand que l'affichage mobile)
                if '?' not in url:
                    url = f"{url}?f_auto,q_auto:good,w_1200"
                elif 'f_auto' not in url:
                    url = f"{url}&f_auto,q_auto:good,w_1200"
        
        response = requests.get(url, timeout=30)  # ✨ Augmenter timeout pour Render
        response.raise_for_status()
        return Image.open(BytesIO(response.content))
    except Exception as e:
        logger.error(f"Erreur téléchargement {url}: {e}")
        raise HTTPException(status_code=400, detail=f"Impossible de télécharger l'image: {str(e)}")

def load_and_process_cloth(url: str, force_reprocess: bool = False) -> np.ndarray:
    """
    ✅ VERSION DÉMO : Charge l'image SANS rembg
    L'image DOIT avoir un fond transparent (processedImageURL)
    """
    cache_key = get_cache_key(url)
    
    # 1. Cache mémoire
    if cache_key in image_cache and not force_reprocess:
        logger.debug(f"✓ Image {cache_key[:8]} depuis cache RAM")
        return image_cache[cache_key]
    
    # 2. Cache disque
    processed_path = get_cache_path(cache_key, processed=True)
    if os.path.exists(processed_path) and not force_reprocess:
        logger.debug(f"✓ Image {cache_key[:8]} depuis cache disque")
        img = Image.open(processed_path).convert("RGBA")
        arr = np.array(img)
        result = cv2.cvtColor(arr, cv2.COLOR_RGBA2BGRA)
        
        if len(image_cache) < MAX_CACHE_SIZE:
            image_cache[cache_key] = result
        
        return result
    
    # 3. Télécharger SANS traiter
    logger.info(f"⬇️  Téléchargement de {url[:50]}...")
    img = download_image_from_url(url)
    
    # ✅ IMPORTANT : Convertir en RGBA sans rembg
    # On suppose que l'image a DÉJÀ un fond transparent
    img_rgba = img.convert("RGBA")
    
    # Sauvegarder
    img_rgba.save(processed_path)
    logger.info(f"💾 Image sauvegardée: {processed_path}")
    
    # Convertir pour OpenCV
    arr = np.array(img_rgba)
    result = cv2.cvtColor(arr, cv2.COLOR_RGBA2BGRA)
    
    # Cache RAM
    if len(image_cache) < MAX_CACHE_SIZE:
        image_cache[cache_key] = result
    
    return result

def overlay_transparent(background, overlay, x, y, overlay_w, overlay_h):
    """Superpose une image PNG transparente"""
    if overlay is None:
        return background
    
    overlay_resized = cv2.resize(overlay, (overlay_w, overlay_h))
    h, w = background.shape[:2]

    if x >= w or y >= h or x + overlay_w <= 0 or y + overlay_h <= 0:
        return background

    x1, y1 = max(x, 0), max(y, 0)
    x2, y2 = min(x + overlay_w, w), min(y + overlay_h, h)
    ox1, oy1 = max(0, -x), max(0, -y)
    ox2, oy2 = min(overlay_w, w - x), min(overlay_h, h - y)

    overlay_crop = overlay_resized[oy1:oy2, ox1:ox2]
    background_crop = background[y1:y2, x1:x2]

    if overlay_crop.shape[0] != background_crop.shape[0] or \
       overlay_crop.shape[1] != background_crop.shape[1]:
        return background

    alpha = overlay_crop[:, :, 3:4] / 255.0
    alpha_inv = 1.0 - alpha

    for c in range(3):
        background_crop[:, :, c] = (
            alpha[:, :, 0] * overlay_crop[:, :, c] +
            alpha_inv[:, :, 0] * background_crop[:, :, c]
        )

    background[y1:y2, x1:x2] = background_crop
    return background

# ==========================================
# MODÈLES DE DONNÉES
# ==========================================
class ClothingItem(BaseModel):
    imageURL: str
    processedImageURL: Optional[str] = None
    category: str

class ProcessFrameRequest(BaseModel):
    frame: str
    clothes: List[ClothingItem]

class ProcessClothingRequest(BaseModel):
    imageURL: str
    category: str

class HealthResponse(BaseModel):
    status: str
    mediapipe: str
    cache_size: int
    cache_disk_files: int

# ==========================================
# ENDPOINTS
# ==========================================
@app.get("/health", response_model=HealthResponse)
def health_check():
    disk_files = len([f for f in os.listdir(CACHE_FOLDER) if f.endswith('.png')])
    return HealthResponse(
        status="ok",
        mediapipe="initialized",
        cache_size=len(image_cache),
        cache_disk_files=disk_files
    )

@app.post("/process-clothing")
async def process_clothing(body: ProcessClothingRequest):
    """
    ⚠️  VERSION DÉMO : rembg désactivé
    Retourne l'URL originale comme processedImageURL
    """
    try:
        logger.info(f"⚠️  DÉMO MODE : rembg désactivé")
        logger.info(f"📥 Requête pour {body.imageURL} ({body.category})")
        
        # Pour la démo, on retourne juste l'URL originale
        return {
            "success": True,
            "processedImageURL": body.imageURL,  # Même URL
            "originalURL": body.imageURL,
            "note": "rembg désactivé en mode démo"
        }
        
    except Exception as e:
        logger.error(f"❌ Erreur: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/process-frame")
def process_frame(body: ProcessFrameRequest):
    """
    Traite une frame vidéo et applique les vêtements virtuels
    ✅ VERSION AVEC LOGS DÉTAILLÉS
    """
    start_time = time.time()
    
    try:
        logger.info(f"📥 Requête reçue: {len(body.clothes)} vêtement(s)")
        for cloth in body.clothes:
            logger.info(f"  - {cloth.category}: {cloth.imageURL[:50]}...")
            if cloth.processedImageURL:
                logger.info(f"    Processed: {cloth.processedImageURL[:50]}...")
        
        # ✅ CHECKPOINT 1 : Décodage
        logger.info("⏱️  Décodage frame...")
        img_data = base64.b64decode(body.frame)
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            raise HTTPException(status_code=400, detail="Image invalide")
        
        logger.info(f"✅ Frame décodée: {frame.shape} ({time.time() - start_time:.2f}s)")

        # ✅ CHECKPOINT 2 : MediaPipe
        logger.info("⏱️  Détection pose MediaPipe...")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb)
        logger.info(f"✅ Pose traitée ({time.time() - start_time:.2f}s)")

        if not results.pose_landmarks:
            logger.warning("⚠️  Aucun corps détecté")
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            encoded = base64.b64encode(buffer).decode('utf-8')
            return {
                "success": True,
                "frame": encoded,
                "fps_hint": "no_body_detected"
            }

        lm = results.pose_landmarks.landmark
        h_frame, w_frame = frame.shape[:2]
        
        # ✅ CHECKPOINT 3 : Chargement vêtements
        logger.info(f"⏱️  Chargement de {len(body.clothes)} vêtement(s)...")
        wardrobe = {}
        
        for cloth in body.clothes:
            category_lower = cloth.category.lower()
            
            # ✅ IMPORTANT : Priorité à processedImageURL
            url_to_use = cloth.processedImageURL if cloth.processedImageURL else cloth.imageURL
            
            try:
                logger.info(f"  📦 Chargement {category_lower}: {url_to_use[:50]}...")
                cloth_img = load_and_process_cloth(url_to_use)
                wardrobe[category_lower] = cloth_img
                logger.info(f"  ✓ {category_lower} chargé")
            except Exception as e:
                logger.warning(f"  ✗ Impossible de charger {url_to_use}: {e}")
                continue
        
        logger.info(f"✅ {len(wardrobe)} vêtement(s) chargé(s) ({time.time() - start_time:.2f}s)")

        # ✅ CHECKPOINT 4 : Application
        logger.info("⏱️  Application des vêtements...")
        for category in DRAW_ORDER:
            if category not in wardrobe:
                continue
            
            cloth_img = wardrobe[category]
            
            if category == "top" or category == "outerwear":
                p1 = lm[mp_pose.PoseLandmark.LEFT_SHOULDER]
                p2 = lm[mp_pose.PoseLandmark.RIGHT_SHOULDER]
            elif category == "bottom":
                p1 = lm[mp_pose.PoseLandmark.LEFT_HIP]
                p2 = lm[mp_pose.PoseLandmark.RIGHT_HIP]
            elif category == "footwear":
                p1 = lm[mp_pose.PoseLandmark.LEFT_ANKLE]
                p2 = lm[mp_pose.PoseLandmark.RIGHT_ANKLE]
            elif category == "accessory":
                p1 = lm[mp_pose.PoseLandmark.NOSE]
                p2 = lm[mp_pose.PoseLandmark.NOSE]
            else:
                continue

            x1 = int(p1.x * w_frame)
            y1 = int(p1.y * h_frame)
            x2 = int(p2.x * w_frame)
            y2 = int(p2.y * h_frame)
            
            body_width = int(np.hypot(x1 - x2, y1 - y2))
            
            if body_width > 20:
                current_scale = SCALE_FACTOR.get(category, 1.5)
                cloth_w = int(body_width * current_scale)
                cloth_h = int(cloth_w * cloth_img.shape[0] / cloth_img.shape[1])
                
                center_x = (x1 + x2) // 2
                center_y = (y1 + y2) // 2
                
                pos_x = center_x - cloth_w // 2
                pos_y = center_y + int(cloth_h * OFFSET_Y.get(category, 0))
                
                frame = overlay_transparent(frame, cloth_img, pos_x, pos_y, cloth_w, cloth_h)
        
        logger.info(f"✅ Vêtements appliqués ({time.time() - start_time:.2f}s)")

        # Encodage
        logger.info("⏱️  Encodage résultat...")
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        encoded = base64.b64encode(buffer).decode('utf-8')
        
        total_time = time.time() - start_time
        logger.info(f"✅ SUCCÈS - Temps total: {total_time:.2f}s")
        
        return {
            "success": True,
            "frame": encoded,
            "fps_hint": "ok"
        }

    except Exception as e:
        logger.error(f"❌ Erreur traitement: {str(e)}")
        import traceback
        logger.error(f"Stack trace: {traceback.format_exc()}")
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/clear-cache")
def clear_cache():
    """Vide le cache"""
    global image_cache
    image_cache = {}
    
    import shutil
    if os.path.exists(CACHE_FOLDER):
        shutil.rmtree(CACHE_FOLDER)
        os.makedirs(CACHE_FOLDER)
    
    return {"status": "ok", "message": "Cache vidé"}

# ==========================================
# DÉMARRAGE
# ==========================================
if __name__ == "__main__":
    logger.info("🚀 Démarrage du service VTO v2.0-DEMO sur le port 5001...")
    logger.info("⚠️  Mode DÉMO : rembg désactivé, utilise processedImageURL uniquement")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5001,
        reload=False,
        log_level="info"
    )