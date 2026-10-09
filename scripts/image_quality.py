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
    from PIL import Image, ImageFilter, ImageStat
except ImportError:
    Image = None, None, None
def analyze_pil_image_quality(pil_img):
    """Analyze a PIL Image across Resolution, Blur (Laplacian Variance), and Contrast.
    Returns (quality_score: float, details: dict).
    """
    try:
        w, h = pil_img.size
        total_pixels = w * h
        gray = pil_img.convert('L')

        # 1. Resolution score (standard readable invoices are >= 600x800 / 480k px)
        if total_pixels < 250000 or w < 500 or h < 600:
            res_score = min(0.45, max(0.1, total_pixels / 500000.0))
        elif total_pixels < 450000:
            res_score = 0.55
        else:
            res_score = 0.95

        # 2. Blur / Sharpness calculation (Laplacian variance)
        lap_var = None
        if cv2 is not None and np is not None:
            try:
                cv_img = cv2.cvtColor(np.array(pil_img.convert('RGB')), cv2.COLOR_RGB2BGR)
                gray_cv = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
                lap_var = float(cv2.Laplacian(gray_cv, cv2.CV_64F).var())
            except Exception:
                pass
        if lap_var is None and Image is not None and ImageStat is not None:
            try:
                lap_filter = ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128)
                lap_img = gray.filter(lap_filter)
                lap_var = float(ImageStat.Stat(lap_img).var[0])
            except Exception:
                pass

        if lap_var is None:
            blur_score = 0.5
        elif lap_var < 80:
            blur_score = 0.2
        elif lap_var < 180:
            blur_score = 0.4
        elif lap_var < 350:
            blur_score = 0.55
        else:
            blur_score = 0.95

        # 3. Contrast calculation (Grayscale stddev)
        contrast_score = 0.95
        std_dev = 30.0
        if ImageStat is not None:
            try:
                std_dev = float(ImageStat.Stat(gray).stddev[0])
                if std_dev < 15:
                    contrast_score = 0.2
                elif std_dev < 25:
                    contrast_score = 0.5
                else:
                    contrast_score = 0.95
            except Exception:
                pass

        final_quality = round(min(res_score, blur_score, contrast_score), 2)
        details = {
            'dimensions': f'{w}x{h}',
            'total_pixels': total_pixels,
            'res_score': res_score,
            'lap_var': lap_var,
            'blur_score': blur_score,
            'contrast_stddev': std_dev,
            'contrast_score': contrast_score,
            'final_quality': final_quality
        }
        return final_quality, details
    except Exception as e:
        print(f"[ImageQuality] Error analyzing PIL image: {e}")
        return 0.3, {'error': str(e)}


def get_image_blur_quality(image_path_or_bytes) -> float:
    """Return a 0-1 quality score based on Laplacian variance, resolution, and contrast.
    Analyzes the invoice image FIRST before sending to N8N webhook.
    Returns < 0.6 score for low-resolution, blurry, low-contrast, or unreadable files.
    """
    try:
        filename = "input"

        # Handle base64 string
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
                return 0.0

            ext = os.path.splitext(image_path_or_bytes)[1].lower()
            if ext == '.pdf':
                try:
                    import pypdf
                    reader = pypdf.PdfReader(str(image_path_or_bytes))
                    scores = []
                    for page in reader.pages:
                        for img_obj in page.images:
                            if Image:
                                pil_img = Image.open(io.BytesIO(img_obj.data))
                                q, details = analyze_pil_image_quality(pil_img)
                                scores.append(q)
                    if scores:
                        final_q = min(scores)
                    else:
                        final_q = 0.95  # Digital/vector PDF
                    print(f"[ImageQuality] Analyzed PDF '{filename}': final_q={final_q}")
                    return final_q
                except Exception as e:
                    print(f"[ImageQuality] PDF analysis note: {e}")
                    return 0.95
            else:
                if Image:
                    try:
                        pil_img = Image.open(str(image_path_or_bytes))
                        final_q, details = analyze_pil_image_quality(pil_img)
                        print(f"[ImageQuality] Analyzed '{filename}': quality={final_q}, details={details}")
                        return final_q
                    except Exception as e:
                        print(f"[ImageQuality] PIL open error: {e}")
                        return 0.0
                return 0.3

        elif isinstance(image_path_or_bytes, (bytes, bytearray)):
            if image_path_or_bytes.startswith(b'%PDF'):
                try:
                    import pypdf
                    reader = pypdf.PdfReader(io.BytesIO(image_path_or_bytes))
                    scores = []
                    for page in reader.pages:
                        for img_obj in page.images:
                            if Image:
                                pil_img = Image.open(io.BytesIO(img_obj.data))
                                q, details = analyze_pil_image_quality(pil_img)
                                scores.append(q)
                    final_q = min(scores) if scores else 0.95
                    return final_q
                except Exception:
                    return 0.95
            else:
                if Image:
                    try:
                        pil_img = Image.open(io.BytesIO(image_path_or_bytes))
                        final_q, details = analyze_pil_image_quality(pil_img)
                        print(f"[ImageQuality] Analyzed bytes '{filename}': quality={final_q}, details={details}")
                        return final_q
                    except Exception as e:
                        print(f"[ImageQuality] PIL bytes error: {e}")
                        return 0.0
                return 0.3

        return 0.3
    except Exception as e:
        print(f"[ImageQuality] Error calculating quality: {e}")
        return 0.3


def get_pdf_page_range_quality(pdf_path_or_bytes, page_start, page_end):
    """Return the lowest image-quality score for an inclusive 1-based PDF range."""
    document = None
    try:
        import pymupdf

        if Image is None:
            raise RuntimeError("Pillow is unavailable")
        if not isinstance(page_start, int) or not isinstance(page_end, int):
            raise ValueError("PDF page range must contain integer page numbers")
        if page_start < 1 or page_end < page_start:
            raise ValueError("PDF page range must be a valid inclusive 1-based range")

        if isinstance(pdf_path_or_bytes, (bytes, bytearray)):
            document = pymupdf.open(stream=bytes(pdf_path_or_bytes), filetype="pdf")
        else:
            document = pymupdf.open(os.fspath(pdf_path_or_bytes))

        if page_end > document.page_count:
            raise ValueError(
                f"PDF page range ends at {page_end}, but document has {document.page_count} pages"
            )

        scores = []
        render_scale = 150 / 72
        for page_index in range(page_start - 1, page_end):
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(render_scale, render_scale),
                colorspace=pymupdf.csRGB,
                alpha=False,
            )
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            try:
                score, details = analyze_pil_image_quality(image)
                if "error" in details:
                    raise RuntimeError(details["error"])
                scores.append(score)
            finally:
                image.close()

        return min(scores) if scores else None
    except Exception as e:
        print(f"[ImageQuality] Failed to analyze PDF pages {page_start}-{page_end}: {e}")
        return None
    finally:
        if document is not None:
            document.close()
