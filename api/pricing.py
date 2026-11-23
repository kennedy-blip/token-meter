import json
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timezone

MODELS = [
    {"id":"frontier-reasoning","name":"Frontier Reasoning","tier":"Frontier","inputPer1M":5.00,"outputPer1M":20.00,"context":200000,"description":"Complex reasoning, agents, and high-stakes synthesis."},
    {"id":"balanced-fast","name":"Balanced Fast","tier":"Balanced","inputPer1M":0.80,"outputPer1M":3.20,"context":128000,"description":"General-purpose production workloads."},
    {"id":"compact-edge","name":"Compact Edge","tier":"Compact","inputPer1M":0.15,"outputPer1M":0.60,"context":32000,"description":"Classification, extraction, and short responses."}
]
LOGS = [
    {"tenant":"acme-support","workflow":"support-triage","model":"balanced-fast","requests":18420,"inputTokens":12840000,"outputTokens":2180000,"spend":17.264},
    {"tenant":"northstar-ai","workflow":"sql-copilot","model":"frontier-reasoning","requests":4210,"inputTokens":22400000,"outputTokens":6300000,"spend":238.0},
    {"tenant":"acme-support","workflow":"doc-summarizer","model":"balanced-fast","requests":8900,"inputTokens":18600000,"outputTokens":4200000,"spend":28.32},
    {"tenant":"studio-dev","workflow":"code-reviewer","model":"frontier-reasoning","requests":1620,"inputTokens":9400000,"outputTokens":3100000,"spend":109.0}
]
CUSTOM_BUDGET = 500.0
CUSTOM_MODELS = []

def send(handler, status, payload):
    body = json.dumps(payload).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send(self, 204, {})
    def do_GET(self):
        if self.path.split("?")[0] != "/api/pricing":
            return send(self, 404, {"error":"Not found"})
        send(self, 200, {"models":MODELS + CUSTOM_MODELS,"logs":LOGS,"monthlyBudgetUsd":CUSTOM_BUDGET,"currency":"USD","generatedAt":datetime.now(timezone.utc).isoformat()})
    def do_POST(self):
        global CUSTOM_BUDGET
        if self.path.split("?")[0] != "/api/pricing":
            return send(self, 404, {"error":"Not found"})
        try:
            length = min(int(self.headers.get("Content-Length","0")), 20000)
            data = json.loads(self.rfile.read(length) or b"{}")
            if "monthlyBudgetUsd" in data:
                budget = float(data["monthlyBudgetUsd"])
                if not 0 <= budget <= 100000000:
                    raise ValueError("Budget must be between 0 and 100,000,000 USD")
                CUSTOM_BUDGET = budget
            model = data.get("model")
            if model:
                mid = str(model.get("id","")).strip()
                name = str(model.get("name","")).strip()
                inp, out, ctx = float(model.get("inputPer1M",0)), float(model.get("outputPer1M",0)), int(model.get("context",0))
                if not mid or len(mid)>80 or not name or len(name)>100 or min(inp,out)<0 or max(inp,out)>100000 or ctx<1000 or ctx>10000000:
                    raise ValueError("Provide a valid model id, name, non-negative rates, and context window.")
                record = {"id":mid,"name":name,"tier":"Custom","inputPer1M":inp,"outputPer1M":out,"context":ctx,"description":"Custom pricing"}
                existing = next((i for i,x in enumerate(CUSTOM_MODELS) if x["id"]==mid),None)
                if existing is None: CUSTOM_MODELS.append(record)
                else: CUSTOM_MODELS[existing] = record
            return send(self, 200, {"ok":True,"models":MODELS+CUSTOM_MODELS,"monthlyBudgetUsd":CUSTOM_BUDGET})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            return send(self, 400, {"error":str(exc)})
    def log_message(self, format, *args):
        pass
