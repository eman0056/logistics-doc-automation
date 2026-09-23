import sqlite3
import json

conn = sqlite3.connect('prisma/dev.db')
cursor = conn.cursor()

# Get the first invoice extraction
cursor.execute("SELECT id, canonicalJson, finalSubmittedData FROM DocumentInvoice LIMIT 5")
rows = cursor.fetchall()

if not rows:
    print("No invoices found in DB")
else:
    for row in rows:
        print(f"\n--- Invoice ID {row[0]} ---")
        data = row[2] or row[1]
        if data:
            try:
                parsed = json.loads(data)
                print(json.dumps(parsed, indent=2)[:500] + "...\n")
                
                # Check for shipment details keys
                print("Keys:", list(parsed.keys()))
                
                for key in ['shipmentDetails', 'shipmentDetail', 'shipments', 'shipment']:
                    if key in parsed:
                        print(f"Found {key}!")
                        print(f"Type: {type(parsed[key])}")
                        if isinstance(parsed[key], list) and len(parsed[key]) > 0:
                            print(f"First item keys: {list(parsed[key][0].keys())}")
                            if 'chargeLineItems' in parsed[key][0]:
                                print(f"Nested chargeLineItems found! Type: {type(parsed[key][0]['chargeLineItems'])}")
                                if isinstance(parsed[key][0]['chargeLineItems'], list) and len(parsed[key][0]['chargeLineItems']) > 0:
                                    print(f"Nested first item keys: {list(parsed[key][0]['chargeLineItems'][0].keys())}")
                        elif isinstance(parsed[key], dict):
                            print(f"Item keys: {list(parsed[key].keys())}")
                            if 'chargeLineItems' in parsed[key]:
                                print(f"Nested chargeLineItems found! Type: {type(parsed[key]['chargeLineItems'])}")
            except Exception as e:
                print("Error parsing json", e)
conn.close()
