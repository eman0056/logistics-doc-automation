import { z } from 'zod';

export const DocumentTypeEnum = z.enum([
  'BOL', // Bill of Lading
  'RATE_CONFIRMATION', // Rate Confirmation
  'POD', // Proof of Delivery
  'PACKING_LIST', // Packing List
  'INVOICE', // Freight/Carrier Invoice
  'SHIPPING_MANIFEST', // Shipping Manifest
  'CUSTOMS_PAPERWORK', // Customs Paperwork
  'DELIVERY_RECEIPT', // Delivery Receipt
  'UNKNOWN'
]);

export type DocumentType = z.infer<typeof DocumentTypeEnum>;

export const LineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string(),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  totalPrice: z.number().default(0),
  weight: z.number().optional(),
  freightClass: z.string().optional(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

export const CanonicalLogisticsSchema = z.object({
  shipmentNumber: z.string().nullable().optional(),
  documentNumber: z.string().nullable().optional(),
  documentType: DocumentTypeEnum.default('UNKNOWN'),
  shipperName: z.string().nullable().optional(),
  shipperAddress: z.string().nullable().optional(),
  consigneeName: z.string().nullable().optional(),
  consigneeAddress: z.string().nullable().optional(),
  carrierName: z.string().nullable().optional(),
  originAddress: z.string().nullable().optional(),
  destinationAddress: z.string().nullable().optional(),
  pickupDate: z.string().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  trackingNumber: z.string().nullable().optional(),
  purchaseOrderNumber: z.string().nullable().optional(),
  weightLb: z.number().nullable().optional(),
  totalQuantity: z.number().nullable().optional(),
  subtotalCost: z.number().nullable().optional(),
  freightCost: z.number().nullable().optional(),
  taxCost: z.number().nullable().optional(),
  totalAmount: z.number().nullable().optional(),
  currency: z.string().default('USD'),
  lineItems: z.array(LineItemSchema).default([]),
});

export type CanonicalLogisticsData = z.infer<typeof CanonicalLogisticsSchema>;

export interface FieldConfidence {
  field: string;
  confidence: number; // 0.0 - 1.0
}

export interface ExtractionOutput {
  canonicalData: CanonicalLogisticsData;
  rawText: string;
  fieldConfidences: Record<string, number>;
  overallConfidence: number;
}
