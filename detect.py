# detect.py — VERSION FINALE OFFICIELLE 2025 (Mac M2 / TensorFlow 2.12.0)
import argparse
import sys
import warnings
warnings.filterwarnings("ignore")

# Suppression des warnings TensorFlow (méthode officielle pour TF 2.12)
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import tensorflow as tf
from tensorflow.keras.models import load_model

from ultralytics import YOLO
from PIL import Image
import numpy as np
from sklearn.cluster import KMeans

# === CHARGEMENT DES MODÈLES ===
print("Chargement du modèle YOLO...", file=sys.stderr)
yolo_model = YOLO("best.pt")

print("Chargement du modèle style/saison...", file=sys.stderr)
style_model = load_model("style_season_model.h5", compile=False)

# === FONCTION COULEUR DOMINANTE ===
def get_dominant_color(crop):
    img_array = np.array(crop).reshape(-1, 3)
    # Supprime le noir pur (fond souvent présent)
    img_array = img_array[np.any(img_array != [0, 0, 0], axis=1)]
    if len(img_array) == 0:
        return "#808080"  # Gris par défaut
    kmeans = KMeans(n_clusters=3, random_state=0, n_init=10)
    kmeans.fit(img_array)
    dominant = kmeans.cluster_centers_[0]
    return '#{:02x}{:02x}{:02x}'.format(int(dominant[0]), int(dominant[1]), int(dominant[2]))

# === ARGUMENTS ===
parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True, help='Chemin vers l\'image')
args = parser.parse_args()
image_path = args.image

try:
    # Ouverture et vérification
    img = Image.open(image_path).convert('RGB')
    w, h = img.size

    # Détection YOLO
    results = yolo_model(image_path, verbose=False)[0]
    boxes = results.boxes

    if not boxes or len(boxes) == 0:
        print("Aucun vêtement détecté.")
        sys.stdout.flush()
        sys.exit(0)

    # Meilleure détection (confiance max)
    best_idx = boxes.conf.argmax()
    x1, y1, x2, y2 = map(int, boxes.xyxy[best_idx])
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    if x2 <= x1 or y2 <= y1:
        print("Boîte invalide.")
        sys.stdout.flush()
        sys.exit(0)

    # Crop + debug (optionnel)
    cropped = img.crop((x1, y1, x2, y2))
    cropped.save("debug_cropped.jpg", quality=95)
    img.save("debug_full.jpg", quality=95)

    # Couleur dominante
    hex_color = get_dominant_color(cropped)

    # Prédiction style + saison
    resized = cropped.resize((224, 224))
    arr = np.array(resized) / 255.0
    arr = np.expand_dims(arr, axis=0)  # Shape (1, 224, 224, 3)

    style_pred, season_pred = style_model.predict(arr, verbose=0)
    
    styles = ["casual", "formal", "sport", "chic"]
    seasons = ["summer", "winter", "fall", "spring"]

    style = styles[np.argmax(style_pred)]
    season = seasons[np.argmax(season_pred)]
    type_vetement = results.names[int(boxes.cls[best_idx])]

    # === RÉSULTAT FINAL (exactement ce que ton backend renvoie à l'app) ===
    print("Résultat final")
    print("---------------------------")
    print(f"Type du vêtement : {type_vetement}")
    print(f"Couleur dominante : {hex_color.upper()}")
    print(f"Style : {style}")
    print(f"Saison : {season}")
    print("---------------------------")

    sys.stdout.flush()

except Exception as e:
    print(f"Erreur critique : {str(e)}")
    sys.stdout.flush()
    sys.exit(1)