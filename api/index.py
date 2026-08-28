
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

import traceback
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "trace": traceback.format_exc()}
    )

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVE_APPROVED_WEBHOOK_URL = "https://n8n.provelopers.net/webhook/e7761187-ad68-4fa4-a8e8-87f6eee47314"
# On Vercel, filesystem is read-only except /tmp
if os.getenv("VERCEL"):
    DB_PATH = "/tmp/dev.db"
else:
    DB_PATH = os.path.join(BASE_DIR, "prisma", "dev.db")
POSTGRES_URL = os.getenv("POSTGRES_URL")
if not POSTGRES_URL:
    _db_url = os.getenv("DATABASE_URL", "")
    if _db_url.startswith("postgres"):
        POSTGRES_URL = _db_url

DB_INITIALIZED = False

def init_db(conn):
    global DB_INITIALIZED
    if DB_INITIALIZED: return
    queries = [
        "CREATE TABLE IF NOT EXISTS Customer (id VARCHAR(50) PRIMARY KEY, name VARCHAR(255), code VARCHAR(50), logoUrl VARCHAR(255), primaryColor VARCHAR(50), secondaryColor VARCHAR(50));",
        "CREATE TABLE IF NOT EXISTS Document (id VARCHAR(50) PRIMARY KEY, fileName VARCHAR(255), fileSize INTEGER, mimeType VARCHAR(100), storagePath VARCHAR(255), documentType VARCHAR(50), status VARCHAR(50), overallConfidence REAL, invoiceGeneratedAt TIMESTAMP, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
        "CREATE TABLE IF NOT EXISTS Extraction (documentId VARCHAR(50) PRIMARY KEY, canonicalJson TEXT, confidenceScores TEXT, finalSubmittedData TEXT);",
        "CREATE TABLE IF NOT EXISTS ReviewTask (id VARCHAR(50) PRIMARY KEY, documentId VARCHAR(50), status VARCHAR(50), reason TEXT, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, resolvedAt TIMESTAMP);",
        "CREATE TABLE IF NOT EXISTS AuditLog (id VARCHAR(50) PRIMARY KEY, documentId VARCHAR(50), action VARCHAR(50), description TEXT, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
    ]
    cursor = conn.cursor()
    for q in queries:
        cursor.execute(q)
    conn.commit()
    
    # Safely add columns that might already exist
    alter_statements = [
        "ALTER TABLE Document ADD COLUMN fileData TEXT;",
        "ALTER TABLE Extraction ADD COLUMN rawocrtext TEXT;",
        'ALTER TABLE Extraction ADD COLUMN "rawOcrText" TEXT;',
        "ALTER TABLE Extraction ADD COLUMN rawOcrText TEXT;"
    ]
    for stmt in alter_statements:
        try:
            cursor.execute(stmt)
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
    DB_INITIALIZED = True
    

def get_db():
    if POSTGRES_URL and psycopg2:
        conn = psycopg2.connect(POSTGRES_URL)
    else:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
    
    if not DB_INITIALIZED:
        init_db(conn)
    return conn

def execute_query(conn, query, params=()):
    cursor = conn.cursor()
    if POSTGRES_URL and psycopg2:
        query = query.replace("?", "%s")
    cursor.execute(query, params)
    return cursor

@app.get("/api/debug-info")
def debug_info():
    db_error = None
    db_ok = False
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        db_ok = True
        conn.close()
    except Exception as e:
        db_error = str(e)
    return {
        "status": "app_loaded",
        "DB_PATH": DB_PATH,
        "POSTGRES_URL_set": bool(POSTGRES_URL),
        "psycopg2_available": psycopg2 is not None,
        "VERCEL": os.getenv("VERCEL", "not_set"),
        "DATABASE_URL_prefix": (os.getenv("DATABASE_URL", ""))[:30],
        "db_ok": db_ok,
        "db_error": db_error
    }


def _send_spa_html(path):
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
          await renderReviewPage(app, navHtml, primaryColor, parts[2]);
        } else if (PATH.startsWith('/invoices/') && PATH.split('/').length > 2) {
          const parts = PATH.split('/');
          await renderInvoicePage(app, navHtml, primaryColor, parts[2]);
        } else if (PATH === '/invoices') {
          await renderInvoicesDashboard(app, navHtml, primaryColor);
        } else if (PATH === '/review-queue') {
          await renderReviewQueue(app, navHtml, primaryColor);
        } else {
          await renderDocumentsList(app, navHtml, primaryColor);
        }
      } catch (err) {
        console.error("Render Error:", err);
        app.innerHTML = navHtml + '<div class="p-8 text-center text-rose-400 bg-slate-900 rounded-2xl m-4"><h2 class="text-xl font-bold mb-2">Page Render Error</h2><p class="font-mono text-sm">' + (err.message || String(err)) + '</p></div>';
      }
    }

    function renderUploadPage(app, navHtml, primaryColor) {
      const safeColor = primaryColor || '#0284c7';
      try {
        app.innerHTML = `
          ${navHtml}
          <main class="max-w-4xl mx-auto px-4 py-8 space-y-8">
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex justify-between items-center">
              <div>
                <h1 class="text-2xl font-bold text-white tracking-tight">Document Ingestion &amp; n8n AI Pipeline</h1>
                <p class="text-sm text-slate-400 mt-1">Upload logistics paperwork to trigger automated AI extraction.</p>
              </div>
              <div class="space-x-3">
                <a href="/documents" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl">View All Documents</a>
              </div>
            </div>

            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
              <div id="dropzone" class="border-2 border-dashed border-slate-700 hover:border-sky-500 rounded-2xl p-12 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition-colors duration-200">
                <input type="file" id="fileInput" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv,.txt,.tif,.tiff" multiple />
                <div class="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl shadow-lg mb-4" style="background-color: rgba(2,132,199,0.12); color: ${safeColor}">📤</div>
                <p class="text-lg font-semibold text-white">Click to upload or drag &amp; drop</p>
                <p class="text-sm text-slate-400 mt-1">PDF, JPG, JPEG, PNG, DOC, DOCX, XLS, XLSX, CSV, TXT, TIFF &mdash; up to 25 MB</p>
                <div id="fileSelectedInfo" class="hidden mt-4 text-sm text-sky-400 font-medium"></div>
              </div>

              <button id="uploadBtn" class="w-full mt-6 py-3 rounded-xl text-white font-bold text-sm shadow-xl transition hover:opacity-90" style="background-color: ${safeColor}">
                Start Upload &amp; AI Processing
              </button>
              <div id="uploadStatus" class="hidden mt-4 text-center text-sm font-medium text-emerald-400"></div>
            </div>
          </main>
        `;
      } catch(renderErr) {
        console.error('renderUploadPage error:', renderErr);
        app.innerHTML = navHtml + '<div class="p-8 text-red-400">Upload page render error: ' + renderErr.message + '</div>';
        return;
      }

      const dropzone = document.getElementById('dropzone');
      const fileInput = document.getElementById('fileInput');
      const uploadBtn = document.getElementById('uploadBtn');
      const fileSelectedInfo = document.getElementById('fileSelectedInfo');
      const uploadStatus = document.getElementById('uploadStatus');

      if (!dropzone || !fileInput || !uploadBtn) {
        console.error('Upload page: required DOM elements not found');
        return;
      }

      dropzone.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        if (e.target.files.length > 0) {
          fileSelectedInfo.textContent = "Selected: " + e.target.files.length + " file(s)";
          fileSelectedInfo.classList.remove('hidden');
        }
      };

      uploadBtn.onclick = async () => {
        if (fileInput.files.length === 0) {
          alert('Please select document files first.');
          return;
        }
        const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'tif', 'tiff'];
        for (let i = 0; i < fileInput.files.length; i++) {
          const ext = fileInput.files[i].name.split('.').pop().toLowerCase();
          if (!allowedExts.includes(ext)) {
            alert('Unsupported file type: ' + fileInput.files[i].name + '\nAllowed: PDF, JPG, JPEG, PNG, DOC, DOCX, XLS, XLSX, CSV, TXT, TIFF');
            return;
          }
        }
        uploadBtn.disabled = true;
        uploadStatus.textContent = "Uploading & running AI extraction...";
        uploadStatus.classList.remove('hidden');

        const formData = new FormData();
        for (let i = 0; i < fileInput.files.length; i++) {
          formData.append('file', fileInput.files[i]);
        }

        try {
          const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
          const d = await res.json();
          if (d.success && d.documentIds && d.documentIds.length > 0) {
            uploadStatus.textContent = "Upload successful! Redirecting to review...";
            setTimeout(() => {
              window.location.href = '/documents/' + d.documentIds[0] + '/review';
            }, 800);
          } else {
            uploadBtn.disabled = false;
            alert(d.error || "Upload failed");
          }
        } catch(err) {
          uploadBtn.disabled = false;
          alert('Upload error: ' + err.message);
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
        const hasKnownNested = ('invoiceHeader' in canonical) || ('shipmentDetails' in canonical) || ('shipmentDetail' in canonical) || ('chargeLineItems' in canonical);

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

          // 2. shipmentDetails / shipmentDetail section (Array)
          const shipmentsArr = (Array.isArray(canonical.shipmentDetails) && canonical.shipmentDetails.length > 0) ? canonical.shipmentDetails : ((Array.isArray(canonical.shipmentDetail) && canonical.shipmentDetail.length > 0) ? canonical.shipmentDetail : []);
          const shipmentSecName = (Array.isArray(canonical.shipmentDetails) && canonical.shipmentDetails.length > 0) ? 'shipmentDetails' : 'shipmentDetail';
          
          if (shipmentsArr.length > 0) {
            fieldsHtml += `
              <div class="space-y-4 mb-6">
                <div class="flex items-center gap-2 font-bold text-sky-400 text-xs uppercase tracking-wider border-b border-slate-800 pb-2">
                  <span class="p-1.5 bg-sky-500/10 rounded-lg text-sky-400">🚚</span> Shipment Details (${shipmentsArr.length})
                </div>
            `;
            shipmentsArr.forEach((shipment, sIdx) => {
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
                  if (key === 'chargeLineItems') continue; // Handled separately below if nested
                  const valStr = value === null || value === undefined ? '' : String(value);
                  fieldsHtml += `
                    <div class="space-y-1.5">
                      <label class="text-slate-400 block font-semibold text-[11px] uppercase tracking-wider">${key}</label>
                      <input data-section="${shipmentSecName}" data-index="${sIdx}" data-key="${key.replace(/"/g, '&quot;')}" type="text" value="${valStr.replace(/"/g, '&quot;')}" class="nested-field w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white focus:border-sky-500 focus:outline-none transition-colors font-mono text-sm shadow-inner" />
                    </div>
                  `;
                }
              }
              fieldsHtml += `</div>`;

              // Check for nested chargeLineItems inside shipment
              if (shipment && Array.isArray(shipment.chargeLineItems) && shipment.chargeLineItems.length > 0) {
                fieldsHtml += `
                  <div class="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
                    <div class="text-xs font-bold text-emerald-400 flex items-center gap-2">
                      <span>💳</span> Charge Line Items (${shipment.chargeLineItems.length})
                    </div>
                `;
                shipment.chargeLineItems.forEach((charge, cIdx) => {
                  fieldsHtml += `
                    <div class="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3">
                  `;
                  for (const [ckey, cval] of Object.entries(charge)) {
                    const cvalStr = cval === null || cval === undefined ? '' : String(cval);
                    fieldsHtml += `
                      <div class="space-y-1">
                        <label class="text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">${ckey}</label>
                        <input data-section="${shipmentSecName}" data-ship-idx="${sIdx}" data-charge-idx="${cIdx}" data-charge-key="${ckey.replace(/"/g, '&quot;')}" type="text" value="${cvalStr.replace(/"/g, '&quot;')}" class="nested-charge-field w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs" />
                      </div>
                    `;
                  }
                  fieldsHtml += `</div>`;
                });
                fieldsHtml += `</div>`;
              }

              fieldsHtml += `</div>`;
            });
            fieldsHtml += `</div>`;
          }

          // 3. Standalone chargeLineItems section (Array, if top-level)
          if (Array.isArray(canonical.chargeLineItems) && canonical.chargeLineItems.length > 0) {
            fieldsHtml += `
              <div class="space-y-4 mb-6">
                <div class="flex items-center gap-2 font-bold text-sky-400 text-xs uppercase tracking-wider border-b border-slate-800 pb-2">
                  <span class="p-1.5 bg-sky-500/10 rounded-lg text-sky-400">💳</span> Standalone Charge Line Items (${canonical.chargeLineItems.length})
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
          const knownKeys = ['invoiceHeader', 'shipmentDetails', 'shipmentDetail', 'chargeLineItems'];
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

      const fileExt = (doc.fileName || '').split('.').pop().toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'tif', 'tiff'].includes(fileExt);
      const previewElement = isImage ? 
        `<img src="/api/documents/${docId}/file" alt="Document Preview" class="w-full h-full object-contain p-2" onerror="this.src='https://placehold.co/600x800/1e293b/475569?text=No+Preview+Available'" />` :
        `<iframe src="/api/documents/${docId}/file" class="w-full h-full border-0 bg-white" title="Document Preview"></iframe>`;

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
              <h3 class="text-sm font-bold text-slate-300 border-b border-slate-800 pb-3">Original Document (${doc.fileName || 'File'})</h3>
              <div class="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 h-[600px]">
                ${previewElement}
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
            } else if (section === 'shipmentDetails' || section === 'shipmentDetail') {
              const secKey = section;
              if (!payload[secKey]) payload[secKey] = [];
              const idx = parseInt(indexStr, 10);
              if (!payload[secKey][idx]) payload[secKey][idx] = {};
              payload[secKey][idx][key] = val;
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

          // Collect nested charge fields inside shipments
          document.querySelectorAll('.nested-charge-field').forEach(input => {
            const section = input.getAttribute('data-section');
            const sIdx = parseInt(input.getAttribute('data-ship-idx'), 10);
            const cIdx = parseInt(input.getAttribute('data-charge-idx'), 10);
            const cKey = input.getAttribute('data-charge-key');
            const val = input.value;

            if (!payload[section]) payload[section] = [];
            if (!payload[section][sIdx]) payload[section][sIdx] = {};
            if (!payload[section][sIdx].chargeLineItems) payload[section][sIdx].chargeLineItems = [];
            if (!payload[section][sIdx].chargeLineItems[cIdx]) payload[section][sIdx].chargeLineItems[cIdx] = {};
            payload[section][sIdx].chargeLineItems[cIdx][cKey] = val;
          });

          return payload;
        };

        document.getElementById('saveReviewBtn').onclick = async () => {
          const payload = collectPayload();
          const btn = document.getElementById('saveReviewBtn');
          btn.innerHTML = 'Saving & Syncing...';
          btn.disabled = true;

          try {
            const r = await fetch('/api/documents/' + docId + '/review', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ editedData: payload })
            });
            const rd = await r.json();
            if (rd.success) {
              if (rd.webhookSynced) {
                btn.innerHTML = 'Saved and synced ✓';
              } else {
                btn.innerHTML = 'Saved (Sync Warning ⚠️)';
                alert('Saved to database successfully, but webhook sync failed: ' + (rd.webhookError || 'Sync warning'));
              }
              setTimeout(() => { btn.innerHTML = 'Save & Approve'; btn.disabled = false; }, 2500);
            } else {
              alert(rd.error || 'Failed to save to database');
              btn.innerHTML = 'Save & Approve';
              btn.disabled = false;
            }
          } catch(e) {
            alert('Network error saving to database');
            btn.innerHTML = 'Save & Approve';
            btn.disabled = false;
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

      let canonical = {};
      
      // Load raw data dynamically
      if (doc.extraction?.finalSubmittedData) {
        try { canonical = JSON.parse(doc.extraction.finalSubmittedData); } catch(e) {}
      } else if (doc.extraction?.canonicalJson) {
        try { canonical = JSON.parse(doc.extraction.canonicalJson); } catch(e) {}
      }

      let gridHtml = '';
      for (const [key, value] of Object.entries(canonical)) {
        let displayVal = value;
        if (typeof value === 'object') {
           try { displayVal = JSON.stringify(value); } catch(e) { displayVal = String(value); }
        }
        
        gridHtml += `
          <div class="border-b border-slate-100 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors px-4 rounded-lg">
             <span class="text-slate-400 font-bold uppercase tracking-widest text-xs w-full md:w-1/3 flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${primaryColor}"></span>
                ${key}
             </span>
             <span class="font-black text-slate-800 text-lg w-full md:w-2/3 md:text-right font-mono" style="word-break: break-word;">
                ${displayVal}
             </span>
          </div>
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
              <button onclick="window.print()" class="text-xs bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-xl font-bold transition-colors">🖨️ Print</button>
              <button onclick="window.print()" class="text-xs text-white px-5 py-2 rounded-xl font-bold shadow-lg transition-transform hover:scale-105" style="background-color: ${primaryColor}">Download PDF 📥</button>
            </div>
          </div>

          <div class="bg-white rounded-[24px] p-12 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100 relative overflow-hidden" style="font-family: 'Inter', Arial, sans-serif;">
            <div class="absolute top-0 left-0 w-full h-4" style="background-color: ${primaryColor}"></div>
            <div class="absolute top-0 right-12 w-32 h-32 rounded-b-full opacity-[0.03]" style="background-color: ${primaryColor}"></div>

            <div class="flex justify-between items-start border-b-2 border-slate-100 pb-12 mb-10">
              <div>
                <h1 class="text-4xl font-black text-slate-900 tracking-tighter mb-2 uppercase">Processed Document</h1>
                <p class="text-sm font-bold text-slate-400 tracking-widest uppercase">System Generated Record</p>
              </div>
              <div class="text-right">
                <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold shadow-lg text-2xl ml-auto mb-4" style="background-color: ${primaryColor}">📄</div>
              </div>
            </div>

            <div class="space-y-1 mb-16">
               ${gridHtml}
               ${Object.keys(canonical).length === 0 ? '<div class="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">No data available</div>' : ''}
            </div>

            <div class="mt-16 pt-8 border-t-2 border-slate-100 text-center text-xs text-slate-400 font-bold uppercase tracking-widest space-y-2">
              <p>Generated by Logistics Document Automation Engine</p>
              <p>Document ID: ${docId}</p>
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
        return HTMLResponse(content=html_code)

def run_server():
    with socketserver.TCPServer(("", PORT), LogisticsAutomationHandler) as httpd:
        print(f"Logistics Document Automation PoC Web Server running at http://localhost:{PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()

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
    try:
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
    except Exception as e:
        import traceback
        return JSONResponse({"error": str(e), "trace": traceback.format_exc()}, status_code=500)

@app.post("/api/documents/upload")
async def upload_documents(request: Request):
    form = await request.form()
    files = form.getlist('file')
    if not files:
        return JSONResponse({"error": "No files uploaded"}, status_code=400)
        
    import base64
    vercel_url = os.getenv("VERCEL_URL")
    forwarded_host = request.headers.get("x-forwarded-host")
    host = request.headers.get("host")
    
    if os.getenv("APP_BASE_URL"):
        app_base_url = os.getenv("APP_BASE_URL").rstrip("/")
    elif forwarded_host:
        app_base_url = f"https://{forwarded_host}"
    elif vercel_url:
        app_base_url = f"https://{vercel_url}"
    elif host and "localhost" not in host and "127.0.0.1" not in host:
        app_base_url = f"https://{host}"
    else:
        app_base_url = str(request.base_url).rstrip("/")
    webhook_url = os.getenv("N8N_WEBHOOK_URL", "https://n8n.provelopers.net/webhook/726784a2-239a-4a6d-a837-85828f4b2ca2")
    
    def trigger_webhook(url, data):
        req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
        try:
            urllib.request.urlopen(req, timeout=10)
        except Exception as e:
            print("Webhook error:", e)

    allowed_exts = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".csv": "text/csv",
        ".txt": "text/plain",
        ".tif": "image/tiff",
        ".tiff": "image/tiff"
    }

    results = []
    try:
        for file_item in files:
            ext = os.path.splitext(file_item.filename)[1].lower()
            if ext not in allowed_exts:
                return JSONResponse({"error": f"Unsupported file format '{ext}'. Allowed: PDF, JPG, JPEG, PNG, DOC, DOCX, XLS, XLSX, CSV, TXT, TIFF"}, status_code=400)

            file_bytes = await file_item.read()
            file_b64 = base64.b64encode(file_bytes).decode('utf-8')
            
            doc_id = str(uuid.uuid4())
            storage_path = f"api/documents/{doc_id}/file"

            raw_text = ""
            if ext in [".txt", ".csv"]:
                try: raw_text = file_bytes.decode('utf-8', errors='ignore')
                except Exception: pass
            
            payload = {
                "documentId": doc_id,
                "storagePath": storage_path,
                "fileName": file_item.filename,
                "fileBase64": file_b64,
                "rawOcrText": raw_text,
                "callbackUrl": f"{app_base_url}/api/documents/{doc_id}/extraction/callback"
            }
            
            threading.Thread(target=trigger_webhook, args=(webhook_url, payload), daemon=True).start()
            
            conn = get_db()
            execute_query(conn, "INSERT INTO Document (id, fileName, storagePath, status) VALUES (?, ?, ?, 'PREPROCESSED')", (doc_id, file_item.filename, storage_path))
            execute_query(conn, "UPDATE Document SET fileData = ? WHERE id = ?", (file_b64, doc_id))
            
            if raw_text:
                try:
                    execute_query(conn, "INSERT INTO Extraction (documentId, rawocrtext, canonicalJson, confidenceScores) VALUES (?, ?, '{}', '{}')", (doc_id, raw_text))
                except Exception:
                    try:
                        conn.rollback()
                        execute_query(conn, "INSERT INTO Extraction (documentId, rawOcrText, canonicalJson, confidenceScores) VALUES (?, ?, '{}', '{}')", (doc_id, raw_text))
                    except Exception:
                        try:
                            conn.rollback()
                            execute_query(conn, 'INSERT INTO Extraction (documentId, "rawOcrText", canonicalJson, confidenceScores) VALUES (?, ?, \'{}\', \'{}\')', (doc_id, raw_text))
                        except Exception:
                            try:
                                conn.rollback()
                                execute_query(conn, "INSERT INTO Extraction (documentId, canonicalJson, confidenceScores) VALUES (?, '{}', '{}')", (doc_id,))
                            except Exception:
                                pass
            
            conn.commit()
            conn.close()
            results.append(doc_id)
            
        return {"success": True, "documentIds": results}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/documents/{doc_id}/file")
def get_document_file(doc_id: str):
    import base64
    from fastapi.responses import Response
    conn = get_db()
    cursor = execute_query(conn, "SELECT fileData, fileName FROM Document WHERE id = ?", (doc_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not row[0]:
        return JSONResponse({"error": "File not found"}, status_code=404)
        
    file_data_b64 = row[0]
    file_name = row[1]
    
    try:
        file_bytes = base64.b64decode(file_data_b64)
        ext = os.path.splitext(file_name)[1].lower()
        
        if ext in [".tif", ".tiff"]:
            try:
                from PIL import Image
                import io
                img = Image.open(io.BytesIO(file_bytes))
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                return Response(content=buf.getvalue(), media_type="image/png")
            except Exception:
                return Response(content=file_bytes, media_type="image/tiff")
        elif ext in [".txt", ".csv"]:
            return Response(content=file_bytes, media_type="text/plain; charset=utf-8")
        elif ext == ".pdf":
            return Response(content=file_bytes, media_type="application/pdf")
        elif ext in [".jpg", ".jpeg"]:
            return Response(content=file_bytes, media_type="image/jpeg")
        elif ext == ".png":
            return Response(content=file_bytes, media_type="image/png")
        else:
            return Response(content=file_bytes, media_type="application/octet-stream")
    except Exception:
        return JSONResponse({"error": "Failed to decode file"}, status_code=500)

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

@app.post("/api/documents/{doc_id}/review")
async def save_review(doc_id: str, request: Request):
    body = await request.json()
    edited_data = body.get('editedData') or body.get('editedExtractedData')
    if not edited_data:
        return JSONResponse({"error": "Payload missing"}, status_code=400)

    json_str = json.dumps(edited_data)
    conn = get_db()
    execute_query(conn, "UPDATE Extraction SET finalSubmittedData = ? WHERE documentId = ?;", (json_str, doc_id))
    execute_query(conn, "UPDATE Document SET status = 'APPROVED' WHERE id = ?;", (doc_id,))
    conn.commit()
    conn.close()

    webhook_synced = False
    webhook_error = None
    try:
        req = urllib.request.Request(
            SAVE_APPROVED_WEBHOOK_URL,
            data=json_str.encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            if res.status in (200, 201, 204):
                webhook_synced = True
            else:
                webhook_error = f"Status {res.status}"
    except Exception as e:
        webhook_error = str(e)
        print(f"Server-side webhook sync warning for doc {doc_id}: {e}")

    return {
        "success": True,
        "documentId": doc_id,
        "webhookSynced": webhook_synced,
        "webhookError": webhook_error
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
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"Invalid JSON body: {e}"}, status_code=400)

    extracted = body.get('extractedData') or body.get('canonicalJson')

    if not extracted:
        return JSONResponse({"error": "Missing extracted payload", "received_keys": list(body.keys())}, status_code=400)

    json_str = json.dumps(extracted)
    conn = None
    try:
        conn = get_db()

        # Check if Extraction row exists for this document
        cursor = execute_query(conn, "SELECT 1 FROM Extraction WHERE documentId=?", (doc_id,))
        if cursor.fetchone():
            execute_query(conn, "UPDATE Extraction SET canonicalJson = ? WHERE documentId = ?;", (json_str, doc_id))
        else:
            execute_query(conn, "INSERT INTO Extraction (documentId, canonicalJson) VALUES (?, ?);", (doc_id, json_str))

        execute_query(conn, "UPDATE Document SET status = 'EXTRACTED' WHERE id = ?;", (doc_id,))
        conn.commit()

        return {"success": True, "reviewUrl": f"/documents/{doc_id}/review"}

    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        import traceback
        return JSONResponse({"error": str(e), "trace": traceback.format_exc()}, status_code=500)
    finally:
        if conn:
            conn.close()

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

@app.get("/")
def serve_spa_root():
    return _send_spa_html("/")

@app.get("/{path:path}")
def serve_spa(path: str):
    return _send_spa_html("/" + path)

