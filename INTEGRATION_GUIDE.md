# Integration Guide — n8n & Node.js Logistics Document Automation Engine

This document provides step-by-step instructions for configuring, importing, and testing the end-to-end n8n workflow orchestration engine paired with the Node.js backend.

---

## 1. System Flow Architecture

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Next.js UI (/documents/upload)
    participant Backend as Node.js API (/api/documents/upload)
    participant Storage as Object Storage (/storage)
    participant n8n as n8n Engine (n8n.provelopers.net)
    participant OpenAI as OpenAI GPT-4o API
    participant Callback as Node.js Callback API (/api/.../callback)
    participant Database as SQLite / Prisma DB

    User->>Frontend: Upload Document (PDF / Image)
    Frontend->>Backend: POST /api/documents/upload (multipart form)
    Backend->>Storage: Save file to /storage/{customerId}/{documentId}/filename
    Backend->>Database: Create Document record (status = INGESTED)
    Backend->>n8n: POST N8N_WEBHOOK_URL (documentId, storagePath, callbackUrl)
    Backend-->>Frontend: Return { success: true, documentId }
    
    Frontend->>Backend: Poll /api/documents/{documentId}/status
    
    n8n->>Storage: Read file binary / text stream
    n8n->>OpenAI: POST /v1/chat/completions (structured canonical JSON prompt)
    OpenAI-->>n8n: Return parsed canonical logistics fields & confidences
    
    n8n->>Callback: POST /api/documents/{documentId}/extraction/callback
    Callback->>Database: Save canonicalJson & confidences in Extraction table
    Callback->>Database: Update Document status = EXTRACTED
    Callback-->>n8n: Return { success: true, reviewUrl }
    
    Backend-->>Frontend: Status response: status = EXTRACTED
    Frontend->>User: Auto-redirect to /documents/{documentId}/review
```

---

## 2. Environment Setup (`.env.local`)

Copy `.env.example` to `.env.local` and set your API credentials:

```bash
# Database Configuration
DATABASE_URL="file:./dev.db"

# Server Base URL
NODE_ENV="development"
PORT="3000"
APP_BASE_URL="http://localhost:3000"
NEXTAUTH_SECRET="logistics-doc-automation-secret-key-2026"

# OpenAI API Key (used by n8n workflow node 4)
OPENAI_API_KEY="sk-proj-YOUR_ACTUAL_OPENAI_API_KEY_HERE"

# n8n Automation Engine Webhook Configuration
N8N_WEBHOOK_URL="https://n8n.provelopers.net/webhook/726784a2-239a-4a6d-a837-85828f4b2ca2"
N8N_TEST_WEBHOOK_URL="https://n8n.provelopers.net/webhook-test/726784a2-239a-4a6d-a837-85828f4b2ca2"
```

---

## 3. n8n Workflow Import Instructions

Follow these steps to import the full document processing workflow into your n8n UI:

1. Open your n8n dashboard in your browser (e.g. `https://n8n.provelopers.net`).
2. Navigate to **Workflows** → click **Import from File**.
3. Select the workflow JSON file located at:
   `n8n/workflows/Document_Processing_Full.json`
4. Set up OpenAI Credentials:
   - In Node 4 (`Node 4: OpenAI API Extraction`), select your OpenAI Credential or set `OPENAI_API_KEY` in n8n environment variables.
5. Save the workflow and click **Active** to activate production webhooks.

### Workflow Nodes Overview
- **Node 1 (Webhook Trigger)**: Listens for file intake webhooks containing `{ documentId, storagePath, fileName, callbackUrl }`.
- **Node 2 (File Reader)**: Downloads file content from storage endpoint.
- **Node 3 (OCR Text Extractor)**: Extracts text fragments from PDF streams.
- **Node 4 (OpenAI Extraction Node)**: Sends prompt to OpenAI API requesting canonical logistics schema (`shipmentNumber`, `documentNumber`, `shipperName`, `consigneeName`, `carrierName`, `pickupDate`, `deliveryDate`, `totalAmount`, `lineItems`).
- **Node 5 (Response Formatter)**: Formats response and computes confidence scores (0.0 to 1.0).
- **Node 6 (Node.js Callback)**: Sends `POST` request back to Node.js backend callback endpoint:
  `http://localhost:3000/api/documents/{documentId}/extraction/callback`.

---

## 4. Verification & Testing

### Option A: Run Automated End-to-End Verification Script
Run the automated verification script in your workspace:

```bash
python3 scripts/verify_full_integration.py
```

Expected Output:
```
==========================================================
VERIFY FULL INTEGRATION — n8n & NODE.JS CALLBACK PIPELINE
==========================================================
Intake Test Sample Document: /home/provelopers/Downloads/DHL-Express-invoice-sample.pdf
✓ Step 1: Document uploaded to object storage with ID: ...
✓ Step 2: n8n Webhook Payload Constructed
✓ Step 3: Simulating n8n POST Webhook Callback to Node.js backend...
✓ Step 4: Extraction table verified with canonical JSON data
✓ Step 5: Document status verified = 'EXTRACTED'
✓ Step 6: AuditLog entry verified
==========================================================
✓ Complete n8n integration working!
==========================================================
```

### Option B: Interactive UI Verification
1. Start the Next.js app (`npm run dev`).
2. Open `http://localhost:3000/documents/upload`.
3. Drag and drop any PDF or image logistics document.
4. The uploader automatically invokes the n8n webhook and polls status.
5. As soon as the webhook callback completes (`status = EXTRACTED`), you will be automatically redirected to `/documents/{documentId}/review` to view & edit fields before generating the final invoice.
