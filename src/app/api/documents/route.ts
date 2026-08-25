import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId') || undefined;

    const whereCondition = customerId ? { customerId } : {};

    const documents = await prisma.document.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { name: true, code: true, primaryColor: true }
        },
        extraction: {
          select: { canonicalJson: true, confidenceScores: true }
        },
        validations: true
      }
    });

    return NextResponse.json({ success: true, documents });
  } catch (error: any) {
    console.error('Fetch Documents Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
