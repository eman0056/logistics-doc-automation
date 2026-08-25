'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock, UserCheck, ShieldAlert, ArrowRight, RefreshCw, Filter, FileText } from 'lucide-react';

export default function ReviewQueuePage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<any>(null);

  const fetchTasks = () => {
    setLoading(true);
    fetch('/api/review-tasks')
      .then((res) => res.json())
      .then((data) => {
        if (data.tasks) setTasks(data.tasks);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetch('/api/customer')
      .then((res) => res.json())
      .then((data) => {
        if (data.customer) setCustomer(data.customer);
      });
    fetchTasks();
  }, []);

  const pendingTasks = tasks.filter((t) => t.status === 'PENDING');
  const highPriorityTasks = pendingTasks.filter((t) => t.reason.toLowerCase().includes('validation failed') || t.reason.toLowerCase().includes('low confidence'));
  const resolvedTasks = tasks.filter((t) => t.status === 'RESOLVED' || t.status === 'APPROVED');

  const primaryColor = customer?.primaryColor || '#0284c7';

  return (
    <div className="space-y-8">
      {/* Top Banner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <span>Human-in-the-Loop Review Queue</span>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Exception Handler
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Review low-confidence extractions, correct validation errors, and authorize destination ERP submissions.
          </p>
        </div>

        <button
          onClick={fetchTasks}
          className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition flex items-center space-x-2 text-xs font-semibold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Quick Stats Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Pending Exceptions</span>
            <div className="text-2xl font-extrabold text-white mt-1">{pendingTasks.length} Tasks</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">High Priority Exceptions</span>
            <div className="text-2xl font-extrabold text-rose-400 mt-1">{highPriorityTasks.length} Urgent</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Resolved & Approved</span>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">{resolvedTasks.length} Completed</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Review Tasks Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-400" />
            <p className="text-sm">Loading review tasks...</p>
          </div>
        ) : pendingTasks.length === 0 ? (
          <div className="p-16 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">All Clear! No Pending Review Tasks</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mt-1">
                All ingested logistics documents passed automated validation or have been resolved by reviewers.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Document / File</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Reason for Review</th>
                  <th className="px-6 py-4">Assigned Reviewer</th>
                  <th className="px-6 py-4">Created Date</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pendingTasks.map((task) => {
                  const isHighPriority = task.reason.toLowerCase().includes('validation failed') || task.reason.toLowerCase().includes('low confidence');
                  const createdDate = new Date(task.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={task.id} className="hover:bg-slate-800/40 transition group">
                      <td className="px-6 py-4 font-medium text-white flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100">{task.document?.fileName || 'Document'}</div>
                          <div className="text-xs text-slate-500 font-mono">{task.document?.documentType || 'UNKNOWN'}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isHighPriority ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            HIGH
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            NORMAL
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs text-xs text-slate-300 truncate">
                        {task.reason}
                      </td>
                      <td className="px-6 py-4 text-xs flex items-center space-x-2 text-slate-300 mt-2">
                        <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                        <span>{task.assignedTo?.name || 'Lead Reviewer'}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                        {createdDate}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/review-tasks/${task.id}`}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow transition-transform hover:scale-105"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <span>Open Review</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
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
