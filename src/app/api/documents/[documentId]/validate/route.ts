import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateCanonicalData } from '@/lib/validation';
import { routeDocument } from '@/lib/routing';

export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { extraction: true, customer: { include: { integrations: true } } },
    });

    if (!doc || !doc.extraction) {
      return NextResponse.json({ error: 'Document or extraction data not found' }, { status: 404 });
    }

    const canonicalData = JSON.parse(doc.extraction.canonicalJson || '{}');
    const fieldConfidences = JSON.parse(doc.extraction.confidenceScores || '{}');

    // Get customer integration field map business rules
    const integration = doc.customer.integrations[0];
    const customRules = integration?.fieldMapJson;

    // 1. Run Validation Engine
    const validationResult = await validateCanonicalData(canonicalData, fieldConfidences, customRules);

    // Save ValidationResult items to DB
    await prisma.validationResult.deleteMany({ where: { documentId } });

    for (const item of [...validationResult.errors, ...validationResult.warnings]) {
      await prisma.validationResult.create({
        data: {
          documentId,
          ruleName: item.ruleName,
          ruleType: item.ruleType,
          passed: item.severity === 'WARNING',
          severity: item.severity,
          message: item.message,
          fieldName: item.field,
        },
      });
    }

    // 2. Run Routing Engine
    const routing = await routeDocument(documentId, validationResult, doc.overallConfidence);

    return NextResponse.json({
      success: true,
      documentId,
      validation: validationResult,
      routing,
    });
  } catch (error: any) {
    console.error('Validation API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
