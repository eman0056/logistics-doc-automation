'use client';

import { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowRight, RefreshCw, ShieldCheck, FileCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function DocumentUploadPage() {
  const router = useRouter();

  const [customer, setCustomer] = useState<any>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processingAi, setProcessingAi] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/customer')
      .then((res) => res.json())
      .then((data) => {
        if (data.customer) setCustomer(data.customer);
      })
      .catch(() => {});
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setErrorMsg(null);
    setUploadResult(null);

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('Unsupported file type. Please upload a PDF, JPG, or PNG document.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('File size exceeds maximum 25MB limit.');
      return;
    }

    setSelectedFile(file);
  };

  const pollDocumentStatus = (docId: string) => {
    setProcessingAi(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/documents/${docId}/status`);
        const data = await res.json();

        if (data.isExtracted || data.status === 'EXTRACTED' || data.status === 'PREPROCESSED' || attempts >= 10) {
          clearInterval(interval);
          setProcessingAi(false);
          // Auto-redirect to split-screen review page
          setTimeout(() => {
            router.push(`/documents/${docId}/review`);
          }, 800);
        }
      } catch (err) {
        if (attempts >= 10) {
          clearInterval(interval);
          setProcessingAi(false);
        }
      }
    }, 1500);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setProgress(15);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (customer?.id) {
      formData.append('customerId', customer.id);
    }

    const timer = setInterval(() => {
      setProgress((prev) => (prev >= 85 ? prev : prev + 15));
    }, 200);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(timer);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Upload failed');
      }

      setProgress(100);
      setUploadResult(data.document);
      setUploading(false);

      // Trigger status polling and auto-redirect to review
      pollDocumentStatus(data.document.id);
    } catch (err: any) {
      clearInterval(timer);
      setUploading(false);
      setProgress(0);
      setErrorMsg(err.message || 'An error occurred during upload.');
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploading(false);
    setProcessingAi(false);
    setProgress(0);
    setUploadResult(null);
    setErrorMsg(null);
  };

  const primaryColor = customer?.primaryColor || '#0284c7';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Document Ingestion & n8n AI Pipeline
              </h1>
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium text-white shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                {customer?.code || 'APEX'} AI Workflow
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Upload Bills of Lading, Rate Confirmations, or Invoices to automatically trigger the n8n AI workflow chain.
            </p>
          </div>
          <Link
            href="/documents"
            className="flex items-center space-x-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition"
          >
            <span>View All Documents</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Main Upload Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative">
        {!uploadResult ? (
          <div>
            {/* Drag and Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 relative ${
                dragActive
                  ? 'border-sky-500 bg-sky-950/20 scale-[1.01]'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-950/40 hover:bg-slate-950/80'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleChange}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center space-y-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                  style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                >
                  <UploadCloud className="w-8 h-8" />
                </div>

                <div>
                  <p className="text-lg font-semibold text-white">
                    {selectedFile ? selectedFile.name : 'Click to upload or drag & drop document'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    Supports <span className="text-slate-200 font-medium">PDF, JPG, PNG</span> logistics paperwork up to <span className="text-slate-200 font-medium">25 MB</span>
                  </p>
                </div>

                <div className="flex items-center space-x-3 text-xs text-slate-400 pt-2">
                  <span className="flex items-center space-x-1 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>S3 Object Storage</span>
                  </span>
                  <span className="flex items-center space-x-1 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
                    <FileCheck className="w-3.5 h-3.5 text-sky-400" />
                    <span>Auto n8n OpenAI Workflow</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Selected File Details */}
            {selectedFile && !uploading && (
              <div className="mt-6 p-4 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={resetUpload}
                    className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    className="text-xs font-semibold px-5 py-2 rounded-xl text-white shadow-lg transition-transform hover:scale-105"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Start Upload & Trigger AI
                  </button>
                </div>
              </div>
            )}

            {/* Upload Progress Bar */}
            {uploading && (
              <div className="mt-6 space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-300">
                  <span>Uploading to storage & triggering n8n...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%`, backgroundColor: primaryColor }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-3 text-rose-300">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{errorMsg}</p>
                  <button
                    onClick={resetUpload}
                    className="mt-2 text-xs flex items-center space-x-1 text-rose-200 hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Try uploading again</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Processing & Success Card */
          <div className="text-center py-8 space-y-6">
            {processingAi ? (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-sky-500/20 text-sky-400 rounded-2xl flex items-center justify-center mx-auto shadow-xl ring-8 ring-sky-500/10 animate-pulse">
                  <Sparkles className="w-9 h-9 animate-spin" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Processing Document with AI...</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    n8n workflow is extracting canonical logistics fields with OpenAI. Redirecting to split-screen review...
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-xl ring-8 ring-emerald-500/10">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Extraction Complete</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Document processed. Loading review editor...
                  </p>
                </div>
              </div>
            )}

            {/* Document ID Badge Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 text-left max-w-lg mx-auto space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-xs text-slate-400 font-mono">Document ID</span>
                <span className="text-xs font-mono font-bold text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
                  {uploadResult.id}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Filename</span>
                  <span className="text-white font-medium truncate block">{uploadResult.fileName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Pipeline Status</span>
                  <span className="inline-block px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800 mt-0.5">
                    {uploadResult.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-4 pt-2">
              <Link
                href={`/documents/${uploadResult.id}/review`}
                className="px-6 py-3 text-white rounded-xl text-sm font-bold shadow-lg transition"
                style={{ backgroundColor: primaryColor }}
              >
                Go to Review & Edit Form
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
