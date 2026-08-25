import { prisma } from './db';
import { ValidationEngineOutput } from './validation';

export interface RoutingDecision {
  status: 'AUTO_APPROVED' | 'REVIEW_REQUIRED' | 'FAILED';
  priority: 'HIGH' | 'NORMAL';
  reason: string;
  createReviewTask: boolean;
}

export async function routeDocument(
  documentId: string,
  validationResult: ValidationEngineOutput,
  overallConfidence: number = 0.90
): Promise<RoutingDecision> {
  let status: 'AUTO_APPROVED' | 'REVIEW_REQUIRED' | 'FAILED' = 'REVIEW_REQUIRED';
  let priority: 'HIGH' | 'NORMAL' = 'NORMAL';
  let reason = '';
  let createReviewTask = false;

  if (!validationResult.isValid) {
    status = 'FAILED';
    priority = 'HIGH';
    reason = `Validation failed: ${validationResult.errors.map((e) => e.message).join(' ')}`;
    createReviewTask = true;
  } else if (validationResult.hasLowConfidence || overallConfidence < 0.85 || validationResult.warnings.length > 0) {
    status = 'REVIEW_REQUIRED';
    priority = overallConfidence < 0.60 ? 'HIGH' : 'NORMAL';
    reason = validationResult.warnings.length > 0
      ? `Review required: ${validationResult.warnings.map((w) => w.message).join(' ')}`
      : `Medium confidence score (${(overallConfidence * 100).toFixed(0)}%) requires human verification.`;
    createReviewTask = true;
  } else {
    status = 'AUTO_APPROVED';
    priority = 'NORMAL';
    reason = 'All validation rules passed with high confidence. Auto-approved for destination submission.';
    createReviewTask = false;
  }

  // Update Document status in DB
  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: status === 'AUTO_APPROVED' ? 'APPROVED' : status === 'FAILED' ? 'FAILED' : 'IN_REVIEW',
    },
  });

  // Auto-create ReviewTask if routed to review/failed
  if (createReviewTask) {
    // Assign to lead reviewer or first reviewer available
    const reviewer = await prisma.user.findFirst({
      where: { role: 'reviewer' },
    });

    await prisma.reviewTask.create({
      data: {
        documentId,
        assignedToId: reviewer?.id || null,
        status: 'PENDING',
        reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        documentId,
        action: 'ROUTED_TO_REVIEW',
        description: `Document routed to human review queue (Priority: ${priority}). Reason: ${reason}`,
        metadataJson: JSON.stringify({ priority, status, errorsCount: validationResult.errors.length }),
      },
    });
  } else {
    await prisma.auditLog.create({
      data: {
        documentId,
        action: 'AUTO_APPROVED',
        description: 'Document auto-approved with high confidence. Ready for destination submission.',
      },
    });
  }

  return {
    status,
    priority,
    reason,
    createReviewTask,
  };
}
