import cv2
import os

def get_image_blur_quality(image_path: str) -> float:
    """Return a 0‑1 quality score based on Laplacian variance.
    Returns 0.5 on error or missing file.
    """
    if not os.path.exists(image_path):
        print(f"[ImageQuality] Missing file: {image_path}")
        return 0.5
    img = cv2.imread(image_path)
    if img is None:
        print(f"[ImageQuality] Cannot read image: {image_path}")
        return 0.5
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if var < 50:
        quality = 0.2
    elif var < 100:
        quality = 0.4
    elif var < 200:
        quality = 0.6
    elif var < 500:
        quality = 0.8
    else:
        quality = 0.95
    print(f"[ImageQuality] {os.path.basename(image_path)} variance={var:.2f} quality={quality}")
    return quality
