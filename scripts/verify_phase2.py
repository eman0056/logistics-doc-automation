import sqlite3
import os
import sys
import json

# Add script directory to sys.path
sys.path.append(os.path.dirname(__file__))

from ingest_document import ingest_file, DB_PATH, STORAGE_BASE

def verify_phase2():
    print("================================================")
    print("PHASE 2 VERIFICATION — DOCUMENT INGESTION & STORAGE")
    print("================================================")

    # 1. Locate or create a sample test document
    sample_file_path = "/home/provelopers/Downloads/DHL-Express-invoice-sample.pdf"
    if not os.path.exists(sample_file_path):
        sample_file_path = os.path.join(os.path.dirname(__file__), "test_sample_invoice.pdf")
        if not os.path.exists(sample_file_path):
            with open(sample_file_path, "wb") as f:
                f.write(b"%PDF-1.4 sample test logistics invoice binary content for Phase 2 verification testing.")

    print(f"Ingesting test file: {sample_file_path}")

    # 2. Execute document ingestion pipeline
    res = ingest_file(sample_file_path)
    document_id = res["documentId"]
    storage_rel_path = res["storagePath"]

    print(f"✓ Document ingested with ID: {document_id}")
    print(f"✓ Storage Relative Path: {storage_rel_path}")

    # 3. Verify file exists in physical storage
    abs_storage_path = os.path.join(os.path.dirname(__file__), "..", storage_rel_path)
    if not os.path.exists(abs_storage_path):
        print(f"ERROR: Storage file does not exist at {abs_storage_path}")
        return False
    print("✓ Physical file verified in object storage directory!")

    # 4. Verify Document record in database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT fileName, status, mimeType, fileSize, documentType FROM Document WHERE id = ?;", (document_id,))
    doc_row = cursor.fetchone()

    if not doc_row:
        print("ERROR: Document record not found in database!")
        return False

    file_name, status, mime_type, file_size, doc_type = doc_row
    print(f"✓ DB Document Record Verified:")
    print(f"   - File Name: {file_name}")
    print(f"   - Document Type: {doc_type}")
    print(f"   - MIME Type: {mime_type}")
    print(f"   - Status: {status}")

    if status != "PREPROCESSED":
        print(f"ERROR: Document status is '{status}', expected 'PREPROCESSED'")
        return False

    # 5. Verify AuditLog entries
    cursor.execute("SELECT action, description FROM AuditLog WHERE documentId = ? ORDER BY createdAt ASC;", (document_id,))
    audit_logs = cursor.fetchall()

    print(f"✓ Audit Logs ({len(audit_logs)} entries):")
    for action, desc in audit_logs:
        print(f"   - [{action}] {desc}")

    actions = [a[0] for a in audit_logs]
    if "DOCUMENT_UPLOADED" not in actions or "PREPROCESSED" not in actions:
        print("ERROR: Missing expected audit log actions!")
        return False

    # 6. Verify WorkflowRun records
    cursor.execute("SELECT workflowName, stepName, status FROM WorkflowRun WHERE documentId = ?;", (document_id,))
    workflows = cursor.fetchall()
    print(f"✓ Workflow Execution Runs ({len(workflows)} entries):")
    for wf, step, st in workflows:
        print(f"   - Workflow: {wf} | Step: {step} | Status: {st}")

    conn.close()

    print("================================================")
    print("PHASE 2 VERIFICATION PASSED SUCCESSFULLY! 🚀")
    print("================================================")
    return True

if __name__ == "__main__":
    success = verify_phase2()
    if not success:
        sys.exit(1)
