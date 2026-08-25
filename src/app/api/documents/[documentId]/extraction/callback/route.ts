import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;
    
    // Parse incoming payload from n8n webhook
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: 'Invalid JSON payload received from webhook' }, { status: 400 });
    }

    const { extractedData, canonicalJson, confidenceScores } = body;
    const dataToSave = extractedData || canonicalJson;

    if (!dataToSave) {
      return NextResponse.json({ error: 'Missing extractedData or canonicalJson in payload' }, { status: 400 });
    }

    const jsonStr = typeof dataToSave === 'string' ? dataToSave : JSON.stringify(dataToSave);
    const confStr = typeof confidenceScores === 'string' ? confidenceScores : JSON.stringify(confidenceScores || {});

    // 1. Verify document exists
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      return NextResponse.json({ error: `Document with ID ${documentId} not found` }, { status: 404 });
    }

    // 2. Store extractedData in Extraction table
    await prisma.extraction.upsert({
      where: { documentId },
      update: {
        rawOcrText: body.rawOcrText || body.rawText || '',
        canonicalJson: jsonStr,
        confidenceScores: confStr,
      },
      create: {
        documentId,
        rawOcrText: body.rawOcrText || body.rawText || '',
        canonicalJson: jsonStr,
        confidenceScores: confStr,
      },
    });

    // 3. Update Document status to EXTRACTED
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'EXTRACTED',
        overallConfidence: body.overallConfidence || 0.94,
      },
    });

    // 4. Create WorkflowRun record for n8n callback
    await prisma.workflowRun.create({
      data: {
        documentId,
        workflowName: 'Document_Processing_Full',
        stepName: 'N8N_WEBHOOK_CALLBACK_RECEIVED',
        status: 'SUCCESS',
        completedAt: new Date(),
      },
    });

    // 5. Create AuditLog entry
    await prisma.auditLog.create({
      data: {
        documentId,
        action: 'AI_EXTRACTED',
        description: 'n8n workflow callback received successfully. Canonical data stored in Extraction table.',
        metadataJson: JSON.stringify({ callbackReceivedAt: new Date() }),
      },
    });

    return NextResponse.json({
      success: true,
      documentId,
      status: 'EXTRACTED',
      reviewUrl: `/documents/${documentId}/review`,
    });
  } catch (error: any) {
    console.error('Callback API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
