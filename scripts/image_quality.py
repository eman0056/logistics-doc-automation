import os
import io

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import numpy as np
except ImportError:
    np = None

try:
    from PIL import Image
except ImportError:
    Image = None

def _calculate_variance_from_pil(pil_img):
    if cv2 is not None and np is not None:
        try:
            cv_img = cv2.cvtColor(np.array(pil_img.convert('RGB')), cv2.COLOR_RGB2BGR)
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
            return float(cv2.Laplacian(gray, cv2.CV_64F).var())
        except Exception:
            pass
    if np is not None:
        try:
            gray = pil_img.convert('L')
            arr = np.array(gray, dtype=np.float64)
            if arr.shape[0] > 2 and arr.shape[1] > 2:
                lap_np = arr[:-2, 1:-1] + arr[2:, 1:-1] + arr[1:-1, :-2] + arr[1:-1, 2:] - 4 * arr[1:-1, 1:-1]
                return float(lap_np.var())
        except Exception:
            pass
    return None

def get_image_blur_quality(image_path_or_bytes) -> float:
    """Return a 0-1 quality score based on Laplacian variance.
    Analyzes the invoice image FIRST using Laplacian variance before sending to N8N webhook.
    Returns 0.5 on error or missing file.
    """
    try:
        var = None
        filename = "input"

        # If base64 string passed
        if isinstance(image_path_or_bytes, str) and not os.path.exists(image_path_or_bytes):
            if len(image_path_or_bytes) > 100:
                try:
                    import base64
                    image_path_or_bytes = base64.b64decode(image_path_or_bytes)
                except Exception:
                    pass

        if isinstance(image_path_or_bytes, (str, os.PathLike)):
            filename = os.path.basename(str(image_path_or_bytes))
            if not os.path.exists(image_path_or_bytes):
                print(f"[ImageQuality] Missing file: {image_path_or_bytes}")
                return 0.5
            ext = os.path.splitext(image_path_or_bytes)[1].lower()
            if ext == '.pdf':
                try:
                    import pypdf
                    reader = pypdf.PdfReader(str(image_path_or_bytes))
                    variances = []
                    for page in reader.pages:
                        for img_obj in page.images:
                            if Image:
                                pil_img = Image.open(io.BytesIO(img_obj.data))
                                v = _calculate_variance_from_pil(pil_img)
                                if v is not None:
                                    variances.append(v)
                    if variances:
                        var = min(variances)
                    else:
                        var = 1000.0  # Crisp digital vector PDF
                except Exception as e:
                    print(f"[ImageQuality] PDF image extraction note: {e}")
                    var = 1000.0
            else:
                if cv2 is not None:
                    img = cv2.imread(str(image_path_or_bytes))
                    if img is not None:
                        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                        var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
                if var is None and Image is not None:
                    try:
                        pil_img = Image.open(str(image_path_or_bytes))
                        var = _calculate_variance_from_pil(pil_img)
                    except Exception as e:
                        print(f"[ImageQuality] PIL read error: {e}")

        elif isinstance(image_path_or_bytes, (bytes, bytearray)):
            if image_path_or_bytes.startswith(b'%PDF'):
                try:
                    import pypdf
                    reader = pypdf.PdfReader(io.BytesIO(image_path_or_bytes))
                    variances = []
                    for page in reader.pages:
                        for img_obj in page.images:
                            if Image:
                                pil_img = Image.open(io.BytesIO(img_obj.data))
                                v = _calculate_variance_from_pil(pil_img)
                                if v is not None:
                                    variances.append(v)
                    var = min(variances) if variances else 1000.0
                except Exception:
                    var = 1000.0
            else:
                if cv2 is not None and np is not None:
                    try:
                        arr = np.frombuffer(image_path_or_bytes, np.uint8)
                        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                        if img is not None:
                            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                            var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
                    except Exception:
                        pass
                if var is None and Image is not None:
                    try:
                        pil_img = Image.open(io.BytesIO(image_path_or_bytes))
                        var = _calculate_variance_from_pil(pil_img)
                    except Exception as e:
                        print(f"[ImageQuality] PIL read bytes error: {e}")

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


