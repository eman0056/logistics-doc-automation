import sqlite3
import json
import uuid
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "prisma", "dev.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def init_db():
    print(f"Initializing SQLite database at: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("PRAGMA foreign_keys = ON;")

    # 1. Customer table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS Customer (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        logoUrl TEXT,
        primaryColor TEXT DEFAULT '#0284c7',
        secondaryColor TEXT DEFAULT '#0f172a',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. User table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS User (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'reviewer',
        customerId TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customerId) REFERENCES Customer(id) ON DELETE CASCADE
    );
    """)

    # 3. Document table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS Document (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL,
        fileName TEXT NOT NULL,
        fileSize INTEGER NOT NULL,
        mimeType TEXT NOT NULL,
        storagePath TEXT NOT NULL,
        documentType TEXT DEFAULT 'UNKNOWN',
        status TEXT DEFAULT 'INGESTED',
        overallConfidence REAL DEFAULT 0.0,
        invoiceGeneratedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customerId) REFERENCES Customer(id) ON DELETE CASCADE
    );
    """)

    # 4. Extraction table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS Extraction (
        id TEXT PRIMARY KEY,
        documentId TEXT UNIQUE NOT NULL,
        rawOcrText TEXT,
        canonicalJson TEXT NOT NULL,
        confidenceScores TEXT NOT NULL,
        finalSubmittedData TEXT,
        extractedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (documentId) REFERENCES Document(id) ON DELETE CASCADE
    );
    """)

    # Check and add missing columns if upgrading existing dev.db
    cursor.execute("PRAGMA table_info(Document);")
    doc_cols = [col[1] for col in cursor.fetchall()]
    if "invoiceGeneratedAt" not in doc_cols:
        cursor.execute("ALTER TABLE Document ADD COLUMN invoiceGeneratedAt DATETIME;")

    cursor.execute("PRAGMA table_info(Extraction);")
    ext_cols = [col[1] for col in cursor.fetchall()]
    if "finalSubmittedData" not in ext_cols:
        cursor.execute("ALTER TABLE Extraction ADD COLUMN finalSubmittedData TEXT;")

    # 5. ValidationResult table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ValidationResult (
        id TEXT PRIMARY KEY,
        documentId TEXT NOT NULL,
        ruleName TEXT NOT NULL,
        ruleType TEXT NOT NULL,
        passed INTEGER NOT NULL,
        severity TEXT DEFAULT 'ERROR',
        message TEXT NOT NULL,
        fieldName TEXT,
        detailsJson TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (documentId) REFERENCES Document(id) ON DELETE CASCADE
    );
    """)

    # 6. ReviewTask table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ReviewTask (
        id TEXT PRIMARY KEY,
        documentId TEXT NOT NULL,
        assignedToId TEXT,
        status TEXT DEFAULT 'PENDING',
        reason TEXT NOT NULL,
        correctionsJson TEXT,
        resolvedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (documentId) REFERENCES Document(id) ON DELETE CASCADE,
        FOREIGN KEY (assignedToId) REFERENCES User(id) ON DELETE SET NULL
    );
    """)

    # 7. Integration table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS Integration (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL,
        systemName TEXT NOT NULL,
        endpointUrl TEXT NOT NULL,
        authType TEXT DEFAULT 'BEARER',
        apiConfigJson TEXT NOT NULL,
        fieldMapJson TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customerId) REFERENCES Customer(id) ON DELETE CASCADE
    );
    """)

    # 8. WorkflowRun table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS WorkflowRun (
        id TEXT PRIMARY KEY,
        documentId TEXT NOT NULL,
        workflowName TEXT NOT NULL,
        stepName TEXT NOT NULL,
        status TEXT DEFAULT 'RUNNING',
        errorLog TEXT,
        startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME,
        FOREIGN KEY (documentId) REFERENCES Document(id) ON DELETE CASCADE
    );
    """)

    # 9. AuditLog table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS AuditLog (
        id TEXT PRIMARY KEY,
        documentId TEXT,
        userId TEXT,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        metadataJson TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (documentId) REFERENCES Document(id) ON DELETE SET NULL,
        FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL
    );
    """)

    conn.commit()
    print("Database schema successfully updated with Phase 5 columns!")
    conn.close()

if __name__ == "__main__":
    init_db()
