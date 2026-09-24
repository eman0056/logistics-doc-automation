import json
import re

transcript_path = "/home/provelopers/snap/antigravity/5/.gemini/antigravity/brain/e1c42189-a10d-4d42-acd1-d9195a9beaf4/.system_generated/logs/transcript_full.jsonl"
out_path = "/home/provelopers/Downloads/docs/logistics-doc-automation/frontend/src/MultiInvoiceViews.jsx"

content = ""
with open(transcript_path, 'r') as f:
    for line in f:
        data = json.loads(line)
        if data.get('type') == 'TOOL_RESPONSE':
            # tool responses are stored in content string or parsed somehow?
            output = data.get('content', '')
            if "File Path: `file:///home/provelopers/Downloads/docs/logistics-doc-automation/frontend/src/MultiInvoiceViews.jsx`" in output:
                lines = output.split('\\n') if '\\n' in output else output.split('\n')
                code_lines = []
                for l in lines:
                    match = re.match(r'^\d+:\s(.*)', l)
                    if match:
                        code_lines.append(match.group(1))
                    elif l.strip() == "1:":
                        code_lines.append("")
                
                content = '\n'.join(code_lines)
                break

if content:
    with open(out_path, 'w') as f:
        f.write(content)
    print("Recovered MultiInvoiceViews.jsx")
else:
    print("Could not find content")
