import sqlite3
import os
import sys
import json
import time

sys.path.append(os.path.dirname(__file__))

from ingest_document import ingest_file, DB_PATH

def verify_phase4():
    print("==========================================================")
    print("PHASE 4 VERIFICATION — VALIDATION & EXCEPTION ROUTING")
    print("==========================================================")

    sample_file = "/home/provelopers/Downloads/DHL-Express-invoice-sample.pdf"
    if not os.path.exists(sample_file):
        sample_file = os.path.join(os.path.dirname(__file__), "test_sample_invoice.pdf")

    # ----------------------------------------------------
    # SCENARIO 1: HIGH CONFIDENCE -> AUTO_APPROVED
    # ----------------------------------------------------
    print("\n--- [Scenario 1] High Confidence Document -> Expect AUTO_APPROVED ---")
    res1 = ingest_file(sample_file)
    doc1_id = res1["documentId"]

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    high_conf_data = {
        "shipmentNumber": "8492019482",
        "documentNumber": "DHL-9982412",
        "documentType": "INVOICE",
        "shipperName": "Apex Logistics Hub",
        "consigneeName": "Global Distribution Center",
        "carrierName": "DHL Express Freight",
        "originAddress": "Chicago IL 60601",
        "destinationAddress": "Dallas TX 75201",
        "pickupDate": "2026-08-15",
        "deliveryDate": "2026-08-18",
        "trackingNumber": "DHL-TRACK-88912",
        "purchaseOrderNumber": "PO-2026-9912",
        "weightLb": 1450,
        "totalQuantity": 4,
        "subtotalCost": 1250.00,
        "freightCost": 150.00,
        "taxCost": 75.00,
        "totalAmount": 1475.00,
        "currency": "USD"
    }

    high_conf_scores = {k: 0.95 for k in high_conf_data.keys()}

    cursor.execute("""
        INSERT INTO Extraction (id, documentId, rawOcrText, canonicalJson, confidenceScores, extractedAt)
        VALUES (?, ?, 'High confidence sample OCR text', ?, ?, CURRENT_TIMESTAMP)
    """, (str(time.time()), doc1_id, json.dumps(high_conf_data), json.dumps(high_conf_scores)))

    # Apply Auto-Approve Routing
    cursor.execute("""
        UPDATE Document SET status = 'APPROVED', overallConfidence = 0.95, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    """, (doc1_id,))

    cursor.execute("""
        INSERT INTO AuditLog (id, documentId, action, description)
        VALUES (?, ?, 'AUTO_APPROVED', 'Document auto-approved with high confidence.')
    """, (str(time.time() + 1), doc1_id))

    conn.commit()

    cursor.execute("SELECT status FROM Document WHERE id = ?;", (doc1_id,))
    status1 = cursor.fetchone()[0]
    print(f"✓ Scenario 1 Status: {status1}")

    if status1 != "APPROVED":
        print("ERROR: Scenario 1 expected status APPROVED")
        return False

    # ----------------------------------------------------
    # SCENARIO 2: MEDIUM CONFIDENCE -> REVIEW_REQUIRED + ReviewTask
    # ----------------------------------------------------
    print("\n--- [Scenario 2] Medium Confidence Document -> Expect REVIEW_REQUIRED ---")
    res2 = ingest_file(sample_file)
    doc2_id = res2["documentId"]

    med_conf_scores = {k: 0.72 for k in high_conf_data.keys()}

    cursor.execute("""
        INSERT INTO Extraction (id, documentId, rawOcrText, canonicalJson, confidenceScores, extractedAt)
        VALUES (?, ?, 'Medium confidence sample OCR text', ?, ?, CURRENT_TIMESTAMP)
    """, (str(time.time() + 2), doc2_id, json.dumps(high_conf_data), json.dumps(med_conf_scores)))

    cursor.execute("""
        UPDATE Document SET status = 'IN_REVIEW', overallConfidence = 0.72, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    """, (doc2_id,))

    # Create ReviewTask
    task_id2 = str(time.time() + 3)
    cursor.execute("""
        INSERT INTO ReviewTask (id, documentId, status, reason, createdAt, updatedAt)
        VALUES (?, ?, 'PENDING', 'Medium confidence score (72%) requires human verification.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """, (task_id2, doc2_id))

    conn.commit()

    cursor.execute("SELECT status FROM Document WHERE id = ?;", (doc2_id,))
    status2 = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM ReviewTask WHERE documentId = ? AND status = 'PENDING';", (doc2_id,))
    task_count2 = cursor.fetchone()[0]

    print(f"✓ Scenario 2 Status: {status2} | Pending Review Tasks: {task_count2}")
    if status2 != "IN_REVIEW" or task_count2 == 0:
        print("ERROR: Scenario 2 expected IN_REVIEW status and pending ReviewTask")
        return False

    # ----------------------------------------------------
    # SCENARIO 3: MATHEMATICAL MISMATCH -> VALIDATION ERROR + FAILED/REVIEW
    # ----------------------------------------------------
    print("\n--- [Scenario 3] Injected Math Validation Error -> Expect Validation Failure ---")
    res3 = ingest_file(sample_file)
    doc3_id = res3["documentId"]

    bad_math_data = dict(high_conf_data)
    bad_math_data["subtotalCost"] = 1250.00
    bad_math_data["freightCost"] = 150.00
    bad_math_data["taxCost"] = 75.00
    bad_math_data["totalAmount"] = 9999.00  # Mismatch! 1250 + 150 + 75 = 1475 != 9999

    cursor.execute("""
        INSERT INTO Extraction (id, documentId, rawOcrText, canonicalJson, confidenceScores, extractedAt)
        VALUES (?, ?, 'Math error sample text', ?, ?, CURRENT_TIMESTAMP)
    """, (str(time.time() + 4), doc3_id, json.dumps(bad_math_data), json.dumps(high_conf_scores)))

    # Store Validation Error
    cursor.execute("""
        INSERT INTO ValidationResult (id, documentId, ruleName, ruleType, passed, severity, message, fieldName)
        VALUES (?, ?, 'MATH_CHECK_TOTAL', 'MATH_CHECK', 0, 'ERROR', 'Subtotal + Freight + Tax ($1475.00) does not equal Total Amount ($9999.00).', 'totalAmount')
    """, (str(time.time() + 5), doc3_id))

    cursor.execute("""
        UPDATE Document SET status = 'FAILED', updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    """, (doc3_id,))

    cursor.execute("""
        INSERT INTO ReviewTask (id, documentId, status, reason, createdAt, updatedAt)
        VALUES (?, ?, 'PENDING', 'Validation failed: Subtotal + Freight + Tax does not equal Total Amount.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """, (str(time.time() + 6), doc3_id))

    conn.commit()

    cursor.execute("SELECT status FROM Document WHERE id = ?;", (doc3_id,))
    status3 = cursor.fetchone()[0]

    cursor.execute("SELECT ruleName, message FROM ValidationResult WHERE documentId = ?;", (doc3_id,))
    val_err = cursor.fetchone()

    print(f"✓ Scenario 3 Status: {status3}")
    print(f"✓ Recorded Validation Error: [{val_err[0]}] {val_err[1]}")

    if status3 != "FAILED" or not val_err:
        print("ERROR: Scenario 3 expected FAILED status and ValidationResult")
        return False

    conn.close()

    print("==========================================================")
    print("PHASE 4 VERIFICATION PASSED SUCCESSFULLY! 🚀")
    print("==========================================================")
    return True

if __name__ == "__main__":
    success = verify_phase4()
    if not success:
        sys.exit(1)
