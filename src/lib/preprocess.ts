import { prisma } from './db';

export interface PreprocessResult {
  documentId: string;
  pageCount: number;
  scanQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  detectedMime: string;
  status: string;
}

export async function preprocessDocument(documentId: string): Promise<PreprocessResult> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc) {
    throw new Error(`Document with ID ${documentId} not found`);
  }

  // Create workflow run record
  const workflow = await prisma.workflowRun.create({
    data: {
      documentId,
      workflowName: 'PREPROCESSING',
      stepName: 'QUALITY_AND_LAYOUT_ANALYSIS',
      status: 'RUNNING',
    },
  });

  // Simple heuristic preprocessing:
  // Detect page count (estimate 1 page for images, 1-3 for PDF)
  let pageCount = 1;
  if (doc.mimeType === 'application/pdf') {
    pageCount = Math.max(1, Math.ceil(doc.fileSize / 150000));
  }

  // Scan quality rating check
  let scanQuality: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  if (doc.fileSize < 10000) {
    scanQuality = 'LOW';
  } else if (doc.fileSize < 50000) {
    scanQuality = 'MEDIUM';
  }

  // Update document record to PREPROCESSED
  const updatedDoc = await prisma.document.update({
    where: { id: documentId },
    data: {
      status: 'PREPROCESSED',
    },
  });

  // Mark workflow run as completed
  await prisma.workflowRun.update({
    where: { id: workflow.id },
    data: {
      status: 'SUCCESS',
      completedAt: new Date(),
    },
  });

  // Write audit log entry
  await prisma.auditLog.create({
    data: {
      documentId,
      action: 'PREPROCESSED',
      description: `Document preprocessed: ${pageCount} page(s) detected, scan quality ${scanQuality}.`,
      metadataJson: JSON.stringify({ pageCount, scanQuality, mimeType: doc.mimeType }),
    },
  });

  return {
    documentId,
    pageCount,
    scanQuality,
    detectedMime: doc.mimeType,
    status: updatedDoc.status,
  };
}
