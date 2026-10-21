#!/usr/bin/env python3
import json
import time
import urllib.request
import urllib.parse
import jwt

with open('/opt/plx-documentos/credentials/google-service-account-mct.json') as f:
    sa = json.load(f)

now = int(time.time())
payload = {
    'iss': sa['client_email'],
    'scope': 'https://www.googleapis.com/auth/drive',
    'aud': sa['token_uri'],
    'exp': now + 3600,
    'iat': now
}

signed_jwt = jwt.encode(payload, sa['private_key'], algorithm='RS256')

data = urllib.parse.urlencode({
    'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    'assertion': signed_jwt
}).encode('utf-8')

req = urllib.request.Request(sa['token_uri'], data=data)
try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        token = res['access_token']
        print('✅ TOKEN OAUTH2 GERADO COM SUCESSO! Validade:', res.get('expires_in'), 'segundos')
        
        drive_req = urllib.request.Request('https://www.googleapis.com/drive/v3/files?pageSize=10', headers={
            'Authorization': f'Bearer {token}'
        })
        with urllib.request.urlopen(drive_req) as drive_resp:
            files_data = json.loads(drive_resp.read().decode())
            print('✅ CONEXAO COM GOOGLE DRIVE API V3 ESTABELECIDA!')
            files = files_data.get('files', [])
            print('Total de arquivos/pastas visiveis para a Service Account:', len(files))
            for item in files:
                name = item.get('name')
                fid = item.get('id')
                mime = item.get('mimeType')
                print(f"  📁 {name} [MIME: {mime}] (ID: {fid})")
except urllib.error.HTTPError as e:
    err_body = e.read().decode()
    print('❌ ERRO HTTP:', e.code, err_body)
except Exception as e:
    print('❌ ERRO GERAL:', e)
