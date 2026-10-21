#!/usr/bin/env python3
"""
MCT Soberano Google Drive Manager
Gerenciamento de Pastas, Uploads e Árvore Documental no Google Drive via Service Account
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import jwt

CREDENTIALS_PATH = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "/opt/plx-documentos/credentials/google-service-account-mct.json")
MASTER_FOLDER_ID = "1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4"  # Pasta 'MCT Clientes'

class GoogleDriveSovereign:
    def __init__(self, credentials_path=CREDENTIALS_PATH):
        if not os.path.exists(credentials_path):
            raise FileNotFoundError(f"Credenciais não encontradas em: {credentials_path}")
        with open(credentials_path, "r", encoding="utf-8") as f:
            self.sa = json.load(f)
        self.token = None
        self.token_expiry = 0

    def get_token(self):
        now = int(time.time())
        if self.token and now < self.token_expiry - 60:
            return self.token

        payload = {
            "iss": self.sa["client_email"],
            "scope": "https://www.googleapis.com/auth/drive",
            "aud": self.sa["token_uri"],
            "exp": now + 3600,
            "iat": now
        }
        signed_jwt = jwt.encode(payload, self.sa["private_key"], algorithm="RS256")
        data = urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": signed_jwt
        }).encode("utf-8")

        req = urllib.request.Request(self.sa["token_uri"], data=data)
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode())
            self.token = res["access_token"]
            self.token_expiry = now + res.get("expires_in", 3600)
            return self.token

    def _api_request(self, endpoint, method="GET", data=None, headers=None):
        token = self.get_token()
        h = {"Authorization": f"Bearer {token}"}
        if headers:
            h.update(headers)

        body = None
        if data is not None:
            if isinstance(data, dict):
                body = json.dumps(data).encode("utf-8")
                h["Content-Type"] = "application/json; charset=UTF-8"
            else:
                body = data

        req = urllib.request.Request(f"https://www.googleapis.com/drive/v3/{endpoint}", headers=h, data=body, method=method)
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())

    def get_or_create_folder(self, folder_name, parent_id):
        """Busca se a pasta já existe dentro do parent_id; se não existir, cria."""
        query = f"name = '{folder_name}' and '{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        encoded_q = urllib.parse.quote(query)
        res = self._api_request(f"files?q={encoded_q}&fields=files(id,name)")
        files = res.get("files", [])
        if files:
            return files[0]["id"]

        metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id]
        }
        created = self._api_request("files?fields=id,name", method="POST", data=metadata)
        return created["id"]

    def provision_construction_tree(self, company_name, active_works=None, team_members=None):
        """
        Cria a estrutura de pastas canônica de compliance para a construtora:
        /[MCT Clientes]/[Empresa]/
          ├── 00_Dossie_Geral_Empresa/
          │   ├── CNDs_e_Certidoes/
          │   ├── Programas_Seguranca_PGR_PCMSO/
          │   └── Seguros_e_Contratos/
          ├── 01_Obras_Ativas/
          ├── 02_Colaboradores/
          └── 99_Quarentena_Revisao_Manual/
        """
        print(f"🏗️  [DRIVE-PROVISION] Provisionando árvore para: {company_name}...")
        company_folder_id = self.get_or_create_folder(company_name, MASTER_FOLDER_ID)
        print(f"  📁 Pasta da Empresa: {company_name} (ID: {company_folder_id})")

        # Pastas Raiz da Empresa
        dossie_id = self.get_or_create_folder("00_Dossie_Geral_Empresa", company_folder_id)
        self.get_or_create_folder("CNDs_e_Certidoes", dossie_id)
        self.get_or_create_folder("Programas_Seguranca_PGR_PCMSO", dossie_id)
        self.get_or_create_folder("Seguros_e_Contratos", dossie_id)

        obras_id = self.get_or_create_folder("01_Obras_Ativas", company_folder_id)
        if active_works:
            for obra in active_works:
                obra_id = self.get_or_create_folder(obra, obras_id)
                print(f"    👷 Pasta Obra: {obra} (ID: {obra_id})")

        colabs_id = self.get_or_create_folder("02_Colaboradores", company_folder_id)
        if team_members:
            for member in team_members:
                folder_name = f"{member['nome']} - CPF {member['cpf'].replace('.', '').replace('-', '')}"
                cid = self.get_or_create_folder(folder_name, colabs_id)
                print(f"    👤 Pasta Colaborador: {member['nome']} (ID: {cid})")

        quarantine_id = self.get_or_create_folder("99_Quarentena_Revisao_Manual", company_folder_id)

        tree = {
            "company_folder_id": company_folder_id,
            "dossie_folder_id": dossie_id,
            "obras_folder_id": obras_id,
            "colaboradores_folder_id": colabs_id,
            "quarentena_folder_id": quarantine_id,
            "view_url": f"https://drive.google.com/drive/folders/{company_folder_id}"
        }
        print(f"\n✅ Árvore completa provisionada com sucesso!")
        print(f"🔗 Link de Acesso da Empresa: {tree['view_url']}")
        return tree

if __name__ == "__main__":
    drive = GoogleDriveSovereign()
    
    sample_works = [
        "Obra_Aurora_Coop_Chapeco",
        "Obra_BRF_Marau"
    ]
    sample_team = [
        {"nome": "Joao da Silva", "cpf": "012.345.678-90"},
        {"nome": "Carlos Eduardo Santos", "cpf": "234.567.890-12"},
        {"nome": "Marcos Antonio Pereira", "cpf": "345.678.901-23"}
    ]
    
    drive.provision_construction_tree("Construtora Piloto (Obras Industriais)", sample_works, sample_team)
