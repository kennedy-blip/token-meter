import json, math, re
from http.server import BaseHTTPRequestHandler

MODELS = {
 "frontier-reasoning":{"inputPer1M":5.0,"outputPer1M":20.0,"context":200000,"name":"Frontier Reasoning"},
 "balanced-fast":{"inputPer1M":0.8,"outputPer1M":3.2,"context":128000,"name":"Balanced Fast"},
 "compact-edge":{"inputPer1M":0.15,"outputPer1M":0.6,"context":32000,"name":"Compact Edge"}
}
CUSTOM = {}

def estimate_tokens(value):
    text = str(value or "")
    if not text: return 0
    # Blend lexical, punctuation, and character heuristics to approximate subword tokenization.
    words = re.findall(r"[A-Za-z0-9_]+|[^\w\s]", text, flags=re.UNICODE)
    lexical = sum(max(1, math.ceil(len(w)/4.0)) if re.match(r"\w",w) else 1 for w in words)
    whitespace = len(text.split())
    code_marks = len(re.findall(r"[{}();=<>]|=>|::|\b(function|const|return|class|import|async|await)\b",text))
    return max(1, round(0.72*lexical + 0.28*whitespace + 0.12*code_marks))

def reply(h, status, payload):
    raw=json.dumps(payload).encode()
    h.send_response(status); h.send_header("Content-Type","application/json; charset=utf-8")
    h.send_header("Cache-Control","no-store"); h.send_header("Access-Control-Allow-Origin","*")
    h.send_header("Access-Control-Allow-Headers","Content-Type"); h.send_header("Access-Control-Allow-Methods","POST, OPTIONS")
    h.end_headers(); h.wfile.write(raw)

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self): reply(self,204,{})
    def do_POST(self):
        if self.path.split("?")[0]!="/api/meter": return reply(self,404,{"error":"Not found"})
        try:
            size=min(int(self.headers.get("Content-Length","0")),1000000)
            d=json.loads(self.rfile.read(size) or b"{}")
            sys=d.get("systemPrompt",""); history=d.get("historyTurns",[]); prompt=d.get("userPrompt","")
            if not isinstance(history,list): raise ValueError("historyTurns must be an array of strings.")
            if not all(isinstance(x,str) for x in history): raise ValueError("Each history turn must be text.")
            if not all(isinstance(x,str) for x in [sys,prompt]): raise ValueError("Prompts must be text.")
            if sum(map(len,[sys,prompt]))+sum(map(len,history))>900000: raise ValueError("Prompt payload is too large.")
            completion=max(0,min(1000000,int(d.get("completionEstimate",500))))
            model_id=str(d.get("modelId","balanced-fast"))
            model=MODELS.get(model_id) or CUSTOM.get(model_id)
            if not model: raise ValueError("Unknown model. Refresh the pricing catalog.")
            system_tokens=estimate_tokens(sys); history_tokens=sum(estimate_tokens(x) for x in history)
            prompt_tokens=estimate_tokens(prompt); input_tokens=system_tokens+history_tokens+prompt_tokens
            total_tokens=input_tokens+completion; context=int(model["context"])
            input_cost=input_tokens*float(model["inputPer1M"])/1_000_000
            output_cost=completion*float(model["outputPer1M"])/1_000_000
            total=input_cost+output_cost
            daily=max(1,min(10000000,int(d.get("dailyRequests",1000))))
            monthly=total*daily*30
            budget=max(0,float(d.get("monthlyBudgetUsd",500)))
            utilization=total_tokens/context*100
            savings=0
            if model_id!="compact-edge":
                cheap=MODELS["compact-edge"]
                alt=(input_tokens*cheap["inputPer1M"]+completion*cheap["outputPer1M"])/1_000_000
                savings=max(0,(total-alt)/total*100) if total else 0
            recommendations=[]
            if history_tokens>max(1200,input_tokens*.45):
                recommendations.append({"severity":"warning","title":"History is driving prompt cost","detail":"Summarize older turns and retain only the last relevant exchanges.","saving":"Often reduces input tokens substantially"})
            if system_tokens>1200:
                recommendations.append({"severity":"warning","title":"System instructions look verbose","detail":"Move stable policy into concise rules and remove repeated examples.","saving":"Lower fixed cost on every request"})
            if utilization>80:
                recommendations.append({"severity":"critical","title":"Context window is nearing capacity","detail":"Trim retrieved context, deduplicate history, or split the task into stages.","saving":"Protects headroom for tool results"})
            if model_id=="frontier-reasoning" and total_tokens<12000:
                recommendations.append({"severity":"success","title":"Consider a lighter model route","detail":"This request is relatively small; benchmark Balanced Fast or Compact Edge before routing.","saving":f"Up to {savings:.0f}% estimated cost reduction"})
            if not recommendations:
                recommendations.append({"severity":"success","title":"Prompt profile looks balanced","detail":"No major context or cost inefficiency was detected by the heuristic checks.","saving":"Keep monitoring real provider usage"})
            return reply(self,200,{"model":{"id":model_id,"name":model["name"],"context":context},"tokens":{"system":system_tokens,"history":history_tokens,"prompt":prompt_tokens,"completion":completion,"input":input_tokens,"total":total_tokens},"cost":{"inputCostUsd":round(input_cost,8),"outputCostUsd":round(output_cost,8),"totalRequestCostUsd":round(total,8),"monthlyProjectedUsd":round(monthly,4),"budgetUsd":budget,"budgetPercent":round(monthly/budget*100,2) if budget else None},"context":{"utilizationPercent":round(utilization,2),"remainingTokens":max(0,context-total_tokens)},"projection":{"dailyRequests":daily,"monthlyRequests":daily*30},"analysis":{"contextBloat":history_tokens>max(1200,input_tokens*.45),"overProvisioned":model_id=="frontier-reasoning" and total_tokens<12000,"estimatedSavingsPercent":round(savings,1)},"recommendations":recommendations})
        except (ValueError,TypeError,json.JSONDecodeError) as exc: return reply(self,400,{"error":str(exc)})
    def log_message(self,format,*args): pass
