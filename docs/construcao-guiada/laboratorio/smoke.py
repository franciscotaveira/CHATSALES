"""Smoke local de leitura; não envia mensagens ou chama provedores."""
import json, urllib.request, urllib.error
from pathlib import Path
BASE = "http://127.0.0.1:24400"
WS = "b1111111-1111-4111-8111-111111111111"
THREAD = "f1111111-1111-4111-8111-111111111111"
def request(path, token=None, body=None):
    headers = {"Content-Type": "application/json", "X-Workspace-Id": WS}
    if token: headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE+path, data=json.dumps(body).encode() if body else None, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r: return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try: data=json.load(e)
        except Exception: data={"error":"non-json"}
        return e.code,data
status, login = request("/v1/auth/login", body={"email":"operador@chat-sales.test", "password":"Laboratorio-2026!"})
assert status == 200, (status, list(login))
token=login["token"]
paths=["/health","/ready","/v1/me"]
base="/v1/workspaces/"+WS
paths += [base+s for s in ["","/members","/channels","/contacts","/journeys","/conversions","/products","/templates","/flows","/ai-agent","/ai-agent/niche-playbooks","/webhooks","/broadcasts/preflight","/broadcasts/audience-count?type=ALL_CONTACTS","/broadcasts/campaigns","/integrations/candidates","/integrations/suggestions","/integrations/suggestions/count","/threads"]]
paths += [base+"/threads/"+THREAD+s for s in ["/messages","/actions","/proposals","/pix-charges","/journey"]]
results=[]
for path in paths:
    status,data=request(path,token)
    row={"path":path,"status":status,"keys":list(data) if isinstance(data,dict) else [],"counts":{k:len(v) for k,v in data.items() if isinstance(v,list)} if isinstance(data,dict) else {}}
    if status>=400: row["error"]=data
    results.append(row)
for path in [base+"/contacts", "/v1/workspaces/b2222222-2222-4222-8222-222222222222/contacts"]:
    status,data=request(path,token if "b222" in path else None)
    results.append({"path":path,"case":"other-workspace" if "b222" in path else "no-auth","status":status})
Path(__file__).parent.parent.joinpath("evidencias/api-smoke.json").write_text(json.dumps(results,indent=2,ensure_ascii=False))
for r in results: print(r["status"],r.get("case",""),r["path"],r.get("counts",{}),r.get("error",{}))
