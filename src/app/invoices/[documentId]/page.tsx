'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, Printer, ArrowLeft, Truck, CheckCircle2, ShieldCheck, FileText, Calendar, Building2, MapPin } from 'lucide-react';

export default function InvoiceDisplayPage() {
  const params = useParams();
  const documentId = params?.documentId as string;
  const router = useRouter();

  const [docData, setDocData] = useState<any>(null);
  const [canonical, setCanonical] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchInvoiceData = async () => {
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
              setCanonical(JSON.parse(rawCanonical));
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
    if (documentId) fetchInvoiceData();
  }, [documentId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    // Standard print window or html2pdf conversion
    window.print();
  };

  const primaryColor = customer?.primaryColor || '#0284c7';

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm">Rendering professional invoice document...</p>
      </div>
    );
  }

  const invoiceNumber = canonical?.documentNumber || `INV-${documentId.substring(0, 8).toUpperCase()}`;
  const issueDate = canonical?.pickupDate || new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Controls Bar (Hidden during printing) */}
      <div className="print:hidden flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <Link
          href={`/documents/${documentId}/review`}
          className="flex items-center space-x-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Review</span>
        </Link>

        <div className="flex items-center space-x-3">
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold shadow transition"
          >
            <Printer className="w-4 h-4 text-sky-400" />
            <span>Print Invoice</span>
          </button>
          <button
            onClick={handleDownloadPdf}
            className="flex items-center space-x-2 px-5 py-2 text-white font-bold rounded-xl text-xs shadow-lg transition-transform hover:scale-105"
            style={{ backgroundColor: primaryColor }}
          >
            <Download className="w-4 h-4" />
            <span>Download as PDF</span>
          </button>
        </div>
      </div>

      {/* Main Print-Ready Invoice Card */}
      <div
        id="invoice-document-card"
        className="bg-white text-slate-900 rounded-2xl p-10 shadow-2xl border border-slate-200 print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0"
      >
        {/* Invoice Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-8">
          <div>
            <div className="flex items-center space-x-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-md"
                style={{ backgroundColor: primaryColor }}
              >
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  {customer?.name || 'Apex Freight Logistics'}
                </h1>
                <p className="text-xs text-slate-500 font-medium">Logistics & Supply Chain Automation Services</p>
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-500 space-y-0.5">
              <p>100 Logistics Parkway, Suite 400</p>
              <p>Chicago, IL 60601 • United States</p>
              <p>Email: billing@apexlogistics.com • Web: www.apexlogistics.com</p>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-full border border-emerald-300 uppercase tracking-wider mb-2">
              INVOICE GENERATED
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight font-mono">{invoiceNumber}</h2>
            <div className="mt-2 text-xs text-slate-500 space-y-1 font-mono">
              <p><span className="text-slate-400">Issue Date:</span> {issueDate}</p>
              <p><span className="text-slate-400">Shipment Ref:</span> {canonical?.shipmentNumber || 'N/A'}</p>
              <p><span className="text-slate-400">Tracking #:</span> {canonical?.trackingNumber || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* FROM and TO Address Section */}
        <div className="grid grid-cols-2 gap-8 my-8 text-xs">
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">FROM (Shipper / Sender)</span>
            <h3 className="text-sm font-extrabold text-slate-900">{canonical?.shipperName || 'Apex Logistics Hub'}</h3>
            <p className="text-slate-600 mt-1">{canonical?.shipperAddress || canonical?.originAddress || 'Chicago IL 60601'}</p>
            <p className="text-slate-500 mt-2 font-mono">Carrier: {canonical?.carrierName || 'DHL Express Freight'}</p>
          </div>

          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">TO (Consignee / Receiver)</span>
            <h3 className="text-sm font-extrabold text-slate-900">{canonical?.consigneeName || 'Global Distribution Center'}</h3>
            <p className="text-slate-600 mt-1">{canonical?.consigneeAddress || canonical?.destinationAddress || 'Dallas TX 75201'}</p>
            <p className="text-slate-500 mt-2 font-mono">Delivery Date: {canonical?.deliveryDate || '2026-08-18'}</p>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="my-8">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-semibold">
                <th className="py-3 px-4 rounded-l-lg">Item Description</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Unit Price</th>
                <th className="py-3 px-4 text-right rounded-r-lg">Total Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {canonical?.lineItems && canonical.lineItems.length > 0 ? (
                canonical.lineItems.map((item: any, i: number) => (
                  <tr key={i}>
                    <td className="py-3 px-4 font-semibold text-slate-800">{item.description}</td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600">{item.quantity}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">${parseFloat(item.unitPrice || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">${parseFloat(item.totalPrice || 0).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-800">Freight Transport & Handling Services</td>
                  <td className="py-3 px-4 text-center font-mono text-slate-600">1</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">${(canonical?.subtotalCost || 1250).toFixed(2)}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">${(canonical?.subtotalCost || 1250).toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="flex justify-end my-6">
          <div className="w-72 bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-mono">${(canonical?.subtotalCost || 1250).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Freight Charges:</span>
              <span className="font-mono">${(canonical?.freightCost || 150).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax & Duties:</span>
              <span className="font-mono">${(canonical?.taxCost || 75).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-extrabold text-sm border-t border-slate-300 pt-2">
              <span>TOTAL AMOUNT:</span>
              <span className="font-mono text-emerald-600">${(canonical?.totalAmount || 1475).toFixed(2)} {canonical?.currency || 'USD'}</span>
            </div>
          </div>
        </div>

        {/* Invoice Terms & Footer */}
        <div className="border-t border-slate-200 pt-6 mt-12 text-xs text-slate-500 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Payment Terms & Instructions</h4>
            <p>Payment due within 30 days of issue date (Net 30).</p>
            <p>Direct Wire Transfer: Account # 9918-28341-992 • Routing # 071000013</p>
          </div>

          <div className="text-right">
            <div className="w-36 h-10 border-b border-slate-400 mx-auto md:ml-auto font-serif italic text-slate-600 flex items-end justify-center">
              Authorized Signature
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Apex Freight Logistics Audit System</p>
          </div>
        </div>
      </div>
    </div>
  );
}
