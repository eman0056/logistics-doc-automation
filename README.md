# Logistics Document Automation

This is a complete backend and frontend solution for automating logistics document data extraction using OpenAI and n8n. 

## Features
- **Document Upload:** Upload multiple logistics documents (PDF/Images) simultaneously.
- **n8n Webhook Integration:** Asynchronously triggers n8n webhooks for extraction.
- **Batch Review (Human-in-the-Loop):** Consolidated review interface to approve or modify extracted JSON data before final processing.
- **Consolidated Invoicing:** Generates a clean, classic black-and-white style PDF/HTML invoice containing data from all uploaded documents in a single view.
- **Vercel Ready:** Built with FastAPI, ready to be deployed as Serverless Functions on Vercel.

## Vercel Deployment Instructions

1. Deploy this repository to Vercel.
2. In the Vercel Dashboard, go to **Settings > Environment Variables** and add:
   - `N8N_WEBHOOK_URL` (Your n8n POST webhook URL)
   - `APP_BASE_URL` (Your Vercel App URL, e.g., `https://my-app.vercel.app`)
   - `OPENAI_API_KEY` (If needed for your custom extraction logic)
3. Go to the **Storage** tab and create a **Vercel Postgres** database. This will automatically add `POSTGRES_URL` to your environment.
4. *Note:* Make sure to configure cloud storage (like Vercel Blob) for PDF uploads, as Vercel functions cannot store files locally.

## Local Development
To run this locally:
```bash
pip install -r requirements.txt
uvicorn api.index:app --reload --port 3000
```
