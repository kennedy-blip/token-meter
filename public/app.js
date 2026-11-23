const $ = (id) => document.getElementById(id);
const state = { api:false, models:[], logs:[], budget:500, last:null };
const fmt = (n, digits=4) => new Intl.NumberFormat("en-US",{maximumFractionDigits:digits}).format(n||0);
const usd = (n, digits=6) => "$"+Number(n||0).toFixed(digits);
const fallbackModels = [
 {id:"frontier-reasoning",name:"Frontier Reasoning",tier:"Frontier",inputPer1M:5,outputPer1M:20,context:200000},
 {id:"balanced-fast",name:"Balanced Fast",tier:"Balanced",inputPer1M:.8,outputPer1M:3.2,context:128000},
 {id:"compact-edge",name:"Compact Edge",tier:"Compact",inputPer1M:.15,outputPer1M:.6,context:32000}
];
const fallbackLogs = [
 {tenant:"acme-support",workflow:"support-triage",requests:18420,spend:17.264},
 {tenant:"northstar-ai",workflow:"sql-copilot",requests:4210,spend:238},
 {tenant:"acme-support",workflow:"doc-summarizer",requests:8900,spend:28.32},
 {tenant:"studio-dev",workflow:"code-reviewer",requests:1620,spend:109}
];
function estimate(text){if(!text)return 0;const words=text.match(/[A-Za-z0-9_]+|[^\w\s]/gu)||[];let lexical=words.reduce((s,w)=>s+(/^\w/u.test(w)?Math.max(1,Math.ceil(w.length/4)):1),0);let code=(text.match(/[{}();=<>]|=>|::|\b(function|const|return|class|import|async|await)\b/g)||[]).length;return Math.max(1,Math.round(.72*lexical+.28*text.trim().split(/\s+/).length+.12*code))}
function offlineMeter(d){
 const model=state.models.find(x=>x.id===d.modelId)||fallbackModels[1],t={system:estimate(d.systemPrompt),history:d.historyTurns.reduce((n,x)=>n+estimate(x),0),prompt:estimate(d.userPrompt),completion:d.completionEstimate};
 t.input=t.system+t.history+t.prompt;t.total=t.input+t.completion;
 const inputCost=t.input*model.inputPer1M/1e6,outputCost=t.completion*model.outputPer1M/1e6,total=inputCost+outputCost,monthly=total*d.dailyRequests*30;
 const utilization=t.total/model.context*100,cheap=fallbackModels[2],alt=(t.input*cheap.inputPer1M+t.completion*cheap.outputPer1M)/1e6;
 const recommendations=[];
 if(t.history>Math.max(1200,t.input*.45))recommendations.push({severity:"warning",title:"History is driving prompt cost",detail:"Summarize older turns and retain only the last relevant exchanges.",saving:"Often reduces input tokens substantially"});
 if(t.system>1200)recommendations.push({severity:"warning",title:"System instructions look verbose",detail:"Move stable policy into concise rules and remove repeated examples.",saving:"Lower fixed cost on every request"});
 if(utilization>80)recommendations.push({severity:"critical",title:"Context window is nearing capacity",detail:"Trim retrieved context, deduplicate history, or split the task into stages.",saving:"Protects headroom for tool results"});
 if(model.id==="frontier-reasoning"&&t.total<12000)recommendations.push({severity:"success",title:"Consider a lighter model route",detail:"Benchmark a lighter model on this request before routing.",saving:"Up to "+(total?(100*(total-alt)/total).toFixed(0):0)+"% estimated savings"});
 if(!recommendations.length)recommendations.push({severity:"success",title:"Prompt profile looks balanced",detail:"No major context or cost inefficiency was detected by heuristic checks.",saving:"Keep monitoring real provider usage"});
 return {model:{...model},tokens:t,cost:{inputCostUsd:inputCost,outputCostUsd:outputCost,totalRequestCostUsd:total,monthlyProjectedUsd:monthly,budgetUsd:d.monthlyBudgetUsd,budgetPercent:d.monthlyBudgetUsd?monthly/d.monthlyBudgetUsd*100:null},context:{utilizationPercent:utilization,remainingTokens:Math.max(0,model.context-t.total)},analysis:{estimatedSavingsPercent:total?100*(total-alt)/total:0},recommendations};
}
async function api(path,body){const r=await fetch(path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||"API request failed");return data}
function renderPricing(){
 $("pricing-table").innerHTML=state.models.map(m=>'<tr><td>'+escapeHtml(m.name)+' <span class="tier">'+escapeHtml(m.tier||"Custom")+'</span></td><td>'+usd(m.inputPer1M,4)+'</td><td>'+usd(m.outputPer1M,4)+'</td><td>'+fmt(m.context)+'</td></tr>').join("");
 const selected=$("model").value;if(!state.models.some(m=>m.id===selected))$("model").value="balanced-fast";
}
function renderLogs(){
 const max=Math.max(...state.logs.map(x=>x.spend),1);
 $("tenant-logs").innerHTML=state.logs.map(x=>'<div class="tenant-row"><div><div class="tenant-name">'+escapeHtml(x.workflow)+'</div><div class="tenant-meta">'+escapeHtml(x.tenant)+' · '+fmt(x.requests)+' requests</div></div><div class="tenant-spend">'+usd(x.spend,2)+'</div><div class="tenant-track"><span style="width:'+Math.max(2,x.spend/max*100)+'%"></span></div></div>').join("");
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderBudget(){ $("budget-top").textContent=usd(state.budget,2); }
function collect(){return {systemPrompt:$("system").value,historyTurns:$("history").value.split(/\n+/).map(x=>x.trim()).filter(Boolean),userPrompt:$("prompt").value,completionEstimate:Number($("completion").value)||0,modelId:$("model").value,tenantId:$("tenant").value,workflowName:$("workflow").value,dailyRequests:Math.max(1,Number($("daily").value)||1),monthlyBudgetUsd:state.budget};}
function renderResult(r){
 state.last=r;$("results").classList.remove("hidden");
 $("total-tokens").textContent=fmt(r.tokens.total);$("token-sub").textContent=fmt(r.tokens.input)+" input · "+fmt(r.tokens.completion)+" output";
 $("request-cost").textContent=usd(r.cost.totalRequestCostUsd,6);$("monthly-cost").textContent=usd(r.cost.monthlyProjectedUsd,2);
 $("monthly-sub").textContent=fmt(r.projection?.dailyRequests||Number($("daily").value))+" calls/day · "+fmt(r.projection?.monthlyRequests||Number($("daily").value)*30)+" / month";
 $("context-use").textContent=fmt(r.context.utilizationPercent,1)+"%";$("context-sub").textContent=fmt(r.context.remainingTokens)+" tokens remaining";
 $("context-window").textContent=fmt(r.model.context)+" MAX";$("context-fill").style.width=Math.min(100,r.context.utilizationPercent)+"%";
 $("context-fill").style.background=r.context.utilizationPercent>90?"var(--rose)":r.context.utilizationPercent>75?"var(--amber)":"var(--cyan)";
 $("context-caption").textContent=fmt(r.tokens.total)+" / "+fmt(r.model.context)+" TOKENS";
 const layers=[["System",r.tokens.system,"#8b5cf6"],["History",r.tokens.history,"#06b6d4"],["Prompt",r.tokens.prompt,"#10b981"],["Completion",r.tokens.completion,"#f59e0b"]];
 $("stacked-bar").innerHTML=layers.map(x=>'<span style="width:'+(r.tokens.total?x[1]/r.tokens.total*100:0)+'%;background:'+x[2]+'"></span>').join("");
 $("legend").innerHTML=layers.map(x=>'<span class="legend-item"><i class="legend-dot" style="background:'+x[2]+'"></i>'+x[0]+' · '+fmt(x[1])+'</span>').join("");
 $("cost-rows").innerHTML='<div class="cost-row"><span>Input cost · '+fmt(r.tokens.input)+' tokens</span><strong>'+usd(r.cost.inputCostUsd,6)+'</strong></div><div class="cost-row"><span>Output cost · '+fmt(r.tokens.completion)+' tokens</span><strong>'+usd(r.cost.outputCostUsd,6)+'</strong></div><div class="cost-row"><span>Projected monthly vs budget</span><strong>'+usd(r.cost.monthlyProjectedUsd,2)+' / '+usd(state.budget,2)+'</strong></div>';
 $("recommendations").innerHTML=r.recommendations.map(x=>'<div class="recommendation '+(x.severity==="warning"?"warning":x.severity==="critical"?"critical":"")+'"><h4>'+escapeHtml(x.title)+'</h4><p>'+escapeHtml(x.detail)+'</p><small>'+escapeHtml(x.saving)+'</small></div>').join("");
 const over=r.cost.monthlyProjectedUsd>state.budget,near=r.context.utilizationPercent>80;
 $("health-badge").className="badge "+(over||near?"badge-warn":"badge-good");$("health-badge").textContent=over?"BUDGET OVERRUN":near?"CONTEXT PRESSURE":"WITHIN GUARDRAILS";
 $("results").scrollIntoView({behavior:"smooth",block:"start"});
}
async function analyze(){
 $("error").classList.add("hidden");$("analyze").disabled=true;$("analyze").textContent="Analyzing…";
 const d=collect();
 try{const result=state.api?await api("/api/meter",d):offlineMeter(d);renderResult(result)}
 catch(e){$("error").textContent=e.message+" · Showing local estimate instead.";$("error").classList.remove("hidden");renderResult(offlineMeter(d))}
 finally{$("analyze").disabled=false;$("analyze").innerHTML='Analyze tokens & cost <span>→</span>'}
}
async function loadCatalog(){
 try{const data=await api("/api/pricing");state.api=true;state.models=data.models;state.logs=data.logs;state.budget=data.monthlyBudgetUsd||500;$("engine-status").textContent="TokenMeter Engine: Active · Cost & Context Guard Ready";$("engine-detail").textContent="Python metering engine · API connected · Cost & Context Guard ready";$("mode-label").textContent="PYTHON API ONLINE"}
 catch{state.models=fallbackModels;state.logs=fallbackLogs;state.api=false;$("engine-status").textContent="TokenMeter Engine: Local fallback · API offline";$("engine-detail").textContent="Local estimator active · Start the Python API for server metering";$("mode-label").textContent="OFFLINE FALLBACK"}
 renderPricing();renderLogs();renderBudget();
}
$("analyze").addEventListener("click",analyze);
$("load-sample").addEventListener("click",()=>{$("system").value="You are an enterprise support agent. Always inspect every policy excerpt, prior conversation, account note, and historical ticket before responding. Explain every exception, include all relevant details, and never omit any caveat.\n".repeat(8);$("history").value=Array.from({length:24},(_,i)=>"Customer turn "+(i+1)+": I contacted support about my subscription, billing date, pause eligibility, renewal status, account history, and prior policy response. Please remember all previous details.").join("\n");$("prompt").value="Review the complete history and policy. Can this customer pause a subscription for two months? Provide the exact steps and explain every exception."; $("model").value="frontier-reasoning";$("completion").value=900;analyze()});
$("cheaper-route").addEventListener("click",()=>{$("model").value="compact-edge";analyze()});
$("budget-edit").addEventListener("click",()=>{$("budget-input").value=state.budget;$("budget-dialog").showModal()});
$("save-budget").addEventListener("click",async(e)=>{e.preventDefault();state.budget=Math.max(0,Number($("budget-input").value)||0);renderBudget();$("budget-dialog").close();try{if(state.api)await api("/api/pricing",{monthlyBudgetUsd:state.budget})}catch{}if(state.last)renderResult(offlineMeter(collect()))});
$("add-model").addEventListener("click",()=>$("model-dialog").showModal());
$("save-model").addEventListener("click",async(e)=>{e.preventDefault();const model={id:$("custom-id").value.trim(),name:$("custom-name").value.trim(),inputPer1M:Number($("custom-input").value),outputPer1M:Number($("custom-output").value),context:Number($("custom-context").value)};if(!model.id||!model.name||model.inputPer1M<0||model.outputPer1M<0||model.context<1000)return;try{if(state.api){const data=await api("/api/pricing",{model});state.models=data.models}else{state.models.push({...model,tier:"Custom"})}renderPricing();$("model").value=model.id;$("model-dialog").close()}catch(err){alert(err.message)}});
loadCatalog();
