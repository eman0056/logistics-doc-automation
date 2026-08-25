'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FileText, Layers, ShieldCheck, DollarSign, Truck } from 'lucide-react';

export default function ReviewTaskDetailPage() {
  const params = useParams();
  const taskId = params?.taskId as string;
  const router = useRouter();

  const [task, setTask] = useState<any>(null);
  const [canonical, setCanonical] = useState<any>({});
  const [confidences, setConfidences] = useState<Record<string, number>>({});
  const [validations, setValidations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState<any>(null);

  const fetchTaskDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/review-tasks');
      const data = await res.json();
      if (data.tasks) {
        const found = data.tasks.find((t: any) => t.id === taskId);
        if (found) {
          setTask(found);
          if (found.document?.extraction?.canonicalJson) {
            try {
              setCanonical(JSON.parse(found.document.extraction.canonicalJson));
            } catch (e) {}
          }
          if (found.document?.extraction?.confidenceScores) {
            try {
              setConfidences(JSON.parse(found.document.extraction.confidenceScores));
            } catch (e) {}
          }
          if (found.document?.validations) {
            setValidations(found.document.validations);
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
    if (taskId) fetchTaskDetails();
  }, [taskId]);

  const handleFieldChange = (field: string, value: any) => {
    setCanonical((prev: any) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review-tasks/${taskId}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'APPROVED',
          corrections: canonical,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        router.push('/review-queue');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await fetch(`/api/review-tasks/${taskId}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REJECTED',
        }),
      });
      router.push('/review-queue');
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const getConfidenceBadge = (score: number | undefined) => {
    const val = score !== undefined ? score : 0.90;
    if (val >= 0.85) {
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          {(val * 100).toFixed(0)}% HIGH
        </span>
      );
    } else if (val >= 0.60) {
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
          {(val * 100).toFixed(0)}% MED
        </span>
      );
    } else {
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
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
        <p className="text-sm">Loading review task details...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center space-x-4">
          <Link
            href="/review-queue"
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold text-white tracking-tight">
                Review Exception: {task?.document?.fileName || 'Document'}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Task Status: {task?.status}
              </span>
            </div>
            <p className="text-xs text-rose-300 mt-1 flex items-center space-x-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Reason: {task?.reason}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleReject}
            disabled={submitting}
            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold transition"
          >
            Reject Document
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="px-5 py-2 text-white font-bold rounded-xl text-xs shadow-lg transition-transform hover:scale-105"
            style={{ backgroundColor: primaryColor }}
          >
            {submitting ? 'Saving & Re-validating...' : 'Approve & Authorize ERP Sync'}
          </button>
        </div>
      </div>

      {/* Validation Errors Alert Banner */}
      {validations.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 space-y-2">
          <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Detected Validation Mismatches ({validations.length})</span>
          </div>
          <ul className="text-xs text-rose-300 space-y-1 list-disc pl-5">
            {validations.map((v: any, i: number) => (
              <li key={i}>{v.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Split-Screen Editing Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Pane: Original Document Preview */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>Original Document Artifact</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">PDF / Image</span>
          </div>

          <div className="border border-slate-800 rounded-xl bg-slate-950 p-6 text-center h-96 flex flex-col items-center justify-center space-y-3">
            <div className="w-16 h-20 bg-slate-900 border-2 border-slate-700 rounded-lg flex flex-col justify-between p-2">
              <div className="h-1 bg-sky-500 w-3/4 rounded" />
              <div className="space-y-1">
                <div className="h-1 bg-slate-700 w-full rounded" />
                <div className="h-1 bg-slate-700 w-2/3 rounded" />
              </div>
              <div className="h-1 bg-amber-500 w-1/2 rounded" />
            </div>
            <p className="text-xs text-slate-400 max-w-xs">
              Storage Path: <span className="text-white font-mono">{task?.document?.storagePath}</span>
            </p>
          </div>
        </div>

        {/* Right Pane: Interactive Editable Canonical Form */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Layers className="w-5 h-5 text-sky-400" />
              <span>Interactive Correction Form</span>
            </h3>
            <span className="text-xs text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/30">
              Editable Form
            </span>
          </div>

          <div className="space-y-5 text-xs">
            {/* Document Identifiers */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">
                1. Document & Shipment Identifiers
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Shipment Number</span>
                    {getConfidenceBadge(confidences.shipmentNumber)}
                  </div>
                  <input
                    type="text"
                    value={canonical.shipmentNumber || ''}
                    onChange={(e) => handleFieldChange('shipmentNumber', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Document Number</span>
                    {getConfidenceBadge(confidences.documentNumber)}
                  </div>
                  <input
                    type="text"
                    value={canonical.documentNumber || ''}
                    onChange={(e) => handleFieldChange('documentNumber', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
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
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Shipper</span>
                    {getConfidenceBadge(confidences.shipperName)}
                  </div>
                  <input
                    type="text"
                    value={canonical.shipperName || ''}
                    onChange={(e) => handleFieldChange('shipperName', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Consignee</span>
                    {getConfidenceBadge(confidences.consigneeName)}
                  </div>
                  <input
                    type="text"
                    value={canonical.consigneeName || ''}
                    onChange={(e) => handleFieldChange('consigneeName', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Carrier</span>
                    {getConfidenceBadge(confidences.carrierName)}
                  </div>
                  <input
                    type="text"
                    value={canonical.carrierName || ''}
                    onChange={(e) => handleFieldChange('carrierName', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white"
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
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Pickup Date</span>
                    {getConfidenceBadge(confidences.pickupDate)}
                  </div>
                  <input
                    type="text"
                    value={canonical.pickupDate || ''}
                    onChange={(e) => handleFieldChange('pickupDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Delivery Date</span>
                    {getConfidenceBadge(confidences.deliveryDate)}
                  </div>
                  <input
                    type="text"
                    value={canonical.deliveryDate || ''}
                    onChange={(e) => handleFieldChange('deliveryDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Subtotal</span>
                    {getConfidenceBadge(confidences.subtotalCost)}
                  </div>
                  <input
                    type="number"
                    value={canonical.subtotalCost || 0}
                    onChange={(e) => handleFieldChange('subtotalCost', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Total Amount</span>
                    {getConfidenceBadge(confidences.totalAmount)}
                  </div>
                  <input
                    type="number"
                    value={canonical.totalAmount || 0}
                    onChange={(e) => handleFieldChange('totalAmount', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-emerald-500/50 focus:border-emerald-400 rounded-lg px-3 py-2 text-emerald-400 font-bold font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
