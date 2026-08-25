import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;
    const body = await req.json();
    const { canonicalJson, confidenceScores } = body;

    const jsonStr = typeof canonicalJson === 'string' ? canonicalJson : JSON.stringify(canonicalJson || {});
    const confStr = typeof confidenceScores === 'string' ? confidenceScores : JSON.stringify(confidenceScores || {});

    await prisma.extraction.upsert({
      where: { documentId },
      update: {
        canonicalJson: jsonStr,
        confidenceScores: confStr,
      },
      create: {
        documentId,
        rawOcrText: '',
        canonicalJson: jsonStr,
        confidenceScores: confStr,
      },
    });

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'EXTRACTED' },
    });

    await prisma.workflowRun.create({
      data: {
        documentId,
        workflowName: 'Document_AI_Extraction',
        stepName: 'WEBHOOK_CALLBACK_RECEIVED',
        status: 'SUCCESS',
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, documentId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
