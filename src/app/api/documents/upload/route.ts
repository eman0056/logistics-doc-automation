import { NextRequest, NextResponse } from 'next/server';
import { storageDriver } from '@/lib/storage';
import { prisma } from '@/lib/db';
import { preprocessDocument } from '@/lib/preprocess';
import { triggerProcessingChain } from '@/lib/n8n';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.provelopers.net/webhook/726784a2-239a-4a6d-a837-85828f4b2ca2';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const customerId = (formData.get('customerId') as string) || undefined;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 25MB limit' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Unsupported file type ${file.type}. Allowed: PDF, JPG, PNG` }, { status: 400 });
    }

    // Resolve customer ID
    let targetCustomerId = customerId;
    if (!targetCustomerId) {
      const defaultCust = await prisma.customer.findFirst();
      if (!defaultCust) {
        return NextResponse.json({ error: 'No customer account found' }, { status: 500 });
      }
      targetCustomerId = defaultCust.id;
    }

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Initial heuristic document type
    const nameUpper = file.name.toUpperCase();
    let docType = 'UNKNOWN';
    if (nameUpper.includes('BOL') || nameUpper.includes('BILL')) docType = 'BOL';
    else if (nameUpper.includes('POD') || nameUpper.includes('DELIVERY')) docType = 'POD';
    else if (nameUpper.includes('INV') || nameUpper.includes('DHL')) docType = 'INVOICE';
    else if (nameUpper.includes('RATE') || nameUpper.includes('CONF')) docType = 'RATE_CONFIRMATION';

    // Create initial Document DB record
    const document = await prisma.document.create({
      data: {
        customerId: targetCustomerId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storagePath: '',
        documentType: docType,
        status: 'INGESTED',
      },
    });

    // Save to local object storage
    const storagePath = await storageDriver.saveFile(targetCustomerId, document.id, file.name, buffer);

    // Update document with storagePath
    await prisma.document.update({
      where: { id: document.id },
      data: { storagePath },
    });

    // Write audit log for upload
    await prisma.auditLog.create({
      data: {
        documentId: document.id,
        action: 'DOCUMENT_UPLOADED',
        description: `File '${file.name}' uploaded successfully to object storage.`,
        metadataJson: JSON.stringify({ fileSize: file.size, mimeType: file.type }),
      },
    });

    // Preprocessing Step
    const preprocessResult = await preprocessDocument(document.id);

    // Automatically trigger n8n webhook
    const n8nPayload = {
      documentId: document.id,
      storagePath,
      fileName: file.name,
      documentType: docType,
      callbackUrl: `${APP_BASE_URL}/api/documents/${document.id}/extraction/callback`,
    };

    let n8nResponse = null;
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nPayload),
      });
      if (res.ok) {
        n8nResponse = await res.json().catch(() => ({ status: 'triggered' }));
      }
    } catch (n8nErr) {
      console.warn('n8n webhook call warning (falling back to processing chain engine):', n8nErr);
    }

    // Trigger background extraction processing chain
    triggerProcessingChain(document.id).catch((err) => {
      console.error('Background processing error:', err);
    });

    return NextResponse.json({
      success: true,
      uploadSuccess: true,
      documentId: document.id,
      document: {
        id: document.id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        documentType: docType,
        status: preprocessResult.status,
        storagePath,
        pageCount: preprocessResult.pageCount,
        scanQuality: preprocessResult.scanQuality,
      },
      n8nResponse,
    });
  } catch (error: any) {
    console.error('Upload API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
