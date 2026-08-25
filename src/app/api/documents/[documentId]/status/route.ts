import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        extraction: true,
        workflowRuns: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!doc) {
      return NextResponse.json({ error: `Document ${documentId} not found` }, { status: 404 });
    }

    const isExtracted = doc.status === 'EXTRACTED' || doc.status === 'IN_REVIEW' || doc.status === 'APPROVED' || doc.status === 'INVOICE_GENERATED';

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      fileName: doc.fileName,
      status: doc.status,
      isExtracted,
      overallConfidence: doc.overallConfidence,
      reviewUrl: `/documents/${doc.id}/review`,
      hasExtraction: !!doc.extraction?.canonicalJson,
      workflowRuns: doc.workflowRuns,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
