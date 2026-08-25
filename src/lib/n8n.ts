import { prisma } from './db';
import { extractOcrText } from './ocr';
import { parseLogisticsWithAi } from './ai_extraction';
import { validateCanonicalData } from './validation';
import { routeDocument } from './routing';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.provelopers.net/webhook/726784a2-239a-4a6d-a837-85828f4b2ca2';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

export interface WorkflowTriggerResult {
  workflowRunId: string;
  status: string;
  n8nExecutionId?: string;
}

export async function triggerOcrWorkflow(
  documentId: string,
  storageFilePath: string,
  documentType: string
): Promise<WorkflowTriggerResult> {
  const workflowRun = await prisma.workflowRun.create({
    data: {
      documentId,
      workflowName: 'Document_OCR_Extraction',
      stepName: 'OCR_TEXT_PARSING',
      status: 'RUNNING',
    },
  });

  const payload = {
    documentId,
    storageFilePath,
    documentType,
    workflowRunId: workflowRun.id,
    webhookCallbackUrl: `${APP_BASE_URL}/api/documents/${documentId}/extraction/raw-text`,
  };

  try {
    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch (_) {}

  // Execute text extraction
  const ocrResult = await extractOcrText(storageFilePath);

  // Store in Extraction table
  await prisma.extraction.upsert({
    where: { documentId },
    update: {
      rawOcrText: ocrResult.rawOcrText,
    },
    create: {
      documentId,
      rawOcrText: ocrResult.rawOcrText,
      canonicalJson: JSON.stringify({}),
      confidenceScores: JSON.stringify({}),
    },
  });

  await prisma.workflowRun.update({
    where: { id: workflowRun.id },
    data: {
      status: 'SUCCESS',
      completedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      documentId,
      action: 'OCR_COMPLETED',
      description: `OCR text extraction complete (${ocrResult.rawOcrText.length} chars).`,
    },
  });

  return {
    workflowRunId: workflowRun.id,
    status: 'SUCCESS',
  };
}

export async function triggerAiExtractionWorkflow(
  documentId: string,
  rawOcrText: string,
  documentType: string
): Promise<WorkflowTriggerResult> {
  const workflowRun = await prisma.workflowRun.create({
    data: {
      documentId,
      workflowName: 'Document_AI_Extraction',
      stepName: 'CLAUDE_LOGISTICS_PARSING',
      status: 'RUNNING',
    },
  });

  const payload = {
    documentId,
    rawOcrText,
    documentType,
    workflowRunId: workflowRun.id,
    webhookCallbackUrl: `${APP_BASE_URL}/api/documents/${documentId}/extraction/canonical`,
  };

  try {
    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch (_) {}

  // Run AI structured extraction
  const aiResult = await parseLogisticsWithAi(rawOcrText, documentType);

  // Save to Extraction table
  await prisma.extraction.upsert({
    where: { documentId },
    update: {
      canonicalJson: JSON.stringify(aiResult.canonicalData),
      confidenceScores: JSON.stringify(aiResult.fieldConfidences),
    },
    create: {
      documentId,
      rawOcrText,
      canonicalJson: JSON.stringify(aiResult.canonicalData),
      confidenceScores: JSON.stringify(aiResult.fieldConfidences),
    },
  });

  // Update Document record status & overall confidence
  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: 'EXTRACTED',
      overallConfidence: aiResult.overallConfidence,
      documentType: aiResult.canonicalData.documentType,
    },
  });

  await prisma.workflowRun.update({
    where: { id: workflowRun.id },
    data: {
      status: 'SUCCESS',
      completedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      documentId,
      action: 'AI_EXTRACTED',
      description: `Claude AI canonical extraction complete with ${Math.round(aiResult.overallConfidence * 100)}% confidence.`,
      metadataJson: JSON.stringify({ overallConfidence: aiResult.overallConfidence }),
    },
  });

  return {
    workflowRunId: workflowRun.id,
    status: 'SUCCESS',
  };
}

export async function triggerProcessingChain(documentId: string): Promise<{ success: boolean; canonical: any; confidences: any; routing?: any }> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc) throw new Error(`Document ID ${documentId} not found`);

  // Step 1: OCR Workflow
  await triggerOcrWorkflow(documentId, doc.storagePath, doc.documentType);

  const extraction = await prisma.extraction.findUnique({
    where: { documentId },
  });

  const rawText = extraction?.rawOcrText || '';

  // Step 2: AI Extraction Workflow
  await triggerAiExtractionWorkflow(documentId, rawText, doc.documentType);

  const finalExtraction = await prisma.extraction.findUnique({
    where: { documentId },
  });

  const canonical = finalExtraction?.canonicalJson ? JSON.parse(finalExtraction.canonicalJson) : {};
  const confidences = finalExtraction?.confidenceScores ? JSON.parse(finalExtraction.confidenceScores) : {};

  // Step 3: Run Validation & Routing Engine (Phase 4 Auto-Wiring)
  const validationResult = await validateCanonicalData(canonical, confidences);
  const routing = await routeDocument(documentId, validationResult, doc.overallConfidence || 0.90);

  return {
    success: true,
    canonical,
    confidences,
    routing,
  };
}
