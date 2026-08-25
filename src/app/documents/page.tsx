'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Upload, FileText, Filter, Search, ArrowUpRight, Clock, ShieldCheck, FileSpreadsheet, RefreshCw } from 'lucide-react';

export default function DocumentsListPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [customer, setCustomer] = useState<any>(null);

  const fetchDocs = () => {
    setLoading(true);
    fetch('/api/documents')
      .then((res) => res.json())
      .then((data) => {
        if (data.documents) setDocuments(data.documents);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetch('/api/customer')
      .then((res) => res.json())
      .then((data) => {
        if (data.customer) setCustomer(data.customer);
      })
      .catch(() => {});
    fetchDocs();
  }, []);

  const getDocTypeBadge = (type: string) => {
    switch (type) {
      case 'BOL':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'POD':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'INVOICE':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'RATE_CONFIRMATION':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'INGESTED':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      case 'PREPROCESSED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'EXTRACTED':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'IN_REVIEW':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'FAILED':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) || doc.documentType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'ALL' || doc.documentType === typeFilter;
    return matchesSearch && matchesType;
  });

  const primaryColor = customer?.primaryColor || '#0284c7';

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Documents Repository</h1>
          <p className="text-sm text-slate-400">
            View, track status, and monitor ingested logistics paperwork and extractions.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchDocs}
            className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/documents/upload"
            className="flex items-center space-x-2 px-5 py-2.5 text-white font-semibold rounded-xl text-sm shadow-lg transition-transform hover:scale-105"
            style={{ backgroundColor: primaryColor }}
          >
            <Upload className="w-4 h-4" />
            <span>Upload New Document</span>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-lg">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by filename or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-sky-500 transition"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <Filter className="w-4 h-4 text-slate-400 mr-1 flex-shrink-0" />
          {['ALL', 'BOL', 'POD', 'INVOICE', 'RATE_CONFIRMATION'].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                typeFilter === type
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {type === 'ALL' ? 'All Document Types' : type}
            </button>
          ))}
        </div>
      </div>

      {/* Documents Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-400" />
            <p className="text-sm">Loading documents list...</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          /* Empty State Illustration */
          <div className="p-16 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">No Documents Found</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto mt-1">
                No logistics documents have been uploaded or match your current search filters.
              </p>
            </div>
            <Link
              href="/documents/upload"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition"
            >
              <Upload className="w-4 h-4 text-sky-400" />
              <span>Upload First Document</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">File Name</th>
                  <th className="px-6 py-4">Document Type</th>
                  <th className="px-6 py-4">Pipeline Status</th>
                  <th className="px-6 py-4">Size</th>
                  <th className="px-6 py-4">Uploaded At</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDocs.map((doc) => {
                  const createdDate = new Date(doc.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={doc.id} className="hover:bg-slate-800/40 transition group">
                      <td className="px-6 py-4 font-medium text-white flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100">{doc.fileName}</div>
                          <div className="text-xs text-slate-500 font-mono">{doc.id.substring(0, 8)}...</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${getDocTypeBadge(doc.documentType)}`}>
                          {doc.documentType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(doc.status)}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {(doc.fileSize / 1024).toFixed(1)} KB
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 flex items-center space-x-1 mt-2">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{createdDate}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xs text-sky-400 font-medium hover:underline inline-flex items-center space-x-1 cursor-pointer">
                          <span>View Pipeline</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
