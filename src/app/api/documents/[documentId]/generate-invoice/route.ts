import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;
    const body = await req.json();
    const { editedExtractedData, finalData } = body;

    const submittedPayload = editedExtractedData || finalData;

    if (!submittedPayload) {
      return NextResponse.json({ error: 'Extracted data payload is required' }, { status: 400 });
    }

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { extraction: true },
    });

    if (!doc) {
      return NextResponse.json({ error: `Document ${documentId} not found` }, { status: 404 });
    }

    const jsonStr = typeof submittedPayload === 'string' ? submittedPayload : JSON.stringify(submittedPayload);

    // 1. Update Extraction record with finalSubmittedData
    await prisma.extraction.upsert({
      where: { documentId },
      update: {
        finalSubmittedData: jsonStr,
      },
      create: {
        documentId,
        rawOcrText: '',
        canonicalJson: jsonStr,
        confidenceScores: JSON.stringify({}),
        finalSubmittedData: jsonStr,
      },
    });

    // 2. Update Document record status & invoiceGeneratedAt
    const now = new Date();
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'INVOICE_GENERATED',
        invoiceGeneratedAt: now,
      },
    });

    // 3. Create AuditLog entry
    await prisma.auditLog.create({
      data: {
        documentId,
        action: 'INVOICE_GENERATED',
        description: `Professional invoice generated for Document #${documentId.substring(0, 8)}.`,
        metadataJson: JSON.stringify({ generatedAt: now.isoformat ? now.isoformat() : now }),
      },
    });

    return NextResponse.json({
      success: true,
      documentId,
      invoiceUrl: `/invoices/${documentId}`,
      generatedAt: now,
    });
  } catch (error: any) {
    console.error('Invoice Generation Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
