/**
 * API helper for escalation workflows.
 *
 * Webhook URL resolution order (backend / server.py):
 *   1. MULTI_INVOICE_N8N_WEBHOOK_URL  (env)
 *   2. N8N_WEBHOOK_URL                (env)
 *   3. MULTI_INVOICE_WEBHOOK_URL      (constant, fallback)
 *      → https://n8n.provelopers.net/webhook/cfc18821-b562-4b0f-8d34-457f83e03f2e
 */

const API = '/api';

/**
 * Escalate a flagged invoice (Poor Image Quality / other issues).
 *
 * @param {string} docId       - The parent document ID.
 * @param {string} invoiceId   - The specific invoice identifier (or index).
 * @param {string} [notes='']  - Optional escalation notes from the reviewer.
 * @returns {Promise<object>}  - Resolved server response.
 */
export const escalateInvoice = async (docId, invoiceId, notes = '') => {
  const res = await fetch(`${API}/documents/${docId}/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId, notes }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Escalation failed');
  }
  return data;
};
