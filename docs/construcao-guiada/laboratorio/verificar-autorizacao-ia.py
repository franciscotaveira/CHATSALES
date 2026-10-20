"""Verificação HTTP local. Usa apenas identidade sintética temporária no banco do laboratório."""
import base64, hashlib, hmac, json, subprocess, time, urllib.request, urllib.error, uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parent
BASE = "http://127.0.0.1:24400"
WS = "b1111111-1111-4111-8111-111111111111"
def http(path, token=None, payload=None, method=None):
    headers={"Content-Type":"application/json"}
    if token: headers["Authorization"]="Bearer "+token
    req=urllib.request.Request(BASE+path,headers=headers,data=json.dumps(payload).encode() if payload is not None else None,method=method)
    try:
        with urllib.request.urlopen(req,timeout=8) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
def sql(query):
    return subprocess.check_output(["docker","exec","chat-sales-guided-lab-postgres-1","psql","-U","lab_admin","-d","chat_sales_lab","-v","ON_ERROR_STOP=1","-c",query],text=True)
def decode(part):return json.loads(base64.urlsafe_b64decode(part+"="*(-len(part)%4)))
def enc(obj):return base64.urlsafe_b64encode(json.dumps(obj,separators=(",",":")).encode()).rstrip(b"=").decode()
status,login=http("/v1/auth/login",payload={"email":"operador@chat-sales.test","password":"Laboratorio-2026!"})
assert status==200,status
owner=login["token"]
status,before=http("/v1/workspaces/"+WS+"/ai-agent",owner)
assert status==200,status
config=before.get("config",before)
assert config["enabled"] is False,"Laboratório deve permanecer com IA desativada"
compose=json.loads((ROOT/"compose.json").read_text())
secret=compose["services"]["api"]["environment"]["JWT_SECRET"]
uid=str(uuid.uuid4()); email="permissao-lab-"+uid+"@chat-sales.test"
results=[]
try:
    sql(f"INSERT INTO users(id,email,name) VALUES ('{uid}','{email}','Teste temporário de permissão LAB'); INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES ('{WS}','{uid}','operator');")
    payload=decode(owner.split(".")[1]);payload.update(sub=uid,email=email,role="owner",iat=int(time.time()),exp=int(time.time())+120)
    unsigned=enc({"alg":"HS256","typ":"JWT"})+"."+enc(payload)
    signature=base64.urlsafe_b64encode(hmac.new(secret.encode(),unsigned.encode(),hashlib.sha256).digest()).rstrip(b"=").decode()
    operator=unsigned+"."+signature
    status,body=http("/v1/workspaces/"+WS+"/ai-agent",operator,{"enabled":True},"PUT")
    assert status==403,(status,body.get("title"))
    results.append({"case":"operator-membership-even-with-owner-token-claim","status":status})
    status,body=http("/v1/workspaces/"+WS+"/ai-agent",owner,{"enabled":False},"PUT")
    assert status==200,(status,body.get("title"))
    assert body["config"]["enabled"] is False
    results.append({"case":"owner-save-keeping-ai-disabled","status":status})
    status,after=http("/v1/workspaces/"+WS+"/ai-agent",owner)
    assert status==200
    assert after.get("config",after)["enabled"] is False
    results.append({"case":"read-back-ai-remains-disabled","status":status})
finally:
    sql(f"DELETE FROM workspace_memberships WHERE user_id='{uid}'; DELETE FROM users WHERE id='{uid}';")
    results.append({"case":"synthetic-identity-cleanup","completed":True})
(ROOT.parent/"evidencias/etapa-1b-http.json").write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
