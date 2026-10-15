const QUALITY_REASON_LABELS = {
  'visual-quality': 'Poor Image Quality',
  'missing-invoice-number': 'Missing Invoice Number',
  'incomplete-extraction': 'Extraction Incomplete',
  'needs-review': 'Needs Review',
};

const QUALITY_REASON_MESSAGES = {
  'visual-quality': 'The visual quality score is below the image-quality threshold. Verify the source image.',
  'missing-invoice-number': 'No invoice number was found in the extracted data. Review the invoice details.',
  'incomplete-extraction': 'Invoice extraction data is incomplete or unavailable. Review the extraction result.',
  'needs-review': 'This invoice is flagged for review, but no low visual quality score explains the flag.',
};

export const getInvoiceQualityReasons = ({
  hasExtraction,
  hasInvoiceNumber,
  imageQuality,
  status,
}) => {
  const reasons = [];
  const score = typeof imageQuality === 'number'
    ? imageQuality
    : typeof imageQuality === 'string' && imageQuality.trim() !== ''
      ? Number(imageQuality)
      : NaN;
  const visualQualityPoor = imageQuality != null && Number.isFinite(score) && score < 0.6;
  const statusSaysPoor = ['POOR_IMAGE_QUALITY', 'POOR IMAGE QUALITY'].includes(
    String(status || '').toUpperCase()
  );
  const statusNeedsReview = ['NEEDS_REVIEW', 'NEEDS REVIEW'].includes(
    String(status || '').toUpperCase()
  );

  if (visualQualityPoor) reasons.push('visual-quality');
  if (hasExtraction && !hasInvoiceNumber) reasons.push('missing-invoice-number');
  if (!hasExtraction && (statusSaysPoor || statusNeedsReview)) reasons.push('incomplete-extraction');
  if (statusSaysPoor && reasons.length === 0) reasons.push('needs-review');

  return reasons;
};

export const getInvoiceQualityState = ({
  hasExtraction,
  hasInvoiceNumber,
  imageQuality,
  status,
}) => {
  const score = typeof imageQuality === 'number'
    ? imageQuality
    : typeof imageQuality === 'string' && imageQuality.trim() !== ''
      ? Number(imageQuality)
      : NaN;
  const poor = Number.isFinite(score) && score < 0.6;
  const normalizedStatus = String(status || '').toUpperCase();
  const statusNeedsReview = ['NEEDS_REVIEW', 'NEEDS REVIEW', 'POOR_IMAGE_QUALITY', 'POOR IMAGE QUALITY']
    .includes(normalizedStatus);
  const qualityReasons = getInvoiceQualityReasons({
    hasExtraction,
    hasInvoiceNumber,
    imageQuality,
    status,
  });
  const needsReview = poor || (hasExtraction && !hasInvoiceNumber) || statusNeedsReview;
  if (needsReview && qualityReasons.length === 0) qualityReasons.push('needs-review');

  return { poor, needsReview, qualityReasons };
};

export const getInvoiceQualityReasonLabel = (reason) => QUALITY_REASON_LABELS[reason] || 'Needs Review';

export const getInvoiceQualityReasonMessage = (reason) => QUALITY_REASON_MESSAGES[reason] || QUALITY_REASON_MESSAGES['needs-review'];
