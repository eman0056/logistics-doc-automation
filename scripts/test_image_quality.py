import unittest
from io import BytesIO

import pymupdf
from PIL import Image, ImageDraw, ImageFilter

from image_quality import get_pdf_page_range_quality


class PdfPageRangeQualityTests(unittest.TestCase):
    def make_two_page_pdf(self):
        sharp = Image.new("RGB", (900, 1200), "white")
        draw = ImageDraw.Draw(sharp)
        for y in range(60, 1140, 35):
            draw.line((50, y, 850, y), fill="black", width=2)
        for y in range(75, 1140, 70):
            draw.text((70, y), "INVOICE 12345  TOTAL 987.65", fill="black")
        blurred = sharp.filter(ImageFilter.GaussianBlur(radius=8))

        pdf = pymupdf.open()
        for image in (sharp, blurred):
            image_bytes = BytesIO()
            image.save(image_bytes, format="PNG")
            page = pdf.new_page(width=612, height=792)
            page.insert_image(page.rect, stream=image_bytes.getvalue())
        pdf_bytes = pdf.tobytes()
        pdf.close()
        sharp.close()
        blurred.close()
        return pdf_bytes

    def test_page_range_scores_sharp_and_blurred_pages_individually(self):
        pdf_bytes = self.make_two_page_pdf()

        sharp_score = get_pdf_page_range_quality(pdf_bytes, 1, 1)
        blurred_score = get_pdf_page_range_quality(pdf_bytes, 2, 2)
        combined_score = get_pdf_page_range_quality(pdf_bytes, 1, 2)

        self.assertIsNotNone(sharp_score)
        self.assertIsNotNone(blurred_score)
        self.assertGreater(sharp_score, blurred_score)
        self.assertEqual(combined_score, min(sharp_score, blurred_score))

    def test_invalid_pdf_returns_none(self):
        self.assertIsNone(get_pdf_page_range_quality(b"not a PDF", 1, 1))


if __name__ == "__main__":
    unittest.main()
