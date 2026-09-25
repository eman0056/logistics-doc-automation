import React, { useState } from 'react';
import { escalateInvoice } from './api.js';

/**
 * EscalationModal – captures optional escalation notes and submits
 * the escalation request for a flagged (Poor Image Quality) invoice.
 *
 * Props:
 *  - docId       {string}   Parent document ID
 *  - invoiceId   {string}   Invoice identifier (ID or index)
 *  - invoiceLabel {string}  Human-readable invoice label (e.g. "Invoice #3")
 *  - onClose     {function} Called when the modal should close
 *  - onSuccess   {function} Called after a successful escalation with response data
 */
export const EscalationModal = ({ docId, invoiceId, invoiceLabel, onClose, onSuccess }) => {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await escalateInvoice(docId, invoiceId, notes);
      if (onSuccess) onSuccess(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Escalation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose();
    }
  };

  return (
    <div className="escalation-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="escalation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="escalation-modal-title"
      >
        {/* Header */}
        <div className="escalation-modal-header">
          <div>
            <h2 id="escalation-modal-title" className="escalation-modal-title">
              Escalate Invoice
            </h2>
            <p className="escalation-modal-subtitle">
              {invoiceLabel || 'Flagged Invoice'} — Poor Image Quality
            </p>
          </div>
          <button
            type="button"
            className="escalation-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close escalation dialog"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="escalation-modal-body">
          <label className="escalation-modal-label" htmlFor="escalation-notes">
            Escalation Notes <span className="escalation-optional">(optional)</span>
          </label>
          <textarea
            id="escalation-notes"
            className="escalation-modal-textarea"
            placeholder="Describe the issue, attach context, or leave blank to escalate immediately..."
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
          />

          {error && (
            <div className="escalation-modal-error">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="escalation-modal-footer">
          <button
            type="button"
            className="secondary-btn"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="escalation-submit-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="escalation-spinner" /> Submitting…
              </>
            ) : (
              '🚨 Submit Escalation'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
