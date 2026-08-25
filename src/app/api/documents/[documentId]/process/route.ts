import { NextRequest, NextResponse } from 'next/server';
import { triggerProcessingChain } from '@/lib/n8n';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      return NextResponse.json({ error: `Document ${documentId} not found` }, { status: 404 });
    }

    const result = await triggerProcessingChain(documentId);

    const updatedDoc = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        extraction: true,
        workflowRuns: true,
      },
    });

    return NextResponse.json({
      success: true,
      document: updatedDoc,
      canonical: result.canonical,
      confidenceScores: result.confidences,
    });
  } catch (error: any) {
    console.error('Processing API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
