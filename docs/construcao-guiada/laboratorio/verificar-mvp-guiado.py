"""QA de laboratório: não ativa IA, não usa provedor e não envia mensagens."""
import json, urllib.request, urllib.error, subprocess
from pathlib import Path
BASE="http://127.0.0.1:24400"
WS="b1111111-1111-4111-8111-111111111111"
def http(path, token=None, payload=None, method=None):
 headers={"Content-Type":"application/json"}
 if token: headers["Authorization"]="Bearer "+token
 req=urllib.request.Request(BASE+path,headers=headers,data=json.dumps(payload).encode() if payload is not None else None,method=method)
 try:
  with urllib.request.urlopen(req,timeout=15) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
status,login=http("/v1/auth/login",payload={"email":"operador@chat-sales.test","password":"Laboratorio-2026!"})
assert status==200,status
token=login["token"]; url="/v1/workspaces/"+WS+"/guided-agent"; config="/v1/workspaces/"+WS+"/ai-agent"
status,before=http(config,token);assert status==200
assert before["config"]["enabled"] is False
status,loaded=http(url,token);assert status==200
revision=loaded["plan"]["revision"] if loaded["plan"] else 0
cases=["known","unknown","human","receipt","qualify"]
draft={"company":"LAB — Atendimento guiado", "objective":"qualify", "mode":"assist", "functions":["qualify"], "facts":"Empresa fictícia do laboratório. Atendimento de segunda a sexta, das 9h às 18h. Não há condições comerciais reais neste cadastro.", "qualification":"Interesse no serviço oferecido e região atendida confirmados na conversa.", "handoff":"Encaminhar à equipe comercial; fora do expediente, manter na fila sem prometer horário.", "customCases":[]}
status,result=http(url,token,{"expectedRevision":revision,"draft":draft},"PUT");assert status==200,(status,result)
revision=result["plan"]["revision"]; evidence=[]
evidence.append({"case":"save-real-database","revision":revision})
status,_=http(url,token,{"expectedRevision":revision-1,"draft":draft},"PUT");assert status==409
evidence.append({"case":"stale-write","status":status})
status,_=http(url+"/approve",token,{"expectedRevision":revision,"acknowledgeAssistedTestOnly":True},"POST");assert status==422
evidence.append({"case":"approval-without-reviews","status":status})
for scenario in cases:
 status,result=http(url+"/review",token,{"expectedRevision":revision,"scenarioId":scenario,"note":"Revisão QA sintética: expectativa do plano conferida para teste assistido; não comprova resposta de modelo ou ação externa."},"POST");assert status==200,(status,result)
status,approved=http(url+"/approve",token,{"expectedRevision":revision,"acknowledgeAssistedTestOnly":True},"POST");assert status==200
assert approved["plan"]["approvedRevision"]==revision
status,reload=http(url,token);assert status==200 and reload["plan"]["approvedRevision"]==revision
evidence.append({"case":"approved-plan-persists","revision":revision,"scope":"plan-for-assisted-test-only"})
status,changed=http(url,token,{"expectedRevision":revision,"draft":draft},"PUT");assert status==200
assert changed["plan"]["approvedRevision"] is None and changed["plan"]["reviews"]=={}
evidence.append({"case":"save-invalidates-review-and-approval","passed":True})
# Restore reviewed synthetic demonstration, still no activation.
revision=changed["plan"]["revision"]
for scenario in cases:
 status,_=http(url+"/review",token,{"expectedRevision":revision,"scenarioId":scenario,"note":"Revisão QA sintética do plano para demonstração assistida; modelo real e ações externas ainda não homologados."},"POST");assert status==200
assert http(url+"/approve",token,{"expectedRevision":revision,"acknowledgeAssistedTestOnly":True},"POST")[0]==200
assert http(url)[0]==401
other=url.replace(WS,"b2222222-2222-4222-8222-222222222222")
assert http(other,token)[0]==403
evidence.append({"case":"http-auth-boundaries","anonymous":401,"otherWorkspace":403})
# Actual application role: no tenant sees zero rows; different tenant cannot read/update/insert fixture.
sql=f"""BEGIN; SET LOCAL ROLE sos_app_user;
SELECT set_config('app.current_workspace_id', 'b2222222-2222-4222-8222-222222222222', true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.guided_agent_plans WHERE workspace_id='{WS}') THEN RAISE EXCEPTION 'RLS read failed'; END IF;
 UPDATE public.guided_agent_plans SET revision=revision+1 WHERE workspace_id='{WS}';
 IF FOUND THEN RAISE EXCEPTION 'RLS update failed'; END IF;
 BEGIN
 INSERT INTO public.guided_agent_plans(workspace_id,draft) VALUES ('{WS}','{{}}');
 RAISE EXCEPTION 'RLS insert failed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$; ROLLBACK;"""
r=subprocess.run(["docker","exec","-i","chat-sales-guided-lab-postgres-1","psql","-U","lab_admin","-d","chat_sales_lab","-v","ON_ERROR_STOP=1"],input=sql,text=True,capture_output=True)
assert r.returncode==0,r.stderr
evidence.append({"case":"real-role-rls","crossTenantReadUpdateInsertDenied":True})
status,after=http(config,token);assert status==200 and after==before
evidence.append({"case":"active-ai-configuration-unchanged","enabled":False,"externalCalls":0})
Path(__file__).resolve().parent.parent.joinpath("evidencias/mvp-http-db.json").write_text(json.dumps(evidence,indent=2))
print(json.dumps(evidence,indent=2))
