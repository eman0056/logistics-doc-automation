import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;
    const body = await req.json();
    const { rawOcrText, pageCount } = body;

    if (!rawOcrText) {
      return NextResponse.json({ error: 'rawOcrText is required' }, { status: 400 });
    }

    await prisma.extraction.upsert({
      where: { documentId },
      update: { rawOcrText },
      create: {
        documentId,
        rawOcrText,
        canonicalJson: JSON.stringify({}),
        confidenceScores: JSON.stringify({}),
      },
    });

    await prisma.workflowRun.create({
      data: {
        documentId,
        workflowName: 'Document_OCR_Extraction',
        stepName: 'WEBHOOK_CALLBACK_RECEIVED',
        status: 'SUCCESS',
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, documentId, rawOcrLength: rawOcrText.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
