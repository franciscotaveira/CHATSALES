"""Apply the audited migrations only to the existing named synthetic lab, with a backup.
Not a deployment or production migration runner.
"""
from pathlib import Path
import subprocess,hashlib,json,datetime,os
root=Path(__file__).resolve().parents[3]
container='chat-sales-guided-lab-postgres-1'
psql=['docker','exec','-i',container,'psql','-U','lab_admin','-d','chat_sales_lab','-v','ON_ERROR_STOP=1','-At']
def sql(text):
 r=subprocess.run(psql,input=text,text=True,capture_output=True,check=True);return r.stdout.strip()
assert sql('SELECT current_database();')=='chat_sales_lab'
assert sql("SELECT count(*) FROM workspaces WHERE id='b1111111-1111-4111-8111-111111111111';")=='1'
backup=root/'docs/construcao-guiada/laboratorio/backups'/('before-full-audit-'+datetime.datetime.now().strftime('%Y%m%dT%H%M%S')+'.pgdump')
backup.parent.mkdir(parents=True,exist_ok=True)
with backup.open('wb') as out:subprocess.run(['docker','exec',container,'pg_dump','-U','lab_admin','-d','chat_sales_lab','-Fc'],stdout=out,check=True)
os.chmod(backup,0o600)
subprocess.run(['docker','exec','-i',container,'pg_restore','--list'],input=backup.read_bytes(),capture_output=True,check=True)
sql('CREATE SCHEMA IF NOT EXISTS lab_control; CREATE TABLE IF NOT EXISTS lab_control.applied_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());')
results=[]
for file in sorted((root/'packages/database/migrations').glob('*.sql')):
 if not 39<=int(file.name[:3])<=47:continue
 digest=hashlib.sha256(file.read_bytes()).hexdigest()
 existing=sql("SELECT sha256 FROM lab_control.applied_migrations WHERE name='"+file.name+"';")
 if existing:
  assert existing==digest,'Previously applied migration changed: '+file.name
  results.append({'file':file.name,'state':'already-applied','sha256':digest});continue
 sql('BEGIN;\n'+file.read_text()+"\nINSERT INTO lab_control.applied_migrations(name,sha256) VALUES('"+file.name+"','"+digest+"');\nCOMMIT;")
 results.append({'file':file.name,'state':'applied','sha256':digest})
report={'environment':'chat_sales_lab','backup':str(backup),'backupSha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'migrations':results,'productionChanged':False}
(root/'docs/construcao-guiada/evidencias/full-audit-lab-migrations.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'environment':report['environment'],'backupVerified':True,'migrations':len(results),'productionChanged':False}))
