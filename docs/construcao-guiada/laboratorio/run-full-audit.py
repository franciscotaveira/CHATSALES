"""Run repository tests only against the dedicated disposable audit PostgreSQL/Redis.
A full run recreates only sos_sales_v3_test in the dedicated server; focused runs preserve it.
Does not load .env or start dispatch workers.
"""
import os,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[3]
env={k:os.environ[k] for k in ["PATH","HOME","TMPDIR","LANG","LC_ALL","PNPM_HOME","USER"] if k in os.environ}
env.update({"DOTENV_CONFIG_PATH":"/dev/null","NODE_ENV":"test","APP_ENV":"lab","TEST_DB_HOST":"127.0.0.1","TEST_DB_PORT":"55440","TEST_DB_NAME":"sos_sales_v3_test","TEST_ADMIN_USER":"sos_user","TEST_ADMIN_PASSWORD":"sos_secret_lab_2026","ALLOW_TEST_DB_ADMIN_OPERATIONS":"true","TEST_RUN_ID":"bootstrap","AUTH_PROVIDER":"local-jwt","AUTH_ISSUER":"sos-sales-test","AUTH_AUDIENCE":"sos-sales-api-test","JWT_SECRET":"synthetic_jwt_secret_for_isolated_audit_2026","MCT_CREDENTIALS_MASTER_KEY":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","REDIS_URL":"redis://127.0.0.1:56389","POSTGRES_DOCKER_CONTAINER":"chat-sales-full-audit-db"})
for prefix,role,password in [("", "sos_app_user","sos_app_secret_2026"),("MIGRATION_","sos_migration_owner","sos_migration_secret_2026"),("INGRESS_","sos_ingress_user","sos_ingress_secret_2026"),("WORKER_","sos_worker_user","sos_worker_secret_2026")]:
 env[prefix+"DATABASE_URL"]=f"postgresql://{role}:{password}@127.0.0.1:55440/sos_sales_v3_test?sslmode=disable"
if len(sys.argv)==1:
 bootstrap=subprocess.run(["pnpm","exec","tsx","scripts/test-db-runner.ts","bootstrap","sos_sales_v3_test"],cwd=root,env=env,capture_output=True,text=True)
 if bootstrap.returncode:
  print(bootstrap.stdout+bootstrap.stderr);sys.exit(bootstrap.returncode)
 print("Dedicated test database recreated; lab and production are separate.",flush=True)
cmd=["pnpm","exec","vitest","run","--no-file-parallelism","--hookTimeout=60000","--testTimeout=30000",*sys.argv[1:]]
log=root/"docs/construcao-guiada/evidencias/full-suite-current.log"
with log.open("w") as output:
 p=subprocess.run(cmd,cwd=root,env=env,stdout=output,stderr=subprocess.STDOUT,text=True)
print(log.read_text()[-9000:])
sys.exit(p.returncode)
