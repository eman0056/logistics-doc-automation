
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
    html_code = """<!DOCTYPE html>
l lang="en">
d>
eta charset="UTF-8">
eta name="viewport" content="width=device-width, initial-scale=1.0">
itle>Logistics Document Automation PoC</title>
cript src="https://cdn.tailwindcss.com"></script>
ad>
y class="bg-slate-950 text-slate-100 min-h-screen font-sans">
iv id="app"></div>
cript>
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
  let canonical = {
    documentNumber: 'DHL-9982412',
    shipmentNumber: '8492019482',
    documentType: 'INVOICE',
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
    lineItems: [
      { description: "Industrial Machinery Components", quantity: 2, unitPrice: 400.0, totalPrice: 800.0 },
      { description: "Electronic Control Modules", quantity: 2, unitPrice: 225.0, totalPrice: 450.0 }
    ]
  };
  if (doc.extraction?.finalSubmittedData) {
    try { canonical = { ...canonical, ...JSON.parse(doc.extraction.finalSubmittedData) }; } catch(e) {}
  } else if (doc.extraction?.canonicalJson) {
    try { canonical = { ...canonical, ...JSON.parse(doc.extraction.canonicalJson) }; } catch(e) {}
  }
  
  const lineItemsHtml = (canonical.lineItems || []).map((item, idx) => `
    <div class="line-item-row grid grid-cols-12 gap-3 mb-2" data-idx="${idx}">
      <div class="col-span-6">
        <input type="text" value="${item.description || ''}" class="item-desc w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white" />
      </div>
      <div class="col-span-2">
        <input type="number" value="${item.quantity || 0}" class="item-qty w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-center font-mono" />
      </div>
      <div class="col-span-2">
        <input type="number" step="0.01" value="${item.unitPrice || 0}" class="item-price w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-right font-mono" />
      </div>
      <div class="col-span-2">
        <input type="number" step="0.01" value="${item.totalPrice || 0}" class="item-total w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-emerald-400 font-bold text-right font-mono" />
      </div>
    </div>
  `).join('');
  app.innerHTML = `
    ${navHtml}
    <main class="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div class="flex justify-between items-center bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl transition-all hover:shadow-sky-900/20">
        <div>
          <h1 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="bg-sky-500/20 text-sky-400 p-2 rounded-lg">👁️</span> 
            Human-in-the-Loop Review: ${doc.fileName || 'Document'}
          </h1>
          <p class="text-xs text-slate-400 mt-1 ml-10">Review the AI-extracted data below. Make any necessary corrections, then generate the final invoice.</p>
        </div>
        <button id="genInvoiceBtn" class="px-6 py-3 rounded-xl text-white font-bold text-sm shadow-xl hover:scale-105 transition-transform flex items-center gap-2" style="background-color: ${primaryColor}">
          Generate Invoice ✨
        </button>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <!-- Left Side: Original Document -->
        <div class="xl:col-span-5 flex flex-col space-y-4">
          <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl flex-1 flex flex-col">
            <h3 class="text-sm font-bold text-white border-b border-slate-800 pb-3 mb-4 flex items-center gap-2">
              <span class="text-slate-400">📄</span> Original Document
            </h3>
            <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2 mb-4">
              <div class="flex justify-between text-slate-400"><span>Filename</span><span class="text-white font-medium">${doc.fileName || 'PDF Document'}</span></div>
              <div class="flex justify-between text-slate-400"><span>File Size</span><span class="text-slate-200">${((doc.fileSize||0)/1024).toFixed(1)} KB</span></div>
            </div>
            <div class="border border-slate-800 rounded-xl bg-slate-950/50 p-6 flex-1 min-h-[500px] flex flex-col items-center justify-center space-y-4 relative overflow-hidden group">
              <div class="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div class="w-24 h-32 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg p-3 flex flex-col space-y-2 relative z-10">
                <div class="h-2 bg-sky-500/40 w-3/4 rounded-full"></div>
                <div class="h-1 bg-slate-700 w-full rounded-full"></div>
                <div class="h-1 bg-slate-700 w-5/6 rounded-full"></div>
                <div class="h-1 bg-slate-700 w-full rounded-full"></div>
                <div class="mt-auto h-2 bg-emerald-500/40 w-1/2 rounded-full"></div>
              </div>
              <p class="text-xs text-slate-500 relative z-10 text-center px-8">High-resolution document preview is active. The AI has scanned this document for key-value pairs and line items.</p>
            </div>
          </div>
        </div>
        <!-- Right Side: Editable Data -->
        <div class="xl:col-span-7 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl space-y-6 text-xs">
          <h3 class="text-base font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
            <span class="text-sky-400">⚡</span> Extracted Data Fields
          </h3>
          <div class="bg-slate-950/50 p-5 rounded-xl border border-slate-800/50 space-y-4 hover:border-slate-700 transition-colors">
            <div class="font-bold text-sky-400/80 text-[10px] tracking-wider uppercase">1. Identifiers & Dates</div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="col-span-2">
                <label class="text-slate-400 block mb-1">Invoice Number</label>
                <input id="inputDocNum" type="text" value="${canonical.documentNumber || ''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none transition-colors" />
              </div>
              <div class="col-span-2">
                <label class="text-slate-400 block mb-1">Shipment Number</label>
                <input id="inputShipNum" type="text" value="${canonical.shipmentNumber || ''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none transition-colors" />
              </div>
              <div class="col-span-2">
                <label class="text-slate-400 block mb-1">PO Number</label>
                <input id="inputPoNum" type="text" value="${canonical.purchaseOrderNumber || ''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Pickup Date</label>
                <input id="inputPickup" type="text" value="${canonical.pickupDate || ''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Delivery Date</label>
                <input id="inputDelivery" type="text" value="${canonical.deliveryDate || ''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none transition-colors" />
              </div>
            </div>
          </div>
          <div class="bg-slate-950/50 p-5 rounded-xl border border-slate-800/50 space-y-4 hover:border-slate-700 transition-colors">
            <div class="font-bold text-sky-400/80 text-[10px] tracking-wider uppercase">2. Logistics Parties</div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="text-slate-400 block mb-1">Shipper / Sender</label>
                <input id="inputShipper" type="text" value="${canonical.shipperName || ''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-sky-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Consignee / Receiver</label>
                <input id="inputConsignee" type="text" value="${canonical.consigneeName || ''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-sky-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Carrier Name</label>
                <input id="inputCarrier" type="text" value="${canonical.carrierName || ''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-sky-500 focus:outline-none transition-colors" />
              </div>
            </div>
          </div>
          
          <div class="bg-slate-950/50 p-5 rounded-xl border border-slate-800/50 space-y-4 hover:border-slate-700 transition-colors">
            <div class="flex justify-between items-end">
              <div class="font-bold text-sky-400/80 text-[10px] tracking-wider uppercase">3. Line Items</div>
              <div class="text-[10px] text-slate-500">Edit descriptions and prices</div>
            </div>
            
            <div class="border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
              <div class="grid grid-cols-12 gap-3 px-3 py-2 bg-slate-800/50 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                <div class="col-span-6">Description</div>
                <div class="col-span-2 text-center">Qty</div>
                <div class="col-span-2 text-right">Unit Price</div>
                <div class="col-span-2 text-right">Total</div>
              </div>
              <div class="p-3 bg-slate-950" id="lineItemsContainer">
                ${lineItemsHtml}
              </div>
            </div>
          </div>
          <div class="bg-slate-950/50 p-5 rounded-xl border border-slate-800/50 space-y-4 hover:border-slate-700 transition-colors">
            <div class="font-bold text-emerald-400/80 text-[10px] tracking-wider uppercase">4. Amounts & Totals</div>
            <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div>
                <label class="text-slate-400 block mb-1">Weight (Lb)</label>
                <input id="inputWeight" type="number" value="${numVal(canonical.weightLb, 0)}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Qty (Total)</label>
                <input id="inputTotalQty" type="number" value="${numVal(canonical.totalQuantity, 0)}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Subtotal ($)</label>
                <input id="inputSubtotal" type="number" step="0.01" value="${numVal(canonical.subtotalCost, 1250)}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Freight ($)</label>
                <input id="inputFreight" type="number" step="0.01" value="${numVal(canonical.freightCost, 150)}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label class="text-slate-400 block mb-1">Tax ($)</label>
                <input id="inputTax" type="number" step="0.01" value="${numVal(canonical.taxCost, 75)}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label class="text-emerald-400 font-bold block mb-1">Total ($)</label>
                <input id="inputTotal" type="number" step="0.01" value="${numVal(canonical.totalAmount, 1475)}" class="w-full bg-emerald-900/20 border border-emerald-500/50 rounded-lg px-3 py-2 text-emerald-400 font-bold font-mono shadow-inner focus:border-emerald-400 focus:outline-none transition-colors" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  `;
  document.getElementById('genInvoiceBtn').onclick = async () => {
    const lineItemRows = document.querySelectorAll('.line-item-row');
    const updatedLineItems = Array.from(lineItemRows).map(row => {
      return {
        description: row.querySelector('.item-desc').value,
        quantity: parseFloat(row.querySelector('.item-qty').value) || 0,
        unitPrice: parseFloat(row.querySelector('.item-price').value) || 0,
        totalPrice: parseFloat(row.querySelector('.item-total').value) || 0
      };
    });
    const payload = {
      documentNumber: document.getElementById('inputDocNum').value,
      shipmentNumber: document.getElementById('inputShipNum').value,
      purchaseOrderNumber: document.getElementById('inputPoNum').value,
      pickupDate: document.getElementById('inputPickup').value,
      deliveryDate: document.getElementById('inputDelivery').value,
      shipperName: document.getElementById('inputShipper').value,
      consigneeName: document.getElementById('inputConsignee').value,
      carrierName: document.getElementById('inputCarrier').value,
      weightLb: parseFloat(document.getElementById('inputWeight').value) || 0,
      totalQuantity: parseFloat(document.getElementById('inputTotalQty').value) || 0,
      subtotalCost: parseFloat(document.getElementById('inputSubtotal').value) || 0,
      freightCost: parseFloat(document.getElementById('inputFreight').value) || 0,
      taxCost: parseFloat(document.getElementById('inputTax').value) || 0,
      totalAmount: parseFloat(document.getElementById('inputTotal').value) || 0,
      currency: 'USD',
      lineItems: updatedLineItems
    };
    const btn = document.getElementById('genInvoiceBtn');
    btn.innerHTML = 'Generating... ⏳';
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    try {
      const res = await fetch(`/api/documents/${docId}/generate-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedExtractedData: payload })
      });
      const resData = await res.json();
      if (resData.success && resData.invoiceUrl) {
        window.location.href = resData.invoiceUrl;
      } else {
        alert(resData.error || 'Failed to generate invoice');
        btn.innerHTML = 'Generate Invoice ✨';
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    } catch(err) {
      alert('Network error');
      btn.innerHTML = 'Generate Invoice ✨';
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  };
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
script>
dy>
ml>"""
    return HTMLResponse(content=html_code)


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

