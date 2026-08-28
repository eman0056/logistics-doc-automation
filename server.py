import http.server
import socketserver
import json
import urllib.parse
import urllib.request
import threading
import os
import sys
import cgi
import sqlite3
import uuid
import time
from datetime import datetime

PORT = 3000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "prisma", "dev.db")
WORKFLOW_PATH = os.path.join(BASE_DIR, "n8n", "workflows", "Document_Processing_Full.json")
SAVE_APPROVED_WEBHOOK_URL = "https://n8n.provelopers.net/webhook/e7761187-ad68-4fa4-a8e8-87f6eee47314"

sys.path.append(os.path.join(BASE_DIR, "scripts"))
from ingest_document import ingest_file

class LogisticsAutomationHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        sys.stderr.write(f"[{datetime.now().strftime('%H:%M:%S')}] {self.address_string()} - {format % args}\n")

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def _send_html(self, html_content, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(html_content.encode("utf-8"))

    def _send_file_download(self, file_path, download_filename):
        if not os.path.exists(file_path):
            return self._send_json({"error": "File not found"}, 404)
        
        with open(file_path, "rb") as f:
            content = f.read()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Disposition", f'attachment; filename="{download_filename}"')
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path in ["/api/n8n/download-workflow", "/n8n/workflows/Document_Processing_Full.json", "/download-n8n-workflow"]:
            return self._send_file_download(WORKFLOW_PATH, "Document_Processing_Full.json")
        elif path == "/api/customer":
            return self._handle_get_customer()
        elif path == "/api/documents":
            return self._handle_get_documents()
        elif path.startswith("/api/documents/") and path.endswith("/status"):
            doc_id = path.split("/")[3]
            return self._handle_get_document_status(doc_id)
        elif path == "/api/review-tasks":
            return self._handle_get_review_tasks()
        
        elif path.startswith("/uploads/"):
            return self._serve_upload_file(path)
        return self._send_spa_html(path)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/documents/upload":
            return self._handle_upload_document()
        elif path.startswith("/api/documents/") and path.endswith("/process"):
            doc_id = path.split("/")[3]
            return self._handle_process_document(doc_id)
        elif path.startswith("/api/documents/") and path.endswith("/validate"):
            doc_id = path.split("/")[3]
            return self._handle_validate_document(doc_id)
        elif path == "/api/batch-generate":
            return self._handle_batch_generate()
        elif path.startswith("/api/documents/") and path.endswith("/generate-invoice"):
            doc_id = path.split("/")[3]
            return self._handle_generate_invoice(doc_id)
        elif path.startswith("/api/documents/") and "/extraction/callback" in path:
            doc_id = path.split("/")[3]
            return self._handle_extraction_callback(doc_id)
        elif path.startswith("/api/documents/") and path.endswith("/review"):
            doc_id = path.split("/")[3]
            return self._handle_save_review(doc_id)
        elif path.startswith("/api/review-tasks/") and path.endswith("/submit-review"):
            task_id = path.split("/")[3]
            return self._handle_submit_review(task_id)

        self._send_json({"error": "Endpoint not found"}, 404)

    def _handle_save_review(self, doc_id):
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        submitted = body.get('editedData') or body.get('editedExtractedData')

        if not submitted:
            return self._send_json({"error": "Payload missing"}, 400)

        json_str = json.dumps(submitted)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE Extraction SET finalSubmittedData = ? WHERE documentId = ?;", (json_str, doc_id))
        cursor.execute("UPDATE Document SET status = 'APPROVED' WHERE id = ?;", (doc_id,))
        conn.commit()
        conn.close()

        self._send_json({"success": True, "documentId": doc_id})

    def _handle_get_customer(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, code, logoUrl, primaryColor, secondaryColor FROM Customer LIMIT 1;")
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
        self._send_json({"success": True, "customer": customer})

    def _handle_get_documents(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
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
                }
            })
        self._send_json({"success": True, "documents": docs})

    def _handle_get_document_status(self, doc_id):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, fileName, status, overallConfidence FROM Document WHERE id = ?;", (doc_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return self._send_json({"error": "Document not found"}, 404)

        is_extracted = row[2] in ["EXTRACTED", "IN_REVIEW", "APPROVED", "INVOICE_GENERATED"]
        self._send_json({
            "success": True,
            "documentId": row[0],
            "fileName": row[1],
            "status": row[2],
            "isExtracted": is_extracted,
            "overallConfidence": row[3],
            "reviewUrl": f"/documents/{row[0]}/review"
        })

    def _handle_upload_document(self):
        content_type = self.headers.get('Content-Type')
        if not content_type or 'multipart/form-data' not in content_type:
            return self._send_json({"error": "Expected multipart/form-data"}, 400)

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': self.headers['Content-Type']}
        )

        if 'file' not in form:
            return self._send_json({"error": "No file field uploaded"}, 400)

        file_items = form['file']
        if not isinstance(file_items, list):
            file_items = [file_items]

        temp_dir = os.path.join(BASE_DIR, "tmp_uploads")
        os.makedirs(temp_dir, exist_ok=True)
        
        app_base_url = "http://localhost:3000"
        webhook_url = "https://n8n.provelopers.net/webhook/726784a2-239a-4a6d-a837-85828f4b2ca2"
        env_file = os.path.join(BASE_DIR, ".env.local")
        if os.path.exists(env_file):
            with open(env_file, "r") as ef:
                for line in ef:
                    if line.startswith("N8N_WEBHOOK_URL="):
                        webhook_url = line.split("=", 1)[1].strip().strip('"')
                    if line.startswith("APP_BASE_URL="):
                        app_base_url = line.split("=", 1)[1].strip().strip('"')
                        
        def trigger_webhook(url, data):
            import urllib.request
            import json
            req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
            try:
                urllib.request.urlopen(req, timeout=10)
                print(f"Webhook fired successfully for doc {data.get('documentId')}")
            except Exception as e:
                print("Webhook error:", e)

        results = []
        try:
            for file_item in file_items:
                if not file_item.filename: continue
                temp_file_path = os.path.join(temp_dir, file_item.filename)
                with open(temp_file_path, 'wb') as f:
                    f.write(file_item.file.read())
                
                res = ingest_file(temp_file_path)
                os.remove(temp_file_path)
                
                payload = {
                    "documentId": res["documentId"],
                    "storagePath": res["storagePath"],
                    "fileName": res["fileName"],
                    "callbackUrl": f"{app_base_url}/api/documents/{res['documentId']}/extraction/callback"
                }
                
                import threading
                threading.Thread(target=trigger_webhook, args=(webhook_url, payload), daemon=True).start()
                
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute("UPDATE Document SET status = 'PREPROCESSED' WHERE id = ?;", (res["documentId"],))
                conn.commit()
                conn.close()
                
                results.append(res["documentId"])
                
            self._send_json({
                "success": True,
                "documentIds": results
            })
        except Exception as e:
            self._send_json({"error": str(e)}, 500)
            
    def _handle_batch_generate(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        invoices = body.get('invoices', [])
        
        now_str = datetime.utcnow().isoformat()
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        doc_ids = []
        for inv in invoices:
            doc_id = inv.get('documentId')
            json_str = json.dumps(inv.get('data'))
            cursor.execute("UPDATE Extraction SET finalSubmittedData = ? WHERE documentId = ?;", (json_str, doc_id))
            cursor.execute("UPDATE Document SET status = 'INVOICE_GENERATED', invoiceGeneratedAt = ? WHERE id = ?;", (now_str, doc_id))
            doc_ids.append(doc_id)
            
        conn.commit()
        conn.close()
        
        self._send_json({
            "success": True,
            "redirectUrl": "/invoices/batch?ids=" + ",".join(doc_ids)
        })

    def _handle_generate_invoice(self, doc_id):
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        submitted = body.get('editedExtractedData') or body.get('finalData')

        if not submitted:
            return self._send_json({"error": "Payload missing"}, 400)

        json_str = json.dumps(submitted)
        now_str = datetime.utcnow().isoformat()

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE Extraction SET finalSubmittedData = ? WHERE documentId = ?;", (json_str, doc_id))
        cursor.execute("UPDATE Document SET status = 'INVOICE_GENERATED', invoiceGeneratedAt = ? WHERE id = ?;", (now_str, doc_id))
        cursor.execute("INSERT INTO AuditLog (id, documentId, action, description) VALUES (?, ?, 'INVOICE_GENERATED', 'Invoice generated');", (str(uuid.uuid4()), doc_id))
        conn.commit()
        conn.close()

        self._send_json({
            "success": True,
            "documentId": doc_id,
            "invoiceUrl": f"/invoices/{doc_id}"
        })

    def _handle_extraction_callback(self, doc_id):
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        extracted = body.get('extractedData') or body.get('canonicalJson')

        if not extracted:
            return self._send_json({"error": "Missing extracted payload"}, 400)

        json_str = json.dumps(extracted)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("UPDATE Extraction SET canonicalJson = ? WHERE documentId = ?;", (json_str, doc_id))
        cursor.execute("UPDATE Document SET status = 'EXTRACTED' WHERE id = ?;", (doc_id,))
        conn.commit()
        conn.close()

        self._send_json({"success": True, "reviewUrl": f"/documents/{doc_id}/review"})

    def _handle_get_review_tasks(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
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
        self._send_json({"success": True, "tasks": tasks})

    def _handle_submit_review(self, task_id):
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        corrections = body.get('corrections')

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT documentId FROM ReviewTask WHERE id = ?;", (task_id,))
        row = cursor.fetchone()

        if row:
            doc_id = row[0]
            if corrections:
                cursor.execute("UPDATE Extraction SET canonicalJson = ? WHERE documentId = ?;", (json.dumps(corrections), doc_id))
            cursor.execute("UPDATE ReviewTask SET status = 'RESOLVED', resolvedAt = CURRENT_TIMESTAMP WHERE id = ?;", (task_id,))
            cursor.execute("UPDATE Document SET status = 'APPROVED' WHERE id = ?;", (doc_id,))
            conn.commit()
        conn.close()

        self._send_json({"success": True, "status": "APPROVED"})

    def _send_spa_html(self, path):
        html_code = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logistics Document Automation PoC</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen font-sans">
  <div id="app"></div>
  <script>
    const PATH = """ + json.dumps(path) + """;

    function numVal(val, defaultVal = 0) {
      if (val === undefined || val === null) return defaultVal;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? defaultVal : parsed;
    }

    async function loadApp() {
      const app = document.getElementById('app');
      let customer = { name: 'Apex Freight Logistics', code: 'APEX', primaryColor: '#0284c7' };
      try {
        const res = await fetch('/api/customer');
        const d = await res.json();
        if (d.customer) customer = d.customer;
      } catch(e) {}

      const primaryColor = customer.primaryColor || '#0284c7';

      const navHtml = `
        <header class="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-md">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-16">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-lg" style="background-color: ${primaryColor}">🚚</div>
                <div>
                  <div class="flex items-center space-x-2">
                    <span class="text-white font-semibold text-lg tracking-tight">Apex Freight Logistics</span>
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium text-white shadow-sm" style="background-color: ${primaryColor}">${customer.code} White-Label</span>
                  </div>
                  <p class="text-xs text-slate-400">Document Automation Engine</p>
                </div>
              </div>
              <nav class="flex space-x-2 text-sm font-medium text-slate-300">
                <a href="/" class="px-3 py-2 rounded-lg hover:bg-slate-800">Dashboard</a>
                <a href="/documents" class="px-3 py-2 rounded-lg hover:bg-slate-800">Documents</a>
                <a href="/documents/upload" class="px-3 py-2 rounded-lg hover:bg-slate-800">Upload</a>
                <a href="/review-queue" class="px-3 py-2 rounded-lg hover:bg-slate-800">Review Queue</a>
                <a href="/invoices" class="px-3 py-2 rounded-lg hover:bg-slate-800">Invoices</a>
                
              </nav>
            </div>
          </div>
        </header>
      `;

      try {
        if (PATH === '/documents/upload') {
          renderUploadPage(app, navHtml, primaryColor);
        } else if (PATH.startsWith('/documents/') && PATH.includes('/review')) {
          const parts = PATH.split('/');
          renderReviewPage(app, navHtml, primaryColor, parts[2]);
        } else if (PATH.startsWith('/invoices/') && PATH.split('/').length > 2) {
          const parts = PATH.split('/');
          renderInvoicePage(app, navHtml, primaryColor, parts[2]);
        } else if (PATH === '/invoices') {
          renderInvoicesDashboard(app, navHtml, primaryColor);
        } else if (PATH === '/review-queue') {
          renderReviewQueue(app, navHtml, primaryColor);
        } else {
          renderDocumentsList(app, navHtml, primaryColor);
        }
      } catch (err) {
        console.error("Render Error:", err);
        app.innerHTML = navHtml + '<div class="p-8 text-center text-rose-400">Error rendering page: ' + err.message + '</div>';
      }
    }

    function renderUploadPage(app, navHtml, primaryColor) {
      app.innerHTML = `
        ${navHtml}
        <main class="max-w-4xl mx-auto px-4 py-8 space-y-8">
          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex justify-between items-center">
            <div>
              <h1 class="text-2xl font-bold text-white tracking-tight">Document Ingestion & n8n AI Pipeline</h1>
              <p class="text-sm text-slate-400 mt-1">Upload PDF or image logistics paperwork to trigger automated extraction.</p>
            </div>
            <div class="space-x-3">
              
              <a href="/documents" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl">View All Documents</a>
            </div>
          </div>

          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
            <div id="dropzone" class="border-2 border-dashed border-slate-700 hover:border-sky-500 rounded-2xl p-12 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition">
              <input type="file" id="fileInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
              <div class="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl shadow-lg mb-4" style="background-color: ${primaryColor}20; color: ${primaryColor}">📤</div>
              <p class="text-lg font-semibold text-white">Click to upload or drag & drop document</p>
              <p class="text-sm text-slate-400 mt-1">Supports PDF, JPG, PNG up to 25 MB</p>
              <div id="fileSelectedInfo" class="hidden mt-4 text-sm text-sky-400 font-medium"></div>
            </div>

            <button id="uploadBtn" class="w-full mt-6 py-3 rounded-xl text-white font-bold text-sm shadow-xl transition hover:opacity-90" style="background-color: ${primaryColor}">
              Start Upload & AI Processing
            </button>
            <div id="uploadStatus" class="hidden mt-4 text-center text-sm font-medium text-emerald-400"></div>
          </div>
        </main>
      `;

      const dropzone = document.getElementById('dropzone');
      const fileInput = document.getElementById('fileInput');
      const uploadBtn = document.getElementById('uploadBtn');
      const fileSelectedInfo = document.getElementById('fileSelectedInfo');
      const uploadStatus = document.getElementById('uploadStatus');

      dropzone.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        if (e.target.files.length > 0) {
          fileSelectedInfo.textContent = "Selected: " + e.target.files.length + " files";
          fileSelectedInfo.classList.remove('hidden');
        }
      };

      uploadBtn.onclick = async () => {
        if (fileInput.files.length === 0) {
          alert('Please select document files first.');
          return;
        }
        uploadStatus.textContent = "Uploading & running AI extraction pipeline for all files...";
        uploadStatus.classList.remove('hidden');

        const formData = new FormData();
        for (let i = 0; i < fileInput.files.length; i++) {
            formData.append('file', fileInput.files[i]);
        }

        try {
          const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
          const d = await res.json();
          if (d.success) {
            uploadStatus.textContent = "Upload successful! Redirecting to batch review...";
            setTimeout(() => {
              window.location.href = `/review-batch?ids=${d.documentIds.join(',')}`;
            }, 800);
          } else {
            alert(d.error || "Upload failed");
          }
        } catch(err) {
          alert(err.message);
        }
      };
    }

    async function renderDocumentsList(app, navHtml, primaryColor) {
      const res = await fetch('/api/documents');
      const d = await res.json();
      const docs = d.documents || [];

      const rowsHtml = docs.map(doc => `
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/40 transition">
          <td class="px-6 py-4 font-semibold text-white">${doc.fileName}</td>
          <td class="px-6 py-4 text-xs font-bold text-sky-400">${doc.documentType}</td>
          <td class="px-6 py-4 text-xs font-bold text-emerald-400">${doc.status}</td>
          <td class="px-6 py-4 text-xs font-mono text-slate-400">${(doc.fileSize / 1024).toFixed(1)} KB</td>
          <td class="px-6 py-4 text-xs text-slate-400">${new Date(doc.createdAt).toLocaleDateString()}</td>
          <td class="px-6 py-4 text-right space-x-2">
            <a href="/documents/${doc.id}/review" class="text-xs font-semibold text-sky-400 hover:underline">Review & Edit</a>
            ${doc.status === 'INVOICE_GENERATED' ? `<a href="/invoices/${doc.id}" class="text-xs font-semibold text-emerald-400 hover:underline">View Invoice</a>` : ''}
          </td>
        </tr>
      `).join('');

      app.innerHTML = `
        ${navHtml}
        <main class="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <div class="flex justify-between items-center">
            <div>
              <h1 class="text-2xl font-bold text-white tracking-tight">Documents Repository</h1>
              <p class="text-sm text-slate-400">View and manage ingested logistics paperwork.</p>
            </div>
            <a href="/documents/upload" class="px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-lg" style="background-color: ${primaryColor}">+ Upload New Document</a>
          </div>

          <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="bg-slate-950 text-xs font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th class="px-6 py-4">Filename</th>
                  <th class="px-6 py-4">Type</th>
                  <th class="px-6 py-4">Status</th>
                  <th class="px-6 py-4">Size</th>
                  <th class="px-6 py-4">Uploaded At</th>
                  <th class="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="6" class="p-8 text-center text-slate-400">No documents found. Upload one to get started.</td></tr>'}
              </tbody>
            </table>
          </div>
        </main>
      `;
    }

        async function renderBatchReviewPage(app, navHtml, primaryColor) {
      const urlParams = new URLSearchParams(window.location.search);
      const ids = urlParams.get('ids') ? urlParams.get('ids').split(',') : [];
      
      const res = await fetch('/api/documents');
      const d = await res.json();
      const allDocs = d.documents || [];
      
      const docs = ids.map(id => allDocs.find(item => item.id === id)).filter(Boolean);
      
      if (docs.length === 0) {
        app.innerHTML = `${navHtml}<div class="p-8 text-center text-white">No documents found.</div>`;
        return;
      }

      let formsHtml = docs.map((doc, idx) => {
        let canonical = {
            documentNumber: 'DHL-9982412',
            shipmentNumber: '8492019482',
            shipperName: 'Apex Logistics Hub',
            consigneeName: 'Global Distribution Center',
            carrierName: 'DHL Express Freight',
            pickupDate: '2026-08-15',
            deliveryDate: '2026-08-18',
            purchaseOrderNumber: 'PO-2026-9912',
            weightLb: 1450,
            totalQuantity: 4,
            subtotalCost: 1250.00,
            freightCost: 150.00,
            taxCost: 75.00,
            totalAmount: 1475.00
        };
        
        if (doc.extraction?.finalSubmittedData) {
            try { canonical = { ...canonical, ...JSON.parse(doc.extraction.finalSubmittedData) }; } catch(e) {}
        } else if (doc.extraction?.canonicalJson) {
            try { canonical = { ...canonical, ...JSON.parse(doc.extraction.canonicalJson) }; } catch(e) {}
        }

        return `
          <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl mb-6 batch-form" data-docid="${doc.id}">
            <h3 class="text-lg font-bold text-sky-400 border-b border-slate-800 pb-2 mb-4">📄 Document: ${doc.fileName}</h3>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div class="col-span-2">
                <label class="text-slate-400 block mb-1">Invoice Number</label>
                <input type="text" data-field="documentNumber" value="${canonical.documentNumber || ''}" class="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white" />
              </div>
              <div class="col-span-2">
                <label class="text-slate-400 block mb-1">PO Number</label>
                <input type="text" data-field="purchaseOrderNumber" value="${canonical.purchaseOrderNumber || ''}" class="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white" />
              </div>
              <div class="col-span-2">
                <label class="text-slate-400 block mb-1">Shipper</label>
                <input type="text" data-field="shipperName" value="${canonical.shipperName || ''}" class="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white" />
              </div>
              <div class="col-span-2">
                <label class="text-slate-400 block mb-1">Consignee</label>
                <input type="text" data-field="consigneeName" value="${canonical.consigneeName || ''}" class="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Weight</label>
                <input type="number" data-field="weightLb" value="${canonical.weightLb || 0}" class="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Total ($)</label>
                <input type="number" step="0.01" data-field="totalAmount" value="${canonical.totalAmount || 0}" class="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-emerald-400 font-bold" />
              </div>
            </div>
          </div>
        `;
      }).join('');

      app.innerHTML = `
        ${navHtml}
        <main class="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <div class="flex justify-between items-center bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
            <div>
              <h1 class="text-xl font-bold text-white">👁️ Batch Human-in-the-Loop Review</h1>
              <p class="text-xs text-slate-400 mt-1">Review the extracted data for all uploaded invoices below.</p>
            </div>
            <button id="genBatchBtn" class="px-6 py-3 rounded-xl text-white font-bold text-sm shadow-xl" style="background-color: ${primaryColor}">
              Generate Consolidated Invoice
            </button>
          </div>
          
          <div id="batchFormsContainer">
            ${formsHtml}
          </div>
        </main>
      `;

      document.getElementById('genBatchBtn').onclick = async () => {
        const forms = document.querySelectorAll('.batch-form');
        const invoicesData = Array.from(forms).map(form => {
            const inputs = form.querySelectorAll('input');
            const data = {};
            inputs.forEach(input => {
                const field = input.getAttribute('data-field');
                if (input.type === 'number') {
                    data[field] = parseFloat(input.value) || 0;
                } else {
                    data[field] = input.value;
                }
            });
            return {
                documentId: form.getAttribute('data-docid'),
                data: data
            };
        });

        const btn = document.getElementById('genBatchBtn');
        btn.innerHTML = 'Generating... ⏳';
        btn.disabled = true;

        try {
          const res = await fetch(`/api/batch-generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoices: invoicesData })
          });

          const resData = await res.json();
          if (resData.success) {
            window.location.href = resData.redirectUrl;
          } else {
            alert(resData.error || 'Failed to generate');
            btn.innerHTML = 'Generate Consolidated Invoice';
            btn.disabled = false;
          }
        } catch(err) {
          alert('Network error');
          btn.innerHTML = 'Generate Consolidated Invoice';
          btn.disabled = false;
        }
      };
    }

    async function renderBatchInvoicePage(app, navHtml, primaryColor) {
      const urlParams = new URLSearchParams(window.location.search);
      const ids = urlParams.get('ids') ? urlParams.get('ids').split(',') : [];
      
      const res = await fetch('/api/documents');
      const d = await res.json();
      const allDocs = d.documents || [];
      
      const docs = ids.map(id => allDocs.find(item => item.id === id)).filter(Boolean);
      
      let tableRows = '';
      let grandTotal = 0;
      
      docs.forEach(doc => {
          let canonical = {};
          try { canonical = JSON.parse(doc.extraction?.finalSubmittedData || '{}'); } catch(e) {}
          const amt = parseFloat(canonical.totalAmount) || 0;
          grandTotal += amt;
          tableRows += `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px;">${canonical.documentNumber || 'N/A'}</td>
              <td style="padding: 10px;">${canonical.purchaseOrderNumber || 'N/A'}</td>
              <td style="padding: 10px;">${canonical.shipperName || 'N/A'}</td>
              <td style="padding: 10px;">${canonical.consigneeName || 'N/A'}</td>
              <td style="padding: 10px;">${canonical.weightLb || 0}</td>
              <td style="padding: 10px; text-align: right; font-weight: bold;">$${amt.toFixed(2)}</td>
            </tr>
          `;
      });

      app.innerHTML = `
        ${navHtml}
        <style>
          @media print {
            body { background: white; color: black; }
            .no-print { display: none !important; }
            header { display: none !important; }
          }
        </style>
        <main class="max-w-4xl mx-auto px-4 py-8" style="background: white; color: black; min-height: 800px; padding: 40px; font-family: Arial, sans-serif;">
          <div class="no-print" style="margin-bottom: 20px; text-align: right;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #333; color: white; border: none; cursor: pointer;">Print / PDF</button>
          </div>
          
          <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
            <div>
              <h1 style="margin: 0; font-size: 24px; text-transform: uppercase;">CONSOLIDATED INVOICE</h1>
              <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Document Batch Report</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-weight: bold;">Apex Freight Logistics</p>
              <p style="margin: 0; font-size: 12px;">100 Logistics Parkway, Suite 500<br/>Chicago, IL 60601, USA</p>
            </div>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 40px;">
            <thead>
              <tr style="background-color: #f5f5f5; border-bottom: 2px solid #333; text-align: left;">
                <th style="padding: 10px;">Invoice #</th>
                <th style="padding: 10px;">PO #</th>
                <th style="padding: 10px;">Shipper</th>
                <th style="padding: 10px;">Consignee</th>
                <th style="padding: 10px;">Weight (Lb)</th>
                <th style="padding: 10px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          
          <div style="display: flex; justify-content: flex-end;">
            <div style="width: 300px; border-top: 2px solid #000; padding-top: 10px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px;">
                <span>GRAND TOTAL:</span>
                <span>$${grandTotal.toFixed(2)} USD</span>
              </div>
            </div>
          <div style="margin-top: 80px; font-size: 12px; color: #666; text-align: center;">
            <p>This is a consolidated invoice report generated from multiple uploaded documents.</p>
          </div>
        </main>
      `;
    }

    async function renderReviewPage(app, navHtml, primaryColor, docId) {
      const res = await fetch('/api/documents');
      const d = await res.json();
      const doc = (d.documents || []).find(item => item.id === docId) || {};

      let canonical = {};

      if (doc.extraction?.finalSubmittedData) {
        try { canonical = JSON.parse(doc.extraction.finalSubmittedData); } catch(e) {}
      } else if (doc.extraction?.canonicalJson) {
        try { canonical = JSON.parse(doc.extraction.canonicalJson); } catch(e) {}
      }

      const extractionPending = Object.keys(canonical).length === 0;

      let fieldsHtml = '';
      if (extractionPending) {
        fieldsHtml = `
          <div class="text-center py-12 space-y-4">
            <p class="text-slate-400 text-sm">No extracted data yet. Wait a few seconds for n8n to complete, then refresh.</p>
            <button onclick="location.reload()" class="text-xs bg-sky-600 hover:bg-sky-500 text-white px-5 py-2 rounded-xl font-bold transition-colors">Refresh Page</button>
          </div>
        `;
      } else {
        const hasKnownNested = ('invoiceHeader' in canonical) || ('shipmentDetail' in canonical) || ('chargeLineItems' in canonical);

        if (hasKnownNested) {
          // 1. invoiceHeader section
          if (canonical.invoiceHeader && typeof canonical.invoiceHeader === 'object' && !Array.isArray(canonical.invoiceHeader)) {
            fieldsHtml += `
              <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 shadow-md mb-6">
                <div class="flex items-center gap-2 font-bold text-sky-400 text-xs uppercase tracking-wider border-b border-slate-800 pb-3">
                  <span class="p-1.5 bg-sky-500/10 rounded-lg text-sky-400">📄</span> Invoice Header
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            `;
            for (const [key, value] of Object.entries(canonical.invoiceHeader)) {
              const valStr = value === null || value === undefined ? '' : String(value);
              fieldsHtml += `
                <div class="space-y-1.5">
                  <label class="text-slate-400 block font-semibold text-[11px] uppercase tracking-wider">${key}</label>
                  <input data-section="invoiceHeader" data-key="${key.replace(/"/g, '&quot;')}" type="text" value="${valStr.replace(/"/g, '&quot;')}" class="nested-field w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white focus:border-sky-500 focus:outline-none transition-colors font-mono text-sm shadow-inner" />
                </div>
              `;
            }
            fieldsHtml += `</div></div>`;
          }

          // 2. shipmentDetail section (Array)
          if (Array.isArray(canonical.shipmentDetail) && canonical.shipmentDetail.length > 0) {
            fieldsHtml += `
              <div class="space-y-4 mb-6">
                <div class="flex items-center gap-2 font-bold text-sky-400 text-xs uppercase tracking-wider border-b border-slate-800 pb-2">
                  <span class="p-1.5 bg-sky-500/10 rounded-lg text-sky-400">🚚</span> Shipment Details (${canonical.shipmentDetail.length})
                </div>
            `;
            canonical.shipmentDetail.forEach((shipment, sIdx) => {
              fieldsHtml += `
                <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 shadow-md">
                  <div class="text-xs font-bold text-sky-300 flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                    <span class="flex items-center gap-2">
                      <span class="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[10px]">${sIdx + 1}</span>
                      Shipment ${sIdx + 1}
                    </span>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              `;
              if (typeof shipment === 'object' && shipment !== null) {
                for (const [key, value] of Object.entries(shipment)) {
                  const valStr = value === null || value === undefined ? '' : String(value);
                  fieldsHtml += `
                    <div class="space-y-1.5">
                      <label class="text-slate-400 block font-semibold text-[11px] uppercase tracking-wider">${key}</label>
                      <input data-section="shipmentDetail" data-index="${sIdx}" data-key="${key.replace(/"/g, '&quot;')}" type="text" value="${valStr.replace(/"/g, '&quot;')}" class="nested-field w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white focus:border-sky-500 focus:outline-none transition-colors font-mono text-sm shadow-inner" />
                    </div>
                  `;
                }
              }
              fieldsHtml += `</div></div>`;
            });
            fieldsHtml += `</div>`;
          }

          // 3. chargeLineItems section (Array)
          if (Array.isArray(canonical.chargeLineItems) && canonical.chargeLineItems.length > 0) {
            fieldsHtml += `
              <div class="space-y-4 mb-6">
                <div class="flex items-center gap-2 font-bold text-sky-400 text-xs uppercase tracking-wider border-b border-slate-800 pb-2">
                  <span class="p-1.5 bg-sky-500/10 rounded-lg text-sky-400">💳</span> Charge Line Items (${canonical.chargeLineItems.length})
                </div>
            `;
            canonical.chargeLineItems.forEach((charge, cIdx) => {
              fieldsHtml += `
                <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 shadow-md">
                  <div class="text-xs font-bold text-emerald-400 flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                    <span class="flex items-center gap-2">
                      <span class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">${cIdx + 1}</span>
                      Charge ${cIdx + 1}
                    </span>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              `;
              if (typeof charge === 'object' && charge !== null) {
                for (const [key, value] of Object.entries(charge)) {
                  const valStr = value === null || value === undefined ? '' : String(value);
                  fieldsHtml += `
                    <div class="space-y-1.5">
                      <label class="text-slate-400 block font-semibold text-[11px] uppercase tracking-wider">${key}</label>
                      <input data-section="chargeLineItems" data-index="${cIdx}" data-key="${key.replace(/"/g, '&quot;')}" type="text" value="${valStr.replace(/"/g, '&quot;')}" class="nested-field w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white focus:border-sky-500 focus:outline-none transition-colors font-mono text-sm shadow-inner" />
                    </div>
                  `;
                }
              }
              fieldsHtml += `</div></div>`;
            });
            fieldsHtml += `</div>`;
          }

          // 4. Other root keys
          const knownKeys = ['invoiceHeader', 'shipmentDetail', 'chargeLineItems'];
          const otherKeys = Object.keys(canonical).filter(k => !knownKeys.includes(k));
          if (otherKeys.length > 0) {
            fieldsHtml += `
              <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 shadow-md mb-6">
                <div class="flex items-center gap-2 font-bold text-slate-300 text-xs uppercase tracking-wider border-b border-slate-800 pb-3">
                  <span class="p-1.5 bg-slate-800 rounded-lg text-slate-300">⚙️</span> Additional Fields
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            `;
            for (const key of otherKeys) {
              const val = canonical[key];
              let displayVal = val;
              if (typeof val === 'object' && val !== null) {
                try { displayVal = JSON.stringify(val); } catch(e) { displayVal = String(val); }
              }
              const valStr = displayVal === null || displayVal === undefined ? '' : String(displayVal);
              fieldsHtml += `
                <div class="space-y-1.5">
                  <label class="text-slate-400 block font-semibold text-[11px] uppercase tracking-wider">${key}</label>
                  <input data-section="root" data-key="${key.replace(/"/g, '&quot;')}" type="text" value="${valStr.replace(/"/g, '&quot;')}" class="nested-field w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white focus:border-sky-500 focus:outline-none transition-colors font-mono text-sm shadow-inner" />
                </div>
              `;
            }
            fieldsHtml += `</div></div>`;
          }
        } else {
          // Flat structure fallback
          fieldsHtml += `<div class="grid grid-cols-1 gap-4">`;
          for (const [key, value] of Object.entries(canonical)) {
            let displayVal = value;
            if (typeof value === 'object' && value !== null) {
              try { displayVal = JSON.stringify(value); } catch(e) { displayVal = String(value); }
            }
            const valStr = displayVal === null || displayVal === undefined ? '' : String(displayVal);
            fieldsHtml += `
              <div class="space-y-1.5">
                <label class="text-slate-400 block font-semibold text-[11px] uppercase tracking-wider">${key}</label>
                <input data-section="root" data-key="${key.replace(/"/g, '&quot;')}" type="text" value="${valStr.replace(/"/g, '&quot;')}" class="nested-field w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white focus:border-sky-500 focus:outline-none transition-colors shadow-inner font-mono text-sm" />
              </div>
            `;
          }
          fieldsHtml += `</div>`;
        }
      }

      app.innerHTML = `
        ${navHtml}
        <main class="max-w-7xl mx-auto px-4 py-8 space-y-8 text-slate-100">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-3xl font-black tracking-tight text-white">Dynamic Review &amp; Edit</h1>
              <p class="text-slate-400 mt-2">Edit the exact extracted key-value pairs before final generation.</p>
            </div>
            <div class="space-x-3">
              <a href="/documents" class="text-xs bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl transition-colors">Discard</a>
              ${!extractionPending ? `
              <button id="saveReviewBtn" class="text-xs text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:scale-105 transition-transform" style="background-color: ${primaryColor}">Save &amp; Approve</button>
              <button id="genInvoiceBtn" class="text-xs bg-white text-slate-900 hover:bg-slate-200 px-6 py-2 rounded-xl font-bold transition-colors">Generate Invoice</button>` : ''}
            </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div class="xl:col-span-5 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl space-y-4">
              <h3 class="text-sm font-bold text-slate-300 border-b border-slate-800 pb-3">Original Document</h3>
              <div class="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 h-[600px]">
                <img src="/api/documents/${docId}/file" alt="Document Preview" class="w-full h-full object-contain p-2"
                  onerror="this.src='https://placehold.co/600x800/1e293b/475569?text=No+Preview+Available'" />
              </div>
            </div>

            <div class="xl:col-span-7 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl space-y-6">
              <h3 class="text-base font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
                <span class="text-sky-400">⚡</span> Dynamically Extracted Fields
              </h3>
              <div class="bg-slate-950/50 p-6 rounded-xl border border-slate-800/50 space-y-5 max-h-[600px] overflow-y-auto">
                ${fieldsHtml}
              </div>
            </div>
          </div>
        </main>
      `;

      if (!extractionPending) {
        const collectPayload = () => {
          const payload = {};
          document.querySelectorAll('.nested-field').forEach(input => {
            const section = input.getAttribute('data-section');
            const key = input.getAttribute('data-key');
            const indexStr = input.getAttribute('data-index');
            let val = input.value;

            if (section === 'invoiceHeader') {
              if (!payload.invoiceHeader) payload.invoiceHeader = {};
              payload.invoiceHeader[key] = val;
            } else if (section === 'shipmentDetail') {
              if (!payload.shipmentDetail) payload.shipmentDetail = [];
              const idx = parseInt(indexStr, 10);
              if (!payload.shipmentDetail[idx]) payload.shipmentDetail[idx] = {};
              payload.shipmentDetail[idx][key] = val;
            } else if (section === 'chargeLineItems') {
              if (!payload.chargeLineItems) payload.chargeLineItems = [];
              const idx = parseInt(indexStr, 10);
              if (!payload.chargeLineItems[idx]) payload.chargeLineItems[idx] = {};
              payload.chargeLineItems[idx][key] = val;
            } else if (section === 'root') {
              if (val.trim().startsWith('{') || val.trim().startsWith('[')) {
                try { val = JSON.parse(val); } catch(e) {}
              }
              payload[key] = val;
            } else {
              if (indexStr !== null && indexStr !== undefined) {
                if (!payload[section]) payload[section] = [];
                const idx = parseInt(indexStr, 10);
                if (!payload[section][idx]) payload[section][idx] = {};
                payload[section][idx][key] = val;
              } else {
                if (!payload[section]) payload[section] = {};
                payload[section][key] = val;
              }
            }
          });
          return payload;
        };

        const SAVE_APPROVED_WEBHOOK_URL = "${SAVE_APPROVED_WEBHOOK_URL}";

        document.getElementById('saveReviewBtn').onclick = async () => {
          const payload = collectPayload();
          const btn = document.getElementById('saveReviewBtn');
          btn.innerHTML = 'Saving & Syncing...';
          btn.disabled = true;

          let backendSuccess = false;
          let backendError = '';

          try {
            const r = await fetch('/api/documents/' + docId + '/review', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ editedData: payload })
            });
            const rd = await r.json();
            if (rd.success) {
              backendSuccess = true;
            } else {
              backendError = rd.error || 'Failed to save to database';
            }
          } catch(e) {
            backendError = 'Network error saving to database';
          }

          if (!backendSuccess) {
            alert(backendError);
            btn.innerHTML = 'Save & Approve';
            btn.disabled = false;
            return;
          }

          let webhookSuccess = false;
          let webhookError = '';
          try {
            const wRes = await fetch(SAVE_APPROVED_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (wRes.ok) {
              webhookSuccess = true;
            } else {
              webhookError = 'Webhook returned status ' + wRes.status;
            }
          } catch(e) {
            webhookError = 'Webhook network error: ' + (e.message || e);
          }

          if (webhookSuccess) {
            btn.innerHTML = 'Saved and synced ✓';
            setTimeout(() => { btn.innerHTML = 'Save & Approve'; btn.disabled = false; }, 2500);
          } else {
            btn.innerHTML = 'Saved (Sync Warning ⚠️)';
            alert('Saved to database successfully, but webhook sync failed: ' + webhookError);
            setTimeout(() => { btn.innerHTML = 'Save & Approve'; btn.disabled = false; }, 3000);
          }
        };

        document.getElementById('genInvoiceBtn').onclick = async () => {
          const payload = collectPayload();
          const btn = document.getElementById('genInvoiceBtn');
          btn.innerHTML = 'Generating...'; btn.disabled = true;
          try {
            const r = await fetch('/api/documents/' + docId + '/generate-invoice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ editedExtractedData: payload })
            });
            const rd = await r.json();
            if (rd.success && rd.invoiceUrl) {
              window.location.href = rd.invoiceUrl;
            } else {
              alert(rd.error || 'Failed to generate invoice');
              btn.innerHTML = 'Generate Invoice'; btn.disabled = false;
            }
          } catch(e) { alert('Network error'); btn.innerHTML = 'Generate Invoice'; btn.disabled = false; }
        };
      }
    }

    async function renderInvoicePage(app, navHtml, primaryColor, docId) {
      const res = await fetch('/api/documents');
      const d = await res.json();
      const doc = (d.documents || []).find(item => item.id === docId) || {};

      let canonical = {
        documentNumber: 'DHL-9982412',
        shipmentNumber: '8492019482',
        shipperName: 'Apex Logistics Hub',
        consigneeName: 'Global Distribution Center',
        carrierName: 'DHL Express Freight',
        pickupDate: '2026-08-15',
        deliveryDate: '2026-08-18',
        purchaseOrderNumber: 'PO-2026-9912',
        weightLb: 1450,
        totalQuantity: 4,
        subtotalCost: 1250.00,
        freightCost: 150.00,
        taxCost: 75.00,
        totalAmount: 1475.00,
        lineItems: []
      };

      if (doc.extraction?.finalSubmittedData) {
        try { canonical = { ...canonical, ...JSON.parse(doc.extraction.finalSubmittedData) }; } catch(e) {}
      } else if (doc.extraction?.canonicalJson) {
        try { canonical = { ...canonical, ...JSON.parse(doc.extraction.canonicalJson) }; } catch(e) {}
      }

      const subtotalFormatted = numVal(canonical.subtotalCost, 1250).toFixed(2);
      const freightFormatted = numVal(canonical.freightCost, 150).toFixed(2);
      const taxFormatted = numVal(canonical.taxCost, 75).toFixed(2);
      const totalFormatted = numVal(canonical.totalAmount, 1475).toFixed(2);

      let itemsHtml = '';
      if (canonical.lineItems && canonical.lineItems.length > 0) {
        itemsHtml = canonical.lineItems.map(item => `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-4 border-b border-slate-100 font-medium text-slate-800">${item.description || 'Logistics Freight Item'}</td>
            <td class="p-4 border-b border-slate-100 text-center font-mono text-slate-500">${item.quantity || 1}</td>
            <td class="p-4 border-b border-slate-100 text-right font-mono text-slate-500">$${numVal(item.unitPrice, 100).toFixed(2)}</td>
            <td class="p-4 border-b border-slate-100 text-right font-mono font-bold text-slate-900">$${numVal(item.totalPrice, 100).toFixed(2)}</td>
          </tr>
        `).join('');
      } else {
        itemsHtml = `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-4 border-b border-slate-100 font-medium text-slate-800">Freight Transport & Cargo Handling Services</td>
            <td class="p-4 border-b border-slate-100 text-center font-mono text-slate-500">1</td>
            <td class="p-4 border-b border-slate-100 text-right font-mono text-slate-500">$${subtotalFormatted}</td>
            <td class="p-4 border-b border-slate-100 text-right font-mono font-bold text-slate-900">$${subtotalFormatted}</td>
          </tr>
        `;
      }

      app.innerHTML = `
        ${navHtml}
        <style>
          @media print {
            body { background: white; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
            header { display: none !important; }
            main { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
            .shadow-2xl { shadow: none !important; box-shadow: none !important; border: none !important; }
          }
          @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-in { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        </style>
        <main class="max-w-5xl mx-auto px-4 py-8 space-y-6 text-slate-900 animate-in">
          <div class="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg no-print">
            <a href="/documents/${docId}/review" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 rounded-xl transition-colors">← Back to Review</a>
            <div class="space-x-3 flex items-center">
              <span class="text-xs text-emerald-400 font-medium mr-2 flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Invoice Ready</span>
              <button onclick="window.print()" class="text-xs bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-xl font-bold transition-colors">🖨️ Print</button>
              <button onclick="window.print()" class="text-xs text-white px-5 py-2 rounded-xl font-bold shadow-lg shadow-sky-900/30 hover:scale-105 transition-transform" style="background-color: ${primaryColor}">Download PDF 📥</button>
            </div>
          </div>

          <!-- Invoice Paper -->
          <div class="bg-white rounded-[24px] p-12 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100 relative overflow-hidden">
            <!-- Decorative Header Accent -->
            <div class="absolute top-0 left-0 w-full h-3" style="background-color: ${primaryColor}"></div>
            <div class="absolute top-0 right-12 w-24 h-24 rounded-b-full opacity-10" style="background-color: ${primaryColor}"></div>

            <div class="flex justify-between items-start border-b border-slate-100 pb-10">
              <div>
                <div class="flex items-center gap-3 mb-4">
                  <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-lg text-xl" style="background-color: ${primaryColor}">🚚</div>
                  <div>
                    <h1 class="text-3xl font-black text-slate-900 tracking-tight">Apex Freight Logistics</h1>
                    <p class="text-sm text-slate-500 font-medium">Global Logistics & Freight Operations</p>
                  </div>
                </div>
                <div class="text-xs text-slate-500 space-y-1 ml-1">
                  <p>100 Logistics Parkway, Suite 500</p>
                  <p>Chicago, IL 60601, USA</p>
                  <p>billing@apexfreightlogistics.com</p>
                  <p>+1 (800) 555-0199</p>
                </div>
              </div>
              <div class="text-right flex flex-col items-end">
                <span class="px-4 py-1.5 bg-sky-50 text-sky-700 text-[10px] uppercase tracking-widest font-bold rounded-full mb-4 border border-sky-100">Official Invoice</span>
                <h2 class="text-4xl font-black text-slate-900 tracking-tighter mb-2" style="color: ${primaryColor}">${canonical.documentNumber || 'INV-000000'}</h2>
                <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-500 text-right mt-2">
                  <span class="font-bold text-slate-400">Issue Date:</span> <span class="font-medium text-slate-800">${canonical.pickupDate || '2026-08-15'}</span>
                  <span class="font-bold text-slate-400">Due Date:</span> <span class="font-medium text-slate-800">${canonical.deliveryDate || '2026-09-15'}</span>
                  <span class="font-bold text-slate-400">Shipment #:</span> <span class="font-mono font-medium text-slate-800">${canonical.shipmentNumber || 'N/A'}</span>
                  <span class="font-bold text-slate-400">PO Number:</span> <span class="font-mono font-medium text-slate-800">${canonical.purchaseOrderNumber || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-8 mt-10 mb-12">
              <div class="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 relative overflow-hidden">
                <div class="absolute left-0 top-0 h-full w-1" style="background-color: ${primaryColor}"></div>
                <h3 class="font-bold text-slate-400 text-[10px] tracking-widest uppercase mb-3 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Bill To / Consignee</h3>
                <p class="font-black text-slate-900 text-lg mb-1">${canonical.consigneeName || 'Global Distribution Center'}</p>
                <p class="text-slate-500 text-sm leading-relaxed">Dallas Regional Hub<br/>4500 Freight Way<br/>Dallas, TX 75201</p>
              </div>
              <div class="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 relative overflow-hidden">
                <div class="absolute left-0 top-0 h-full w-1 bg-slate-300"></div>
                <h3 class="font-bold text-slate-400 text-[10px] tracking-widest uppercase mb-3 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> From / Shipper</h3>
                <p class="font-black text-slate-900 text-lg mb-1">${canonical.shipperName || 'Apex Logistics Hub'}</p>
                <p class="text-slate-500 text-sm leading-relaxed">Origin Fulfillment Center<br/>100 Industrial Drive<br/>Chicago, IL 60601</p>
              </div>
            </div>
            
            <div class="grid grid-cols-3 gap-4 mb-10 text-xs">
                <div class="border border-slate-100 rounded-xl p-4 flex flex-col items-center text-center">
                    <span class="text-slate-400 font-semibold uppercase tracking-wider mb-1 text-[10px]">Carrier</span>
                    <span class="font-bold text-slate-800">${canonical.carrierName || 'Apex Freight'}</span>
                </div>
                <div class="border border-slate-100 rounded-xl p-4 flex flex-col items-center text-center">
                    <span class="text-slate-400 font-semibold uppercase tracking-wider mb-1 text-[10px]">Total Weight</span>
                    <span class="font-bold text-slate-800">${canonical.weightLb || 0} LBS</span>
                </div>
                <div class="border border-slate-100 rounded-xl p-4 flex flex-col items-center text-center">
                    <span class="text-slate-400 font-semibold uppercase tracking-wider mb-1 text-[10px]">Total Qty</span>
                    <span class="font-bold text-slate-800">${canonical.totalQuantity || 0} Units</span>
                </div>
            </div>

            <div class="overflow-hidden rounded-2xl border border-slate-200">
              <table class="w-full text-left text-sm border-collapse">
                <thead>
                  <tr class="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                    <th class="p-4 border-b border-slate-200 w-1/2">Description</th>
                    <th class="p-4 border-b border-slate-200 text-center">Qty</th>
                    <th class="p-4 border-b border-slate-200 text-right">Unit Price</th>
                    <th class="p-4 border-b border-slate-200 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${itemsHtml}
                </tbody>
              </table>
            </div>

            <div class="flex justify-end mt-8">
              <div class="w-80">
                <div class="space-y-3 text-sm text-slate-600 border-b border-slate-200 pb-4 mb-4">
                  <div class="flex justify-between items-center"><span class="font-medium">Subtotal</span><span class="font-mono">$${subtotalFormatted}</span></div>
                  <div class="flex justify-between items-center"><span class="font-medium">Freight Charge</span><span class="font-mono">$${freightFormatted}</span></div>
                  <div class="flex justify-between items-center"><span class="font-medium">Taxes & Duties</span><span class="font-mono">$${taxFormatted}</span></div>
                </div>
                <div class="flex justify-between items-center p-5 rounded-2xl text-white shadow-xl" style="background-color: ${primaryColor}">
                  <span class="font-bold text-sm tracking-wide">TOTAL DUE</span>
                  <span class="font-black font-mono text-2xl tracking-tighter">$${totalFormatted} <span class="text-xs font-medium opacity-80 ml-1">${canonical.currency || 'USD'}</span></span>
                </div>
              </div>
            </div>
            
            <div class="mt-16 pt-8 border-t border-slate-100 text-center text-xs text-slate-400 space-y-1">
              <p class="font-medium text-slate-500">Thank you for your business.</p>
              <p>Payment is due within 30 days of the invoice date. Please include the invoice number on your check.</p>
            </div>
          </div>
        </main>
      `;
    }

    async function renderInvoicesDashboard(app, navHtml, primaryColor) {
      const res = await fetch('/api/documents');
      const d = await res.json();
      const docs = d.documents || [];

      const invoices = docs.filter(doc => doc.status === 'INVOICE_GENERATED' || doc.extraction?.finalSubmittedData);

      const rows = invoices.map(inv => {
        let p = {};
        try { p = JSON.parse(inv.extraction?.finalSubmittedData || inv.extraction?.canonicalJson || '{}'); } catch(e) {}
        const totalVal = numVal(p.totalAmount, 1475).toFixed(2);
        return `
          <tr class="border-b border-slate-800/60 hover:bg-slate-800/40">
            <td class="px-6 py-4 font-mono font-bold text-white">${p.documentNumber || 'INV-001'}</td>
            <td class="px-6 py-4 text-xs text-slate-200">${p.shipperName || 'Apex Freight'}</td>
            <td class="px-6 py-4 text-xs text-slate-200">${p.consigneeName || 'Global Distribution'}</td>
            <td class="px-6 py-4 font-mono font-extrabold text-emerald-400">$${totalVal} USD</td>
            <td class="px-6 py-4 text-xs font-bold text-emerald-400">${inv.status}</td>
            <td class="px-6 py-4 text-right">
              <a href="/invoices/${inv.id}" class="text-xs font-semibold text-sky-400 hover:underline">View Invoice</a>
            </td>
          </tr>
        `;
      }).join('');

      app.innerHTML = `
        ${navHtml}
        <main class="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <div class="flex justify-between items-center">
            <div>
              <h1 class="text-2xl font-bold text-white">Generated Invoices Dashboard</h1>
              <p class="text-sm text-slate-400">Browse, print, and download generated billing invoices.</p>
            </div>
            <a href="/documents/upload" class="px-5 py-2.5 rounded-xl text-white font-bold text-sm" style="background-color: ${primaryColor}">+ New Invoice Upload</a>
          </div>

          <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="bg-slate-950 text-xs font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th class="px-6 py-4">Invoice #</th>
                  <th class="px-6 py-4">Shipper</th>
                  <th class="px-6 py-4">Consignee</th>
                  <th class="px-6 py-4">Total Amount</th>
                  <th class="px-6 py-4">Status</th>
                  <th class="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="6" class="p-8 text-center text-slate-400">No generated invoices found yet. Upload and generate one!</td></tr>'}
              </tbody>
            </table>
          </div>
        </main>
      `;
    }

    async function renderReviewQueue(app, navHtml, primaryColor) {
      const res = await fetch('/api/review-tasks');
      const d = await res.json();
      const tasks = d.tasks || [];

      const rows = tasks.map(t => `
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/40">
          <td class="px-6 py-4 font-semibold text-white">${t.document?.fileName || 'Document'}</td>
          <td class="px-6 py-4 text-xs font-bold text-amber-400">NORMAL</td>
          <td class="px-6 py-4 text-xs text-slate-300">${t.reason}</td>
          <td class="px-6 py-4 text-xs text-slate-400">${new Date(t.createdAt).toLocaleDateString()}</td>
          <td class="px-6 py-4 text-right">
            <a href="/documents/${t.documentId}/review" class="text-xs font-bold text-white px-3 py-1.5 rounded-lg" style="background-color: ${primaryColor}">Open Review</a>
          </td>
        </tr>
      `).join('');

      app.innerHTML = `
        ${navHtml}
        <main class="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 class="text-2xl font-bold text-white">Human-in-the-Loop Review Queue</h1>
            <p class="text-sm text-slate-400">Review low-confidence extractions and authorize submission.</p>
          </div>

          <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="bg-slate-950 text-xs font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th class="px-6 py-4">Document</th>
                  <th class="px-6 py-4">Priority</th>
                  <th class="px-6 py-4">Reason</th>
                  <th class="px-6 py-4">Created Date</th>
                  <th class="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="5" class="p-8 text-center text-slate-400">All clear! No pending review tasks.</td></tr>'}
              </tbody>
            </table>
          </div>
        </main>
      `;
    }

    loadApp();
  </script>
</body>
</html>"""
        self._send_html(html_code)

def run_server():
    with socketserver.TCPServer(("", PORT), LogisticsAutomationHandler) as httpd:
        print(f"Logistics Document Automation PoC Web Server running at http://localhost:{PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()


    def _serve_upload_file(self, path):
        file_path = os.path.join(BASE_DIR, path.lstrip('/'))
        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            if file_path.endswith(".pdf"):
                self.send_header("Content-Type", "application/pdf")
            else:
                self.send_header("Content-Type", "application/octet-stream")
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File not found")
