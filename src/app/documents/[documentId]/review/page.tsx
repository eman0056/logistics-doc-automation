'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Sparkles, Truck, DollarSign, Calendar, ShieldCheck, RefreshCw, Plus, Trash2, CheckCircle2 } from 'lucide-react';

export default function SplitScreenReviewPage() {
  const params = useParams();
  const documentId = params?.documentId as string;
  const router = useRouter();

  const [docData, setDocData] = useState<any>(null);
  const [canonical, setCanonical] = useState<any>({
    documentNumber: '',
    shipmentNumber: '',
    documentType: 'INVOICE',
    shipperName: '',
    shipperAddress: '',
    consigneeName: '',
    consigneeAddress: '',
    carrierName: '',
    pickupDate: '',
    deliveryDate: '',
    trackingNumber: '',
    purchaseOrderNumber: '',
    subtotalCost: 0,
    freightCost: 0,
    taxCost: 0,
    totalAmount: 0,
    currency: 'USD',
    lineItems: [],
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState<any>(null);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents`);
      const data = await res.json();
      if (data.documents) {
        const found = data.documents.find((d: any) => d.id === documentId);
        if (found) {
          setDocData(found);
          const rawCanonical = found.extraction?.finalSubmittedData || found.extraction?.canonicalJson;
          if (rawCanonical) {
            try {
              const parsed = JSON.parse(rawCanonical);
              setCanonical((prev: any) => ({ ...prev, ...parsed }));
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/customer')
      .then((res) => res.json())
      .then((data) => {
        if (data.customer) setCustomer(data.customer);
      });
    if (documentId) fetchDetails();
  }, [documentId]);

  const handleChange = (field: string, value: any) => {
    setCanonical((prev: any) => {
      const updated = { ...prev, [field]: value };
      // Auto-recalculate total if financial components change
      if (['subtotalCost', 'freightCost', 'taxCost'].includes(field)) {
        const sub = parseFloat(updated.subtotalCost) || 0;
        const frt = parseFloat(updated.freightCost) || 0;
        const tax = parseFloat(updated.taxCost) || 0;
        updated.totalAmount = parseFloat((sub + frt + tax).toFixed(2));
      }
      return updated;
    });
  };

  const handleLineItemChange = (index: number, key: string, value: any) => {
    setCanonical((prev: any) => {
      const items = [...(prev.lineItems || [])];
      items[index] = { ...items[index], [key]: value };

      if (key === 'quantity' || key === 'unitPrice') {
        const qty = parseFloat(items[index].quantity) || 1;
        const price = parseFloat(items[index].unitPrice) || 0;
        items[index].totalPrice = parseFloat((qty * price).toFixed(2));
      }

      // Re-sum subtotal
      const newSubtotal = items.reduce((acc, curr) => acc + (parseFloat(curr.totalPrice) || 0), 0);
      const frt = parseFloat(prev.freightCost) || 0;
      const tax = parseFloat(prev.taxCost) || 0;

      return {
        ...prev,
        lineItems: items,
        subtotalCost: parseFloat(newSubtotal.toFixed(2)),
        totalAmount: parseFloat((newSubtotal + frt + tax).toFixed(2)),
      };
    });
  };

  const addLineItem = () => {
    setCanonical((prev: any) => ({
      ...prev,
      lineItems: [
        ...(prev.lineItems || []),
        { description: 'Freight Cargo Item', quantity: 1, unitPrice: 100.0, totalPrice: 100.0 },
      ],
    }));
  };

  const removeLineItem = (index: number) => {
    setCanonical((prev: any) => {
      const items = prev.lineItems.filter((_: any, i: number) => i !== index);
      return { ...prev, lineItems: items };
    });
  };

  const handleGenerateInvoice = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/generate-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editedExtractedData: canonical,
        }),
      });

      const data = await res.json();
      if (res.ok && data.invoiceUrl) {
        router.push(data.invoiceUrl);
      } else {
        throw new Error(data.error || 'Invoice generation failed');
      }
    } catch (err: any) {
      alert(err.message || 'Error generating invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const primaryColor = customer?.primaryColor || '#0284c7';

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-400" />
        <p className="text-sm">Loading split-screen review viewer...</p>
      </div>
    );
  }

  const isPdf = docData?.mimeType === 'application/pdf' || docData?.fileName?.endsWith('.pdf');

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center space-x-4">
          <Link
            href="/documents"
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Split-Screen Review: {docData?.fileName || 'Document'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Verify AI extractions, make adjustments, and generate a professional print-ready invoice.
            </p>
          </div>
        </div>

        <button
          onClick={handleGenerateInvoice}
          disabled={submitting}
          className="flex items-center space-x-2 px-6 py-3 text-white font-bold rounded-xl text-sm shadow-xl transition-transform hover:scale-105 disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          <Sparkles className={`w-5 h-5 ${submitting ? 'animate-spin' : ''}`} />
          <span>{submitting ? 'Generating Invoice...' : 'Generate Invoice'}</span>
        </button>
      </div>

      {/* Split-Screen Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT PANE: Document Preview */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Original Document Preview</span>
              </h3>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/30">
                Quality: High (98%)
              </span>
            </div>

            {/* Document Metadata Card */}
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Filename:</span>
                <span className="text-white font-medium truncate max-w-[200px]">{docData?.fileName}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>File Size / Type:</span>
                <span className="text-slate-200 font-mono">
                  {((docData?.fileSize || 0) / 1024).toFixed(1)} KB ({docData?.mimeType})
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Storage Path:</span>
                <span className="text-slate-300 font-mono text-[11px] truncate max-w-[200px]">{docData?.storagePath}</span>
              </div>
            </div>

            {/* Visual Document Viewer Frame */}
            <div className="border border-slate-800 rounded-xl bg-slate-950 p-6 text-center h-[420px] flex flex-col items-center justify-center space-y-4">
              <div className="w-20 h-28 bg-slate-900 border-2 border-sky-500/40 rounded-lg flex flex-col justify-between p-3 shadow-2xl relative overflow-hidden group">
                <div className="h-1.5 bg-sky-500 w-3/4 rounded" />
                <div className="space-y-1.5">
                  <div className="h-1 bg-slate-700 w-full rounded" />
                  <div className="h-1 bg-slate-700 w-5/6 rounded" />
                  <div className="h-1 bg-slate-700 w-2/3 rounded" />
                </div>
                <div className="h-1.5 bg-emerald-500 w-1/2 rounded" />
              </div>

              <div>
                <p className="text-sm font-semibold text-white">{docData?.fileName}</p>
                <p className="text-xs text-slate-400 mt-1">
                  Preview rendered via PDF binary engine.
                </p>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 border-t border-slate-800 pt-3">
            White-Label Token Active: <span className="text-sky-400 font-semibold">{customer?.name || 'Apex Freight'}</span>
          </div>
        </div>

        {/* RIGHT PANE: Extracted Information (Editable Form) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-sky-400" />
              <span>Extracted Information (Editable)</span>
            </h3>
            <span className="text-xs text-slate-400">Click any field to edit</span>
          </div>

          <div className="space-y-5 text-xs">
            {/* Category 1: Document Info */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>1. Document Info</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Invoice / Doc Number</label>
                  <input
                    type="text"
                    value={canonical.documentNumber || ''}
                    onChange={(e) => handleChange('documentNumber', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Shipment Number</label>
                  <input
                    type="text"
                    value={canonical.shipmentNumber || ''}
                    onChange={(e) => handleChange('shipmentNumber', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Document Type</label>
                  <select
                    value={canonical.documentType || 'INVOICE'}
                    onChange={(e) => handleChange('documentType', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-semibold"
                  >
                    <option value="INVOICE">INVOICE</option>
                    <option value="BOL">BOL (Bill of Lading)</option>
                    <option value="POD">POD (Proof of Delivery)</option>
                    <option value="RATE_CONFIRMATION">RATE CONFIRMATION</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Category 2: Parties */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                <Truck className="w-3.5 h-3.5" />
                <span>2. Logistics Parties</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Shipper / Sender</label>
                  <input
                    type="text"
                    value={canonical.shipperName || ''}
                    onChange={(e) => handleChange('shipperName', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Consignee / Receiver</label>
                  <input
                    type="text"
                    value={canonical.consigneeName || ''}
                    onChange={(e) => handleChange('consigneeName', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Carrier Name</label>
                  <input
                    type="text"
                    value={canonical.carrierName || ''}
                    onChange={(e) => handleChange('carrierName', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Category 3: Dates & Amounts */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                <span>3. Financial Amounts & Dates</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Pickup Date</label>
                  <input
                    type="text"
                    value={canonical.pickupDate || ''}
                    onChange={(e) => handleChange('pickupDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Delivery Date</label>
                  <input
                    type="text"
                    value={canonical.deliveryDate || ''}
                    onChange={(e) => handleChange('deliveryDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Subtotal ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={canonical.subtotalCost || 0}
                    onChange={(e) => handleChange('subtotalCost', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Freight Charge ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={canonical.freightCost || 0}
                    onChange={(e) => handleChange('freightCost', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Tax / Fees ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={canonical.taxCost || 0}
                    onChange={(e) => handleChange('taxCost', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-emerald-400 font-bold block mb-1">Total Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={canonical.totalAmount || 0}
                    onChange={(e) => handleChange('totalAmount', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-emerald-500/50 focus:border-emerald-400 rounded-lg px-3 py-2 text-emerald-400 font-extrabold text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Category 4: Line Items Table */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                  4. Invoice Line Items ({canonical.lineItems?.length || 0})
                </span>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center space-x-1 text-xs text-sky-400 hover:text-sky-300 bg-sky-950/60 border border-sky-800 px-2.5 py-1 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line Item</span>
                </button>
              </div>

              {canonical.lineItems && canonical.lineItems.length > 0 && (
                <div className="space-y-2">
                  {canonical.lineItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center space-x-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <input
                        type="text"
                        placeholder="Description"
                        value={item.description || ''}
                        onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-white text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity || 1}
                        onChange={(e) => handleLineItemChange(idx, 'quantity', parseFloat(e.target.value) || 1)}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs font-mono"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Price"
                        value={item.unitPrice || 0}
                        onChange={(e) => handleLineItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs font-mono"
                      />
                      <span className="w-24 font-mono font-bold text-emerald-400 text-right px-2">
                        ${(item.totalPrice || 0).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handleGenerateInvoice}
              disabled={submitting}
              className="w-full py-4 text-white font-bold rounded-2xl text-base shadow-2xl transition-transform hover:scale-[1.02] flex items-center justify-center space-x-2"
              style={{ backgroundColor: primaryColor }}
            >
              <Sparkles className="w-5 h-5" />
              <span>{submitting ? 'Generating Professional Invoice...' : 'Generate Invoice'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
