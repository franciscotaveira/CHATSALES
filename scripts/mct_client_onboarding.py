#!/usr/bin/env python3
"""
MCT Client Onboarding & Provisioning Engine
Provisiona em 2 segundos: Pastas no Drive, Regras de Compliance no Postgres e Mensagem de Boas-Vindas
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import sys
import os
import json
import argparse
import datetime
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path

# Importar o gerenciador do Drive soberano
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from mct_drive_manager import GoogleDriveSovereign, MASTER_FOLDER_ID
except ImportError:
    from scripts.mct_drive_manager import GoogleDriveSovereign, MASTER_FOLDER_ID

RULES_TABLE = '"data_table_user_chkrulesv1taveira"'

def run_psql(query):
    cmd = [
        "docker", "exec", "-i", "plx-n8n-db",
        "psql", "-U", "plx_user", "-d", "plx_n8n", "-t", "-A", "-c", query
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql error: {res.stderr.strip()}")
    return res.stdout.strip()

def send_waha_message(chat_id, text):
    """Envia mensagem de boas-vindas via container WAHA na VPS"""
    try:
        payload = json.dumps({
            "session": "default",
            "chatId": chat_id,
            "text": text
        })
        cmd = [
            "docker", "exec", "-i", "sos-sales-waha",
            "curl", "-s", "-X", "POST", "http://localhost:3000/api/sendText",
            "-H", "Content-Type: application/json",
            "-d", payload
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0 and "id" in res.stdout:
            print(f"  📲 Mensagem de boas-vindas disparada no WhatsApp para {chat_id}!")
            return True
        else:
            print(f"  ⚠️ WAHA respondeu: {res.stdout.strip()}")
            return False
    except Exception as e:
        print(f"  ⚠️ Aviso ao disparar WAHA ({e}). O ambiente foi provisionado normalmente.")
        return False

def onboard_client(company_name, segment="construcao", group_id=None, contact_phone=None, client_email=None, works=None, team=None):
    print(f"\n🚀 [ONBOARDING] Iniciando integração do novo cliente: {company_name}...")
    
    # 1. Provisionar Google Drive
    drive = GoogleDriveSovereign()
    tree = drive.provision_construction_tree(company_name, active_works=works, team_members=team)
    company_folder_id = tree["company_folder_id"]
    view_url = tree["view_url"]
    
    # 2. Se cliente passou e-mail, compartilhar permissão de leitor/editor
    if client_email:
        print(f"  ✉️ Compartilhando acesso do Drive com: {client_email}...")
        try:
            perm_data = {
                "role": "reader",
                "type": "user",
                "emailAddress": client_email
            }
            drive._api_request(f"files/{company_folder_id}/permissions?sendNotificationEmail=true", method="POST", data=perm_data)
            print(f"  ✅ Permissão concedida com sucesso para {client_email}")
        except Exception as e:
            print(f"  ⚠️ Aviso ao compartilhar com e-mail: {e}")

    # 3. Semear regras no banco de dados da VPS (PostgreSQL plx_n8n)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    gid = group_id or (f"{contact_phone}@s.whatsapp.net" if contact_phone else "onboarding_pendente@g.us")
    
    rules = []
    if segment.lower() in ["construcao", "obras", "industrial", "engenharia"]:
        rules = [
            ("RULE-ENG-CND-FGTS", "cnd_fgts", "empresa", "mensal", 5, "Certidão de Regularidade do FGTS (CRF 30 dias)"),
            ("RULE-ENG-CNDT", "cndt", "empresa", "semestral", 15, "Certidão Negativa de Débitos Trabalhistas (CNDT)"),
            ("RULE-ENG-ASO", "aso", "colaborador", "anual", 15, "Atestado de Saúde Ocupacional (ASO Periódico)"),
            ("RULE-ENG-NR35", "nr35", "colaborador", "bienal", 20, "Certificado Treinamento NR-35 (Altura)"),
            ("RULE-ENG-NR33", "nr33", "colaborador", "anual", 20, "Certificado Treinamento NR-33 (Espaço Confinado)"),
            ("RULE-ENG-EPI", "ficha_epi", "colaborador", "semestral", 10, "Ficha de Entrega de EPI Assinada")
        ]
    else:  # Segmento Contábil / Geral
        rules = [
            ("RULE-CONT-NFE", "nf-e", "fiscal", "mensal", 5, "Notas Fiscais de Produto (NF-e)"),
            ("RULE-CONT-NFSE", "nfs-e", "fiscal", "mensal", 5, "Notas Fiscais de Serviço (NFS-e)"),
            ("RULE-CONT-BOLETO", "boleto", "contabil", "mensal", 10, "Boletos Pagos e Guias"),
            ("RULE-CONT-EXTRATO", "extrato", "contabil", "mensal", 5, "Extrato Bancário Mensal (PDF/OFX)")
        ]

    rules_added = 0
    for rule_id, doc_type, dept, cadence, due_day, notes in rules:
        scoped_rule_id = f"{rule_id}-{company_name[:6].upper().replace(' ', '')}"
        check = run_psql(f"SELECT count(*) FROM {RULES_TABLE} WHERE rule_id = '{scoped_rule_id}' AND group_id = '{gid}';")
        if int(check or 0) == 0:
            msg_tpl = f"Prezado cliente, lembramos do envio de {notes}. Prazo: dia {due_day}."
            sql = f"""
            INSERT INTO {RULES_TABLE} 
            (rule_id, business_name, business_match_key, group_id, document_type, department, cadence, due_day, reminder_days, active, send_enabled, message_template, notes, "createdAt", "updatedAt")
            VALUES 
            ('{scoped_rule_id}', '{company_name}', '{company_name}', '{gid}', '{doc_type}', '{dept}', '{cadence}', {due_day}, '[-15, -5]', true, false, '{msg_tpl}', '{notes}', '{now}', '{now}');
            """
            run_psql(sql)
            rules_added += 1

    print(f"  📋 Regras de compliance semeadas no PostgreSQL: {rules_added} regras ativas.")

    # 4. Mensagem de Boas-Vindas
    welcome_text = (
        f"🎉 *Ambiente Provisionado com Sucesso!*\n\n"
        f"🏢 *Empresa:* {company_name}\n"
        f"📂 *Repositório Soberano (Google Drive):*\n{view_url}\n\n"
        f"A partir de agora, você e sua equipe podem enviar fotos e PDFs de ASOs, NRs e comprovantes diretamente neste WhatsApp.\n"
        f"Nossa automação organizará tudo sozinho na pasta do colaborador e avisará antes de qualquer vencimento! 🛡️"
    )

    if group_id:
        send_waha_message(group_id, welcome_text)
    elif contact_phone:
        clean_phone = contact_phone.replace("+", "").replace("-", "").replace(" ", "")
        send_waha_message(f"{clean_phone}@c.us", welcome_text)

    result = {
        "status": "SUCCESS",
        "company_name": company_name,
        "segment": segment,
        "company_folder_id": company_folder_id,
        "view_url": view_url,
        "rules_active": len(rules),
        "welcome_message": welcome_text
    }
    
    print("\n" + json.dumps(result, indent=2, ensure_ascii=False))
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MCT Sovereign Client Onboarding")
    parser.add_argument("--name", required=True, help="Nome da empresa/cliente")
    parser.add_argument("--segment", default="construcao", choices=["construcao", "contabil", "geral"], help="Segmento de atuação")
    parser.add_argument("--group", default=None, help="ID do grupo de WhatsApp (ex: 120363xxx@g.us)")
    parser.add_argument("--phone", default=None, help="Telefone do responsável (ex: 554999999999)")
    parser.add_argument("--email", default=None, help="E-mail do cliente para compartilhamento do Drive")
    parser.add_argument("--works", nargs="*", default=None, help="Nomes das obras ativas")
    
    args = parser.parse_args()
    onboard_client(
        company_name=args.name,
        segment=args.segment,
        group_id=args.group,
        contact_phone=args.phone,
        client_email=args.email,
        works=args.works
    )
