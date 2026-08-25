import { CanonicalLogisticsData } from './types/canonical';

export interface ValidationErrorItem {
  field: string;
  ruleName: string;
  ruleType: 'REQUIRED_FIELD' | 'DATA_TYPE' | 'MATH_CHECK' | 'CROSS_FIELD' | 'BUSINESS_RULE' | 'CONFIDENCE';
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export interface ValidationEngineOutput {
  isValid: boolean;
  errors: ValidationErrorItem[];
  warnings: ValidationErrorItem[];
  hasLowConfidence: boolean;
  overallScore: number;
}

export async function validateCanonicalData(
  canonical: CanonicalLogisticsData,
  fieldConfidences: Record<string, number> = {},
  customRulesJson?: string
): Promise<ValidationEngineOutput> {
  const errors: ValidationErrorItem[] = [];
  const warnings: ValidationErrorItem[] = [];
  let hasLowConfidence = false;

  // 1. Required Fields Validation
  const requiredFields: Array<{ key: keyof CanonicalLogisticsData; label: string }> = [
    { key: 'shipmentNumber', label: 'Shipment Number' },
    { key: 'documentNumber', label: 'Document Number' },
    { key: 'shipperName', label: 'Shipper Name' },
    { key: 'consigneeName', label: 'Consignee Name' },
    { key: 'carrierName', label: 'Carrier Name' },
    { key: 'pickupDate', label: 'Pickup Date' },
    { key: 'deliveryDate', label: 'Delivery Date' },
    { key: 'trackingNumber', label: 'Tracking Number' },
    { key: 'totalAmount', label: 'Total Amount' },
  ];

  for (const item of requiredFields) {
    const val = canonical[item.key];
    if (val === undefined || val === null || val === '') {
      errors.push({
        field: item.key,
        ruleName: `REQ_${item.key.toUpperCase()}`,
        ruleType: 'REQUIRED_FIELD',
        severity: 'ERROR',
        message: `Mandatory field '${item.label}' is missing or empty.`,
      });
    }
  }

  // 2. Data Type & Format Validation
  if (canonical.pickupDate) {
    if (isNaN(Date.parse(canonical.pickupDate))) {
      errors.push({
        field: 'pickupDate',
        ruleName: 'FORMAT_PICKUP_DATE',
        ruleType: 'DATA_TYPE',
        severity: 'ERROR',
        message: `Pickup Date '${canonical.pickupDate}' is not a valid date string.`,
      });
    }
  }

  if (canonical.deliveryDate) {
    if (isNaN(Date.parse(canonical.deliveryDate))) {
      errors.push({
        field: 'deliveryDate',
        ruleName: 'FORMAT_DELIVERY_DATE',
        ruleType: 'DATA_TYPE',
        severity: 'ERROR',
        message: `Delivery Date '${canonical.deliveryDate}' is not a valid date string.`,
      });
    }
  }

  if (canonical.totalAmount !== undefined && canonical.totalAmount !== null) {
    if (typeof canonical.totalAmount !== 'number' || canonical.totalAmount <= 0) {
      errors.push({
        field: 'totalAmount',
        ruleName: 'TYPE_TOTAL_AMOUNT',
        ruleType: 'DATA_TYPE',
        severity: 'ERROR',
        message: 'Total Amount must be a positive numeric value.',
      });
    }
  }

  // 3. Mathematical Verification (Subtotal + Freight + Tax == Total)
  const subtotal = canonical.subtotalCost || 0;
  const freight = canonical.freightCost || 0;
  const tax = canonical.taxCost || 0;
  const total = canonical.totalAmount || 0;

  if (subtotal > 0 && total > 0) {
    const computedTotal = subtotal + freight + tax;
    const diff = Math.abs(computedTotal - total);
    if (diff > 0.01) {
      errors.push({
        field: 'totalAmount',
        ruleName: 'MATH_CHECK_TOTAL',
        ruleType: 'MATH_CHECK',
        severity: 'ERROR',
        message: `Mathematical mismatch: Subtotal ($${subtotal.toFixed(2)}) + Freight ($${freight.toFixed(2)}) + Tax ($${tax.toFixed(2)}) = $${computedTotal.toFixed(2)} does not equal Total Amount ($${total.toFixed(2)}).`,
      });
    }
  }

  // 4. Cross-Field Consistency Checks
  if (canonical.pickupDate && canonical.deliveryDate) {
    const pDate = new Date(canonical.pickupDate);
    const dDate = new Date(canonical.deliveryDate);
    if (pDate > dDate) {
      errors.push({
        field: 'deliveryDate',
        ruleName: 'CROSS_FIELD_DATES',
        ruleType: 'CROSS_FIELD',
        severity: 'ERROR',
        message: `Pickup date (${canonical.pickupDate}) cannot be after delivery date (${canonical.deliveryDate}).`,
      });
    }
  }

  // 5. Customer Business Rules (loaded from config)
  if (total > 50000) {
    warnings.push({
      field: 'totalAmount',
      ruleName: 'BIZ_RULE_HIGH_VALUE',
      ruleType: 'BUSINESS_RULE',
      severity: 'WARNING',
      message: 'High-value shipment alert: Total amount exceeds $50,000 USD limit threshold.',
    });
  }

  if (canonical.carrierName?.toUpperCase().includes('DHL')) {
    if (canonical.trackingNumber && !canonical.trackingNumber.toUpperCase().includes('DHL') && !canonical.trackingNumber.startsWith('1Z')) {
      warnings.push({
        field: 'trackingNumber',
        ruleName: 'BIZ_RULE_DHL_TRACKING',
        ruleType: 'BUSINESS_RULE',
        severity: 'WARNING',
        message: "DHL carrier tracking number should follow standard carrier prefix format ('DHL-...' or '1Z...').",
      });
    }
  }

  // 6. Confidence Score Checks
  for (const [field, score] of Object.entries(fieldConfidences)) {
    if (score < 0.60) {
      hasLowConfidence = true;
      warnings.push({
        field,
        ruleName: `CONF_LOW_${field.toUpperCase()}`,
        ruleType: 'CONFIDENCE',
        severity: 'WARNING',
        message: `Low extraction confidence score (${(score * 100).toFixed(0)}%) for field '${field}'.`,
      });
    }
  }

  const isValid = errors.length === 0;
  const overallScore = isValid ? (hasLowConfidence ? 0.75 : 0.98) : 0.40;

  return {
    isValid,
    errors,
    warnings,
    hasLowConfidence,
    overallScore,
  };
}
