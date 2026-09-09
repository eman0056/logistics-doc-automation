import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

INVOICE_BOUNDARY = re.compile(
    r"(?:^|\n)\s*(?:TAX\s+INVOICE|FREIGHT\s+INVOICE|COMMERCIAL\s+INVOICE|INVOICE)\b"
    r"[\s\S]{0,500}?(?:invoice\s*(?:number|no\.?|#)|inv\s*#|bill\s*to|shipment\s*(?:number|no\.?|#)|tracking\s*(?:number|no\.?|#))",
    re.IGNORECASE,
)


def _docx_pages(file_bytes):
    try:
        with zipfile.ZipFile(__import__("io").BytesIO(file_bytes)) as archive:
            xml = ET.fromstring(archive.read("word/document.xml"))
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        paragraphs = []
        for paragraph in xml.findall(".//w:p", ns):
            text = "".join(node.text or "" for node in paragraph.findall(".//w:t", ns)).strip()
            if text:
                paragraphs.append(text)
        return ["\n".join(paragraphs)] if paragraphs else []
    except Exception:
        return []


def _pdf_pages(file_bytes):
    try:
        from pypdf import PdfReader
        reader = PdfReader(__import__("io").BytesIO(file_bytes))
        return [(page.extract_text() or "").strip() for page in reader.pages]
    except Exception:
        return []


def _plain_pages(file_bytes):
    text = file_bytes.decode("utf-8", errors="ignore").strip()
    return [part.strip() for part in re.split(r"\f|(?:^|\n)\s*---\s*PAGE\s+\d+\s*---\s*(?:\n|$)", text, flags=re.IGNORECASE) if part.strip()]


def extract_invoice_pages(file_bytes, file_name=""):
    extension = Path(file_name or "").suffix.lower()
    if extension == ".pdf" or file_bytes.startswith(b"%PDF"):
        pages = _pdf_pages(file_bytes)
    elif extension == ".docx" or file_bytes.startswith(b"PK"):
        pages = _docx_pages(file_bytes)
    else:
        pages = []
    return pages or _plain_pages(file_bytes)


def detect_invoice_groups(file_bytes, file_name=""):
    pages = extract_invoice_pages(file_bytes, file_name)
    if not pages:
        return [{"invoiceIndex": 0, "invoiceCount": 1, "pageStart": 1, "pageEnd": 1, "rawOcrText": ""}]

    groups = []
    for page_index, page_text in enumerate(pages):
        boundaries = list(INVOICE_BOUNDARY.finditer(page_text))
        if page_index > 0 and boundaries:
            groups.append({"pageStart": page_index + 1, "pageEnd": page_index + 1, "pages": [page_text]})
        elif not groups:
            groups.append({"pageStart": page_index + 1, "pageEnd": page_index + 1, "pages": [page_text]})
        else:
            groups[-1]["pageEnd"] = page_index + 1
            groups[-1]["pages"].append(page_text)

        if page_index == 0 and len(boundaries) > 1:
            groups.pop()
            for boundary_index, boundary in enumerate(boundaries):
                start = boundary.start()
                end = boundaries[boundary_index + 1].start() if boundary_index + 1 < len(boundaries) else len(page_text)
                groups.append({"pageStart": 1, "pageEnd": 1, "pages": [page_text[start:end].strip()]})

    invoice_count = len(groups)
    return [
        {
            "invoiceIndex": index,
            "invoiceCount": invoice_count,
            "pageStart": group["pageStart"],
            "pageEnd": group["pageEnd"],
            "rawOcrText": "\n\f\n".join(group["pages"]),
        }
        for index, group in enumerate(groups)
    ]
