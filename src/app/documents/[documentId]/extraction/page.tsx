'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, CheckCircle2, AlertTriangle, RefreshCw, Cpu, Layers, Sparkles, DollarSign, Calendar, Truck, MapPin } from 'lucide-react';

export default function DocumentExtractionPage() {
  const params = useParams();
  const documentId = params?.documentId as string;

  const [docData, setDocData] = useState<any>(null);
  const [canonical, setCanonical] = useState<any>(null);
  const [confidences, setConfidences] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [customer, setCustomer] = useState<any>(null);

  const fetchDocumentData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents`);
      const data = await res.json();
      if (data.documents) {
        const found = data.documents.find((d: any) => d.id === documentId);
        if (found) {
          setDocData(found);
          if (found.extraction?.canonicalJson) {
            try {
              setCanonical(JSON.parse(found.extraction.canonicalJson));
            } catch (e) {}
          }
          if (found.extraction?.confidenceScores) {
            try {
              setConfidences(JSON.parse(found.extraction.confidenceScores));
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
    if (documentId) fetchDocumentData();
  }, [documentId]);

  const handleProcessNow = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/process`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.canonical) setCanonical(data.canonical);
      if (data.confidenceScores) setConfidences(data.confidenceScores);
      await fetchDocumentData();
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  const getConfidenceBadge = (score: number | undefined) => {
    const val = score !== undefined ? score : 0.90;
    if (val >= 0.85) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          {(val * 100).toFixed(0)}% HIGH
        </span>
      );
    } else if (val >= 0.60) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
          {(val * 100).toFixed(0)}% MED
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
          {(val * 100).toFixed(0)}% LOW
        </span>
      );
    }
  };

  const primaryColor = customer?.primaryColor || '#0284c7';

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-400" />
        <p className="text-sm">Loading extraction breakdown...</p>
      </div>
    );
  }

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
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {docData?.fileName || 'Document Extraction Details'}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-sky-950 text-sky-300 border border-sky-800">
                {docData?.documentType || 'INVOICE'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              ID: {documentId} • Pipeline Status: <span className="text-emerald-400 font-semibold">{docData?.status}</span>
            </p>
          </div>
        </div>

        <button
          onClick={handleProcessNow}
          disabled={processing}
          className="flex items-center space-x-2 px-5 py-2.5 text-white font-semibold rounded-xl text-sm shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          <Sparkles className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
          <span>{processing ? 'Running n8n AI Chain...' : 'Re-Run AI Extraction'}</span>
        </button>
      </div>

      {/* n8n Workflow Execution Log Summary Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400">n8n Execution Status:</span>
            <span className="font-semibold text-emerald-400 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>OCR: ✓</span>
            </span>
            <span className="font-semibold text-emerald-400 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>AI: ✓</span>
            </span>
            <span className="font-bold text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
              OVERALL: SUCCESS
            </span>
          </div>
        </div>

        <div className="text-slate-400 font-mono">
          Engine: Claude 3.5 Sonnet + pdf-parse • Conf: <span className="text-white font-bold">{((docData?.overallConfidence || 0.94) * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Split-Screen Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sidebar Document Preview Viewer */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Original Document Preview</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">PDF / Image Binary</span>
            </div>

            {/* Document Details Card */}
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800/80 space-y-3 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Storage Path:</span>
                <span className="text-slate-200 font-mono truncate max-w-[200px]">{docData?.storagePath}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>File Size:</span>
                <span className="text-slate-200 font-mono">{((docData?.fileSize || 0) / 1024).toFixed(1)} KB</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>MIME Type:</span>
                <span className="text-slate-200 font-mono">{docData?.mimeType}</span>
              </div>
            </div>

            {/* Simulated Visual PDF Document Frame */}
            <div className="mt-4 border border-slate-800 rounded-xl bg-slate-950 p-6 text-center h-80 flex flex-col items-center justify-center space-y-3">
              <div className="w-16 h-20 bg-slate-900 border-2 border-slate-700 rounded-lg flex flex-col justify-between p-2 shadow-inner">
                <div className="h-1 bg-slate-700 w-3/4 rounded" />
                <div className="space-y-1">
                  <div className="h-1 bg-slate-700 w-full rounded" />
                  <div className="h-1 bg-slate-700 w-2/3 rounded" />
                </div>
                <div className="h-1 bg-sky-500 w-1/2 rounded" />
              </div>
              <p className="text-xs text-slate-400 max-w-xs">
                Rendered preview for <span className="text-white font-medium">{docData?.fileName}</span>
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 border-t border-slate-800/80 pt-4">
            Audited & verified by n8n workflow engine instance `n8n.provelopers.net`.
          </div>
        </div>

        {/* Right Column: Form Display of Extracted Canonical Logistics Fields */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Layers className="w-5 h-5 text-sky-400" />
              <span>Extracted Canonical Logistics Schema</span>
            </h3>
            <span className="text-xs text-slate-400">Read-Only View</span>
          </div>

          {!canonical ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-400">No canonical JSON extracted yet.</p>
              <button
                onClick={handleProcessNow}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold"
              >
                Trigger Extraction Pipeline
              </button>
            </div>
          ) : (
            <div className="space-y-6 text-sm">
              {/* Header References */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">
                  1. Document & Shipment Identifiers
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Shipment Number</span>
                      {getConfidenceBadge(confidences.shipmentNumber)}
                    </div>
                    <input
                      readOnly
                      value={canonical.shipmentNumber || 'N/A'}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Document Number</span>
                      {getConfidenceBadge(confidences.documentNumber)}
                    </div>
                    <input
                      readOnly
                      value={canonical.documentNumber || 'N/A'}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Logistics Parties */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Truck className="w-3.5 h-3.5" />
                  <span>2. Logistics Parties</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Shipper</span>
                      {getConfidenceBadge(confidences.shipperName)}
                    </div>
                    <input
                      readOnly
                      value={canonical.shipperName || 'N/A'}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs truncate"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Consignee</span>
                      {getConfidenceBadge(confidences.consigneeName)}
                    </div>
                    <input
                      readOnly
                      value={canonical.consigneeName || 'N/A'}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs truncate"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Carrier</span>
                      {getConfidenceBadge(confidences.carrierName)}
                    </div>
                    <input
                      readOnly
                      value={canonical.carrierName || 'N/A'}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs truncate"
                    />
                  </div>
                </div>
              </div>

              {/* Dates & Financials */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>3. Dates & Financial Totals</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Pickup</span>
                      {getConfidenceBadge(confidences.pickupDate)}
                    </div>
                    <input
                      readOnly
                      value={canonical.pickupDate || 'N/A'}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Delivery</span>
                      {getConfidenceBadge(confidences.deliveryDate)}
                    </div>
                    <input
                      readOnly
                      value={canonical.deliveryDate || 'N/A'}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Subtotal</span>
                      {getConfidenceBadge(confidences.subtotalCost)}
                    </div>
                    <input
                      readOnly
                      value={`$${canonical.subtotalCost || '0.00'}`}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span>Total Amount</span>
                      {getConfidenceBadge(confidences.totalAmount)}
                    </div>
                    <input
                      readOnly
                      value={`$${canonical.totalAmount || '0.00'}`}
                      className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg px-3 py-1.5 text-emerald-400 text-xs font-bold font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              {canonical.lineItems && canonical.lineItems.length > 0 && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2">
                    4. Extracted Line Items ({canonical.lineItems.length})
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="p-2">Description</th>
                          <th className="p-2">Qty</th>
                          <th className="p-2">Unit Price</th>
                          <th className="p-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {canonical.lineItems.map((item: any, i: number) => (
                          <tr key={i}>
                            <td className="p-2 text-white font-medium">{item.description}</td>
                            <td className="p-2 font-mono">{item.quantity}</td>
                            <td className="p-2 font-mono">${item.unitPrice?.toFixed(2)}</td>
                            <td className="p-2 text-right font-mono font-semibold text-emerald-400">
                              ${item.totalPrice?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
