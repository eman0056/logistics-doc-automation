import json

transcript_path = "/home/provelopers/snap/antigravity/5/.gemini/antigravity/brain/e1c42189-a10d-4d42-acd1-d9195a9beaf4/.system_generated/logs/transcript_full.jsonl"
with open(transcript_path, 'r') as f:
    for line in f:
        data = json.loads(line)
        if data.get('type') == 'PLANNER_RESPONSE':
            for call in data.get('tool_calls', []):
                if call.get('tool_name') == 'default_api:view_file':
                    print("Found view_file tool call", call)
        elif data.get('type') == 'TOOL_RESPONSE':
            content = data.get('content', '')
            if 'Showing lines 1 to 800' in content:
                print("Found content!", len(content))
