import cv2
import os
import io
import numpy as np

def get_image_blur_quality(image_path_or_bytes) -> float:
    """Return a 0-1 quality score based on Laplacian variance.
    Analyzes the invoice image FIRST using Laplacian variance before sending to N8N webhook.
    Returns 0.5 on error or missing file.
    """
    try:
        var = None
        filename = "input"

        if isinstance(image_path_or_bytes, (str, os.PathLike)):
            filename = os.path.basename(str(image_path_or_bytes))
            if not os.path.exists(image_path_or_bytes):
                print(f"[ImageQuality] Missing file: {image_path_or_bytes}")
                return 0.5
            ext = os.path.splitext(image_path_or_bytes)[1].lower()
            if ext == '.pdf':
                try:
                    import pypdf
                    from PIL import Image
                    reader = pypdf.PdfReader(str(image_path_or_bytes))
                    variances = []
                    for page in reader.pages:
                        for img_obj in page.images:
                            pil_img = Image.open(io.BytesIO(img_obj.data))
                            cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
                            variances.append(cv2.Laplacian(gray, cv2.CV_64F).var())
                    if variances:
                        var = min(variances)
                    else:
                        var = 1000.0  # Crisp digital vector PDF
                except Exception as e:
                    print(f"[ImageQuality] PDF image extraction note: {e}")
                    var = 1000.0
            else:
                img = cv2.imread(str(image_path_or_bytes))
                if img is None:
                    print(f"[ImageQuality] Cannot read image: {image_path_or_bytes}")
                    return 0.5
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                var = cv2.Laplacian(gray, cv2.CV_64F).var()
        elif isinstance(image_path_or_bytes, (bytes, bytearray)):
            if image_path_or_bytes.startswith(b'%PDF'):
                try:
                    import pypdf
                    from PIL import Image
                    reader = pypdf.PdfReader(io.BytesIO(image_path_or_bytes))
                    variances = []
                    for page in reader.pages:
                        for img_obj in page.images:
                            pil_img = Image.open(io.BytesIO(img_obj.data))
                            cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
                            variances.append(cv2.Laplacian(gray, cv2.CV_64F).var())
                    var = min(variances) if variances else 1000.0
                except Exception:
                    var = 1000.0
            else:
                arr = np.frombuffer(image_path_or_bytes, np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is None:
                    return 0.5
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                var = cv2.Laplacian(gray, cv2.CV_64F).var()

        if var is None:
            return 0.5

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

        print(f"[ImageQuality] Analyzed FIRST for '{filename}': Laplacian variance={var:.2f} -> imageQuality={quality}")
        return quality
    except Exception as e:
        print(f"[ImageQuality] Error calculating quality: {e}")
        return 0.5

