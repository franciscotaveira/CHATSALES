"""API verification on the named synthetic lab only; no provider calls or dispatch worker."""
import json,urllib.request,urllib.error,datetime,re,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
BASE='http://127.0.0.1:24400';WS='b1111111-1111-4111-8111-111111111111';THREAD='f1111111-1111-4111-8111-111111111111'
token=None;results=[]
def request(path,method='GET',body=None,expected=200):
 headers={'Content-Type':'application/json','X-Workspace-Id':WS}
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=15) as r:status,data=r.status,json.load(r)
 except urllib.error.HTTPError as e:status,data=e.code,json.load(e)
 assert status==expected, (path,status,data.get('detail'))
 return data
login=request('/v1/auth/login','POST',{'email':'operador@chat-sales.test','password':'Laboratorio-2026!'})
token=login['token'];base='/v1/workspaces/'+WS
assert 'LAB' in request(base)['workspace']['name'].upper()
labels=request(base+'/commercial/stage-labels')
changed=request(base+'/commercial/stage-labels','PUT',{'expectedVersion':labels['version'],'labels':{**labels['labels'],'lead':'Novos contatos — LAB'}})
assert request(base+'/commercial/stage-labels')['labels']['lead']=='Novos contatos — LAB'
request(base+'/commercial/stage-labels','PUT',{'expectedVersion':labels['version'],'labels':{}},409)
request(base+'/commercial/stage-labels','PUT',{'expectedVersion':changed['version'],'labels':labels['labels']})
results.append({'case':'shared-stage-labels-save-conflict-restore','passed':True})
endpoint=base+'/threads/'+THREAD+'/actions'
current=request(endpoint)
assert current['openAction'] is None,'Existing open task must be reviewed rather than overwritten'
now=datetime.datetime.now(datetime.timezone.utc)
task=request(endpoint,'POST',{'title':'SIMULADO — revisão funcional completa','dueAt':(now+datetime.timedelta(days=1)).isoformat().replace('+00:00','Z'),'origin':'manual'},201)['action']
action=base+'/actions/'+task['id']
request(action,'PATCH',{'action':'reschedule','newDueAt':(now+datetime.timedelta(days=2)).isoformat().replace('+00:00','Z'),'reason':'SIMULADO — validar reagendamento'})
assert len(request(action+'/history')['history'])>=2
assert request(action,'PATCH',{'action':'complete'})['action']['status']=='completed'
assert any(a['id']==task['id'] and a['status']=='completed' for a in request(endpoint)['actions'])
results.append({'case':'task-create-reschedule-history-complete-persist','passed':True,'actionId':task['id']})
# The four seed offers were introduced automatically during the initial lab walkthrough.
# Keep them recoverable, explicitly simulated and inactive; preserve the independently created test item.
seed={'SOS-PRO-ANUAL','SOS-MENTORIA-VIP','SOS-SETUP-WABA','SOS-ACADEMY-FECHAMENTO'}
for product in request(base+'/products')['products']:
 if product['retailerId'] not in seed:continue
 product['status']='INACTIVE';product['title']='SIMULADO — '+product['title'] if not product['title'].startswith('SIMULADO') else product['title']
 request(base+'/products','POST',product,201)
assert all(p['status']=='INACTIVE' and p['title'].startswith('SIMULADO') for p in request(base+'/products')['products'] if p['retailerId'] in seed)
results.append({'case':'legacy-lab-seed-offers-labelled-and-disabled','passed':True})
assert all(t['status']!='APPROVED' for t in request(base+'/templates')['templates'])
assert all(f['status']!='PUBLISHED' for f in request(base+'/flows')['flows'] if f['metaFlowId'].startswith('meta_flow_'))
results.append({'case':'local-templates-and-demo-flows-not-provider-approved','passed':True})
with urllib.request.urlopen('http://127.0.0.1:23400/',timeout=15) as r:html=r.read().decode()
asset=re.search(r'src="([^"]+\.js)"',html).group(1)
with urllib.request.urlopen('http://127.0.0.1:23400'+asset,timeout=15) as r:served=r.read()
local=(ROOT/'apps/web/dist-lab'/asset.lstrip('/')).read_bytes()
assert hashlib.sha256(served).digest()==hashlib.sha256(local).digest()
results.append({'case':'served-frontend-matches-current-build','passed':True,'asset':asset,'sha256':hashlib.sha256(served).hexdigest()})
report={'environment':'chat_sales_lab','providerCalls':0,'dispatchWorkerStarted':False,'checks':results,'visualVerification':'blocked: in-app browser webview did not attach'}
(ROOT/'docs/construcao-guiada/evidencias/full-audit-lab-functional.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(report,ensure_ascii=False))
