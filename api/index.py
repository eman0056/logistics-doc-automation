
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import json
import uuid
import time
import os
import urllib.request
import threading
from datetime import datetime
try:
    import psycopg2
except:
    psycopg2 = None

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "prisma", "dev.db")
POSTGRES_URL = os.getenv("POSTGRES_URL")

def get_db():
    if POSTGRES_URL and psycopg2:
        return psycopg2.connect(POSTGRES_URL)
    return sqlite3.connect(DB_PATH)

def execute_query(conn, query, params=()):
    cursor = conn.cursor()
    if POSTGRES_URL and psycopg2:
        query = query.replace("?", "%s")
    cursor.execute(query, params)
    return cursor



def _send_spa_html(path):
    return HTMLResponse('Error parsing SPA')

@app.get("/api/customer")
def get_customer():
    conn = get_db()
    cursor = execute_query(conn, "SELECT id, name, code, logoUrl, primaryColor, secondaryColor FROM Customer LIMIT 1;")
    row = cursor.fetchone()
    conn.close()
    
    customer = {
        "id": row[0] if row else "cust-1",
        "name": row[1] if row else "Apex Freight Logistics",
        "code": row[2] if row else "APEX",
        "logoUrl": row[3] if row else "/logos/apex.png",
        "primaryColor": row[4] if row else "#0284c7",
        "secondaryColor": row[5] if row else "#0f172a"
    }
    return {"success": True, "customer": customer}

@app.get("/api/documents")
def get_documents():
    conn = get_db()
    cursor = execute_query(conn, """
        SELECT d.id, d.fileName, d.fileSize, d.mimeType, d.storagePath, d.documentType, d.status, d.overallConfidence, d.invoiceGeneratedAt, d.createdAt, e.canonicalJson, e.confidenceScores, e.finalSubmittedData
        FROM Document d
        LEFT JOIN Extraction e ON d.id = e.documentId
        ORDER BY d.createdAt DESC;
    """)
    rows = cursor.fetchall()
    conn.close()
    
    docs = []
    for r in rows:
        docs.append({
            "id": r[0],
            "fileName": r[1],
            "fileSize": r[2],
            "mimeType": r[3],
            "storagePath": r[4],
            "documentType": r[5],
            "status": r[6],
            "overallConfidence": r[7],
            "invoiceGeneratedAt": r[8],
            "createdAt": r[9],
            "extraction": {
                "canonicalJson": r[10],
                "confidenceScores": r[11],
                "finalSubmittedData": r[12]
            } if r[10] else None
        })
    return {"success": True, "documents": docs}

@app.post("/api/documents/upload")
async def upload_documents(request: Request):
    form = await request.form()
    files = form.getlist('file')
    if not files:
        return JSONResponse({"error": "No files uploaded"}, status_code=400)
        
    temp_dir = os.path.join(BASE_DIR, "tmp_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    
    app_base_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
    webhook_url = os.getenv("N8N_WEBHOOK_URL", "https://n8n.provelopers.net/webhook/726784a2-239a-4a6d-a837-85828f4b2ca2")
    
    def trigger_webhook(url, data):
        req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
        try:
            urllib.request.urlopen(req, timeout=10)
        except Exception as e:
            print("Webhook error:", e)

    results = []
    try:
        for file_item in files:
            temp_file_path = os.path.join(temp_dir, file_item.filename)
            with open(temp_file_path, 'wb') as f:
                f.write(await file_item.read())
            
            # Simple ingest_file mocking for Vercel
            res = {"documentId": str(uuid.uuid4()), "storagePath": f"uploads/{file_item.filename}", "fileName": file_item.filename, "documentType": "INVOICE"}
            
            # For Vercel, upload to Blob would happen here!
            
            payload = {
                "documentId": res["documentId"],
                "storagePath": res["storagePath"],
                "fileName": res["fileName"],
                "callbackUrl": f"{app_base_url}/api/documents/{res['documentId']}/extraction/callback"
            }
            
            threading.Thread(target=trigger_webhook, args=(webhook_url, payload), daemon=True).start()
            
            conn = get_db()
            execute_query(conn, "INSERT INTO Document (id, fileName, status) VALUES (?, ?, 'PREPROCESSED')", (res["documentId"], res["fileName"]))
            conn.commit()
            conn.close()
            results.append(res["documentId"])
            
        return {"success": True, "documentIds": results}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/batch-generate")
async def batch_generate(request: Request):
    body = await request.json()
    invoices = body.get('invoices', [])
    now_str = datetime.utcnow().isoformat()
    conn = get_db()
    
    doc_ids = []
    for inv in invoices:
        doc_id = inv.get('documentId')
        json_str = json.dumps(inv.get('data'))
        execute_query(conn, "UPDATE Extraction SET finalSubmittedData = ? WHERE documentId = ?;", (json_str, doc_id))
        execute_query(conn, "UPDATE Document SET status = 'INVOICE_GENERATED', invoiceGeneratedAt = ? WHERE id = ?;", (now_str, doc_id))
        doc_ids.append(doc_id)
        
    conn.commit()
    conn.close()
    return {"success": True, "redirectUrl": "/invoices/batch?ids=" + ",".join(doc_ids)}


@app.get("/api/documents/{doc_id}/status")
def get_document_status(doc_id: str):
    conn = get_db()
    cursor = execute_query(conn, "SELECT id, fileName, status, overallConfidence FROM Document WHERE id = ?;", (doc_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return JSONResponse({"error": "Document not found"}, status_code=404)

    is_extracted = row[2] in ["EXTRACTED", "IN_REVIEW", "APPROVED", "INVOICE_GENERATED"]
    return {
        "success": True,
        "documentId": row[0],
        "fileName": row[1],
        "status": row[2],
        "isExtracted": is_extracted,
        "overallConfidence": row[3],
        "reviewUrl": f"/documents/{row[0]}/review"
    }

@app.post("/api/documents/{doc_id}/generate-invoice")
async def generate_invoice(doc_id: str, request: Request):
    body = await request.json()
    submitted = body.get('editedExtractedData') or body.get('finalData')

    if not submitted:
        return JSONResponse({"error": "Payload missing"}, status_code=400)

    json_str = json.dumps(submitted)
    now_str = datetime.utcnow().isoformat()

    conn = get_db()
    execute_query(conn, "UPDATE Extraction SET finalSubmittedData = ? WHERE documentId = ?;", (json_str, doc_id))
    execute_query(conn, "UPDATE Document SET status = 'INVOICE_GENERATED', invoiceGeneratedAt = ? WHERE id = ?;", (now_str, doc_id))
    execute_query(conn, "INSERT INTO AuditLog (id, documentId, action, description) VALUES (?, ?, 'INVOICE_GENERATED', 'Invoice generated');", (str(uuid.uuid4()), doc_id))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "documentId": doc_id,
        "invoiceUrl": f"/invoices/{doc_id}"
    }

@app.post("/api/documents/{doc_id}/extraction/callback")
async def extraction_callback(doc_id: str, request: Request):
    body = await request.json()
    extracted = body.get('extractedData') or body.get('canonicalJson')

    if not extracted:
        return JSONResponse({"error": "Missing extracted payload"}, status_code=400)

    json_str = json.dumps(extracted)
    conn = get_db()
    execute_query(conn, "UPDATE Extraction SET canonicalJson = ? WHERE documentId = ?;", (json_str, doc_id))
    execute_query(conn, "UPDATE Document SET status = 'EXTRACTED' WHERE id = ?;", (doc_id,))
    conn.commit()
    conn.close()

    return {"success": True, "reviewUrl": f"/documents/{doc_id}/review"}

@app.get("/api/review-tasks")
def get_review_tasks():
    conn = get_db()
    cursor = execute_query(conn, """
        SELECT r.id, r.documentId, r.status, r.reason, r.createdAt, d.fileName, d.documentType
        FROM ReviewTask r
        LEFT JOIN Document d ON r.documentId = d.id
        ORDER BY r.createdAt DESC;
    """)
    rows = cursor.fetchall()
    conn.close()

    tasks = []
    for r in rows:
        tasks.append({
            "id": r[0],
            "documentId": r[1],
            "status": r[2],
            "reason": r[3],
            "createdAt": r[4],
            "document": {"fileName": r[5], "documentType": r[6]}
        })
    return {"success": True, "tasks": tasks}

@app.post("/api/review-tasks/{task_id}/submit-review")
async def submit_review(task_id: str, request: Request):
    body = await request.json()
    corrections = body.get('corrections')

    conn = get_db()
    cursor = execute_query(conn, "SELECT documentId FROM ReviewTask WHERE id = ?;", (task_id,))
    row = cursor.fetchone()

    if row:
        doc_id = row[0]
        if corrections:
            execute_query(conn, "UPDATE Extraction SET canonicalJson = ? WHERE documentId = ?;", (json.dumps(corrections), doc_id))
        execute_query(conn, "UPDATE ReviewTask SET status = 'RESOLVED', resolvedAt = CURRENT_TIMESTAMP WHERE id = ?;", (task_id,))
        execute_query(conn, "UPDATE Document SET status = 'APPROVED' WHERE id = ?;", (doc_id,))
        conn.commit()
    conn.close()

    return {"success": True}

from fastapi.responses import HTMLResponse, JSONResponse, FileResponse

@app.get("/uploads/{filename}")
def serve_upload_file(filename: str):
    file_path = os.path.join(BASE_DIR, "uploads", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return JSONResponse({"error": "File not found"}, status_code=404)

@app.get("/{path:path}")
def serve_spa(path: str):
    return _send_spa_html("/" + path)

