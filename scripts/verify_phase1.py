import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "prisma", "dev.db")

def verify_phase1():
    print("================================================")
    print("PHASE 1 VERIFICATION — LOGISTICS DOC AUTOMATION")
    print("================================================")

    if not os.path.exists(DB_PATH):
        print("ERROR: Database file dev.db does not exist!")
        return False

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Verify tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall() if row[0] != "sqlite_sequence"]
    
    expected_tables = {
        "Customer", "User", "Document", "Extraction", 
        "ValidationResult", "ReviewTask", "Integration", 
        "WorkflowRun", "AuditLog"
    }

    print(f"Detected Tables ({len(tables)}): {', '.join(sorted(tables))}")
    
    missing = expected_tables - set(tables)
    if missing:
        print(f"ERROR: Missing expected tables: {missing}")
        return False
    print("✓ All 9 core database tables exist!")

    # 2. Verify Seed Data
    cursor.execute("SELECT COUNT(*) FROM Customer;")
    cust_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM User;")
    user_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM Integration;")
    int_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM AuditLog;")
    audit_count = cursor.fetchone()[0]

    print(f"Seed Data Summary:")
    print(f" - Customers: {cust_count}")
    print(f" - Users: {user_count}")
    print(f" - Integrations: {int_count}")
    print(f" - Audit Logs: {audit_count}")

    if cust_count > 0 and user_count > 0 and int_count > 0:
        print("✓ Seed data verified successfully!")
    else:
        print("ERROR: Seed data missing!")
        return False

    # 3. Verify Customer details & white-label config
    cursor.execute("SELECT name, code, primaryColor FROM Customer LIMIT 1;")
    cust = cursor.fetchone()
    print(f"✓ White-Label Customer Sample: {cust[0]} (Code: {cust[1]}, Primary Color Token: {cust[2]})")

    conn.close()
    print("================================================")
    print("PHASE 1 VERIFICATION PASSED SUCCESSFULLY! 🚀")
    print("================================================")
    return True

if __name__ == "__main__":
    verify_phase1()
