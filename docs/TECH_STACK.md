# Tech Stack

| Area | Stack |
|---|---|
| Frontend | React 18.3.1, Vite 5.4.21, React plugin 4.7.0. Routing is custom and uses the browser pathname (no routing library). Styling is plain CSS. Main additional library: PDF.js (`pdfjs-dist` 3.11.174). |
| Backend | Python 3.12.3. `api/index.py` uses FastAPI for Vercel serverless API routes; `server.py` is the standalone standard-library HTTP server, used for local development. Backend dependencies include FastAPI, Uvicorn, psycopg2, Requests, python-docx, pypdf, Pillow, and NumPy; `requirements.txt` does not pin their versions. |
| Database | Local: SQLite at `prisma/dev.db`. Production: Vercel Postgres, connected through `POSTGRES_URL` (or `DATABASE_URL`). |
| Hosting | Vercel serves the built frontend and runs `api/index.py` as serverless API functions. The Vite development server proxies API requests to standalone `server.py` locally. |
| External services | n8n webhooks orchestrate document processing. Workflow definitions use OpenAI for extraction, OCR.space for OCR, and include a Claude AI extraction workflow. |
