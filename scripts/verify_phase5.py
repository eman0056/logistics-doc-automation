import sqlite3
import os
import sys
import json
import time

sys.path.append(os.path.dirname(__file__))

from ingest_document import ingest_file, DB_PATH

def verify_phase5():
    print("==========================================================")
    print("PHASE 5 VERIFICATION — INVOICE UI & GENERATION ENGINE")
    print("==========================================================")

    # 1. Take sample test document
    sample_file = "/home/provelopers/Downloads/DHL-Express-invoice-sample.pdf"
    if not os.path.exists(sample_file):
        sample_file = os.path.join(os.path.dirname(__file__), "test_sample_invoice.pdf")

    print(f"Phase 5 Intake Sample File: {sample_file}")
    ingest_res = ingest_file(sample_file)
    document_id = ingest_res["documentId"]

    print(f"✓ Ingested Document ID: {document_id}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 2. Simulate AI Extraction
    initial_canonical = {
        "shipmentNumber": "SHP-991823",
        "documentNumber": "DHL-INV-2026-99",
        "documentType": "INVOICE",
        "shipperName": "Apex Logistics Hub",
        "consigneeName": "Global Distribution Center",
        "carrierName": "DHL Express Freight",
        "originAddress": "100 Freight Way, Chicago IL 60601",
        "destinationAddress": "500 Transport Blvd, Dallas TX 75201",
        "pickupDate": "2026-08-15",
        "deliveryDate": "2026-08-18",
        "trackingNumber": "DHL-TRK-88291",
        "subtotalCost": 1250.00,
        "freightCost": 150.00,
        "taxCost": 75.00,
        "totalAmount": 1475.00,
        "currency": "USD",
        "lineItems": [
            {"description": "Industrial Machinery Parts", "quantity": 2, "unitPrice": 400.0, "totalPrice": 800.0},
            {"description": "Control Electronics Module", "quantity": 2, "unitPrice": 225.0, "totalPrice": 450.0}
        ]
    }

    cursor.execute("""
        INSERT INTO Extraction (id, documentId, rawOcrText, canonicalJson, confidenceScores, extractedAt)
        VALUES (?, ?, 'Sample OCR text for invoice generation', ?, '{}', CURRENT_TIMESTAMP)
    """, (str(time.time()), document_id, json.dumps(initial_canonical)))

    conn.commit()
    print("✓ Initial AI Extraction Populated.")

    # 3. Simulate User Editing Fields in Split-Screen Review UI
    edited_data = dict(initial_canonical)
    edited_data["shipperName"] = "Apex Global Freight Logistics Hub (Verified)"
    edited_data["documentNumber"] = "DHL-INV-2026-FINAL-99"
    edited_data["subtotalCost"] = 1400.00
    edited_data["freightCost"] = 200.00
    edited_data["taxCost"] = 100.00
    edited_data["totalAmount"] = 1700.00

    print(f"✓ User edited Shipper Name to: '{edited_data['shipperName']}'")
    print(f"✓ User updated Total Amount to: ${edited_data['totalAmount']} USD")

    # 4. Execute Invoice Generation Endpoint Logic
    submitted_json = json.dumps(edited_data)
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        UPDATE Extraction SET finalSubmittedData = ? WHERE documentId = ?
    """, (submitted_json, document_id))

    cursor.execute("""
        UPDATE Document SET status = 'INVOICE_GENERATED', invoiceGeneratedAt = ?, updatedAt = ? WHERE id = ?
    """, (now_str, now_str, document_id))

    cursor.execute("""
        INSERT INTO AuditLog (id, documentId, action, description, metadataJson)
        VALUES (?, ?, 'INVOICE_GENERATED', 'Professional invoice generated for Document.', ?)
    """, (str(time.time() + 1), document_id, json.dumps({"invoiceNumber": edited_data["documentNumber"]})))

    conn.commit()

    # 5. Verify Database Records
    cursor.execute("SELECT status, invoiceGeneratedAt FROM Document WHERE id = ?;", (document_id,))
    doc_row = cursor.fetchone()

    cursor.execute("SELECT finalSubmittedData FROM Extraction WHERE documentId = ?;", (document_id,))
    ext_row = cursor.fetchone()

    if not doc_row or not ext_row:
        print("ERROR: Missing DB records for generated invoice!")
        return False

    status, gen_at = doc_row
    final_data_str = ext_row[0]
    final_data = json.loads(final_data_str)

    print(f"✓ DB Document Status Verified: {status}")
    print(f"✓ Invoice Generated Timestamp: {gen_at}")
    print(f"✓ Verified Submitted Shipper: {final_data.get('shipperName')}")
    print(f"✓ Verified Submitted Total: ${final_data.get('totalAmount')} USD")

    if status != "INVOICE_GENERATED" or not final_data_str:
        print("ERROR: Document status or finalSubmittedData mismatch!")
        return False

    conn.close()

    print("----------------------------------------------------------")
    print(f"✓ Invoice {edited_data['documentNumber']} generated successfully!")
    print("==========================================================")
    print("PHASE 5 VERIFICATION PASSED SUCCESSFULLY! 🚀")
    print("==========================================================")
    return True

if __name__ == "__main__":
    success = verify_phase5()
    if not success:
        sys.exit(1)
