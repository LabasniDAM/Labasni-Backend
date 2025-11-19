# detect.py  ← COPIE-COLLE ÇA (remplace tout l’ancien)
import argparse
import json
import sys
import warnings
warnings.filterwarnings("ignore")
import tensorflow as tf
tf.get_logger().setLevel('ERROR')  # Cache les warnings TensorFlow

from ultralytics import YOLO
from PIL import Image
import numpy as np
from sklearn.cluster import KMeans

# Chargement des modèles
yolo_model = YOLO("best.pt")
style_model = tf.keras.models.load_model("style_season_model.h5", compile=False)

def get_dominant_color(crop):
    pixels = np.array(crop).reshape(-1, 3)
    pixels = pixels[np.any(pixels != [0, 0, 0], axis=1)]
    if len(pixels) == 0:
        return "#808080"
    kmeans = KMeans(n_clusters=3, random_state=0, n_init=10)
    kmeans.fit(pixels)
    color = tuple(map(int, kmeans.cluster_centers_[0]))
    return '#%02X%02X%02X' % color

parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
args = parser.parse_args()
image_path = args.image

try:
    img = Image.open(image_path).convert('RGB')
    w, h = img.size
    results = yolo_model(image_path, verbose=False)[0]
    boxes = results.boxes

    if len(boxes) == 0:
        print("Aucun vêtement détecté.")
        sys.stdout.flush()
        sys.exit(0)

    best = boxes.conf.argmax()
    x1, y1, x2, y2 = map(int, boxes.xyxy[best])
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    if x2 <= x1 or y2 <= y1:
        print("Boîte invalide.")
        sys.stdout.flush()
        sys.exit(0)

    cropped = img.crop((x1, y1, x2, y2))
    cropped.save("debug_cropped.jpg")
    img.save("debug_full.jpg")

    hex_color = get_dominant_color(cropped)

    resized = cropped.resize((224, 224))
    arr = np.array(resized) / 255.0
    arr = arr.reshape(1, 224, 224, 3)
    style_pred, season_pred = style_model.predict(arr, verbose=0)

    styles = ["casual", "formal", "sport", "chic"]
    seasons = ["summer", "winter", "fall", "spring"]

    style = styles[style_pred.argmax()]
    season = seasons[season_pred.argmax()]
    type_vetement = results.names[int(boxes.cls[best])]

    # CE QUE TU VOIS DANS POSTMAN (exactement comme dans Colab)
    print("Résultat final")
    print("---------------------------")
    print("Type du vêtement :", type_vetement)
    print("Couleur dominante :", hex_color)
    print("Style :", style)
    print("Saison :", season)
    print("---------------------------")

    sys.stdout.flush()

except Exception as e:
    print("Erreur :", str(e))
    sys.stdout.flush()