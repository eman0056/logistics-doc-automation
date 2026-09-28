import sys
import os
import json
import uuid

# Add parent directory to path to import api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from api.index import app, get_db

client = TestClient(app)

def test_callback():
    print("Running end-to-end extraction callback test...")
    
    # 1. Setup a test document in the DB
    doc_id = f"test-doc-{uuid.uuid4().hex[:8]}"
    invoice_id = f"{doc_id}-invoice-1"
    
    conn = get_db()
    cursor = conn.cursor()
    # Insert test doc
    cursor.execute("""
        INSERT INTO Document (id, fileName, fileSize, mimeType, storagePath, status, pageCount, processedPages, fileData, imageQuality) 
        VALUES (?, 'test.pdf', 1000, 'application/pdf', 'test/test.pdf', 'PREPROCESSED', 1, 0, 'dummy', 0.9)
    """, (doc_id,))
    
    # Insert pre-seeded invoice
    cursor.execute("""
        INSERT INTO DocumentInvoice (id, documentId, invoiceIndex, pageStart, pageEnd, imageQuality, status) 
        VALUES (?, ?, 0, 1, 1, 0.9, 'PREPROCESSED')
    """, (invoice_id, doc_id))
    
    conn.commit()
    print(f"Created test Document ({doc_id}) and DocumentInvoice ({invoice_id})")
    
    # 2. Trigger the callback
    payload = {
        "invoiceCount": 1,
        "invoices": [
            {
                "invoiceId": invoice_id,
                "invoiceIndex": 0,
                "pageStart": 1,
                "pageEnd": 1,
                "rawOcrText": "Test OCR Text",
                "extractedData": {
                    "shipmentNumber": "12345",
                    "totalAmount": 100.00
                },
                "confidenceScores": {
                    "totalAmount": 0.99
                },
                "overallConfidence": 0.95
            }
        ]
    }
    
    print(f"Sending POST to /api/documents/{doc_id}/extraction/callback")
    response = client.post(
        f"/api/documents/{doc_id}/extraction/callback",
        json=payload
    )
    
    # 3. Verify response
    print(f"Response status: {response.status_code}")
    print(f"Response body: {response.json()}")
    
    if response.status_code != 200:
        print("ERROR: Expected HTTP 200")
        sys.exit(1)
        
    res_data = response.json()
    if not res_data.get("success"):
        print("ERROR: Expected success=True in response")
        sys.exit(1)
        
    print("Backend returned HTTP 200 and success=True")
    
    # 4. Verify DB updates
    cursor.execute("SELECT status, rawOcrText, canonicalJson FROM DocumentInvoice WHERE id = ?", (invoice_id,))
    inv_row = cursor.fetchone()
    if not inv_row:
        print("ERROR: Invoice record not found")
        sys.exit(1)
        
    status, ocr, json_str = inv_row
    print(f"Updated Invoice Status: {status}")
    
    if status != 'EXTRACTED' and status != 'POOR_IMAGE_QUALITY':
        print(f"ERROR: Expected status EXTRACTED, got {status}")
        sys.exit(1)
        
    # Check Document status
    cursor.execute("SELECT status FROM Document WHERE id = ?", (doc_id,))
    doc_row = cursor.fetchone()
    print(f"Updated Document Status: {doc_row[0]}")
    
    print("SUCCESS: Extraction callback flow completed successfully without transaction errors.")
    
if __name__ == "__main__":
    test_callback()
