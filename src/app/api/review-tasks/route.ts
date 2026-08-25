import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const tasks = await prisma.reviewTask.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        document: {
          include: {
            customer: true,
            validations: true,
          },
        },
        assignedTo: true,
      },
    });

    return NextResponse.json({ success: true, tasks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
