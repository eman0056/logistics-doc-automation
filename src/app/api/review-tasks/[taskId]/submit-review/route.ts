import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateCanonicalData } from '@/lib/validation';

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params;
    const body = await req.json();
    const { action, corrections } = body; // action: 'APPROVED' | 'REJECTED' | 'FLAGGED'

    const task = await prisma.reviewTask.findUnique({
      where: { id: taskId },
      include: { document: { include: { extraction: true } } },
    });

    if (!task || !task.document) {
      return NextResponse.json({ error: 'Review task not found' }, { status: 404 });
    }

    const documentId = task.documentId;

    if (action === 'REJECTED') {
      await prisma.reviewTask.update({
        where: { id: taskId },
        data: {
          status: 'REJECTED',
          correctionsJson: JSON.stringify(corrections || {}),
          resolvedAt: new Date(),
        },
      });

      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'REJECTED' },
      });

      await prisma.auditLog.create({
        data: {
          documentId,
          action: 'REVIEW_REJECTED',
          description: `Review task rejected by human reviewer. Reason: ${task.reason}`,
        },
      });

      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    // Apply Corrections to Canonical JSON in Extraction record
    if (corrections && task.document.extraction) {
      const currentCanonical = JSON.parse(task.document.extraction.canonicalJson || '{}');
      const updatedCanonical = { ...currentCanonical, ...corrections };

      // Re-run validation on corrected data
      const validationResult = await validateCanonicalData(updatedCanonical);

      await prisma.extraction.update({
        where: { documentId },
        data: {
          canonicalJson: JSON.stringify(updatedCanonical),
        },
      });

      // Update ReviewTask & Document Status
      await prisma.reviewTask.update({
        where: { id: taskId },
        data: {
          status: 'RESOLVED',
          correctionsJson: JSON.stringify(corrections),
          resolvedAt: new Date(),
        },
      });

      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'APPROVED',
          overallConfidence: 1.0, // Human verified
        },
      });

      await prisma.auditLog.create({
        data: {
          documentId,
          action: 'FIELD_CORRECTED_AND_APPROVED',
          description: `Reviewer corrected fields (${Object.keys(corrections).join(', ')}) and approved document.`,
          metadataJson: JSON.stringify({ corrections }),
        },
      });

      return NextResponse.json({
        success: true,
        status: 'APPROVED',
        validation: validationResult,
      });
    }

    return NextResponse.json({ error: 'No corrections provided' }, { status: 400 });
  } catch (error: any) {
    console.error('Submit Review API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
