#!/usr/bin/env python3
"""
MCT Soberano — Agente Secretário Executivo no Telegram
Gerenciamento de Workflows n8n, Onboarding de Clientes e Sentinela de Obras
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import os
import sys
import time
import json
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path

# Configurações do Bot
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ADMIN_USER_ID = os.environ.get("TELEGRAM_ADMIN_ID", "")  # Se vazio, trava no primeiro usuário autorizado

BASE_DIR = Path("/opt/plx-documentos/app/scripts")
if not BASE_DIR.exists():
    BASE_DIR = Path(__file__).resolve().parent

def api_telegram(method, data=None):
    if not TELEGRAM_BOT_TOKEN:
        raise ValueError("TELEGRAM_BOT_TOKEN não configurado.")
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def send_message(chat_id, text, parse_mode="Markdown"):
    data = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": False
    }
    try:
        return api_telegram("sendMessage", data)
    except Exception as e:
        print(f"Erro ao enviar mensagem Telegram: {e}")
        # Tenta sem parse_mode se falhar por escape de markdown
        data.pop("parse_mode", None)
        try:
            return api_telegram("sendMessage", data)
        except Exception:
            return None

def get_vps_status():
    mem = subprocess.run(["free", "-h"], capture_output=True, text=True).stdout
    disk = subprocess.run(["df", "-h", "/"], capture_output=True, text=True).stdout
    uptime = subprocess.run(["uptime", "-p"], capture_output=True, text=True).stdout
    containers = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}} ({{.Status}})"],
        capture_output=True, text=True
    ).stdout.strip().splitlines()

    mem_lines = mem.strip().splitlines()
    disk_lines = disk.strip().splitlines()
    
    msg = (
        "🖥️ *STATUS DA MOTHERSHIP VPS*\n"
        f"⏱️ *Uptime:* {uptime.strip()}\n\n"
        f"🧠 *Memória RAM:*\n`{mem_lines[1] if len(mem_lines) > 1 else ''}`\n\n"
        f"💾 *Disco NVMe:*\n`{disk_lines[1] if len(disk_lines) > 1 else ''}`\n\n"
        f"🐳 *Containers Ativos ({len(containers)}):*\n"
    )
    for c in containers[:8]:
        msg += f"  • `{c}`\n"
    if len(containers) > 8:
        msg += f"  • ... e mais {len(containers) - 8} containers ativos."
    return msg

def get_n8n_workflows():
    cmd = [
        "docker", "exec", "-i", "plx-n8n-db",
        "psql", "-U", "plx_user", "-d", "plx_n8n", "-t", "-A", "-c",
        "SELECT id, name, active FROM workflow_entity ORDER BY \"createdAt\" DESC LIMIT 10;"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao consultar banco n8n: {res.stderr.strip()}"
    
    lines = res.stdout.strip().splitlines()
    msg = f"⚙️ *WORKFLOWS NO N8N ({len(lines)} recentes)*\n\n"
    for l in lines:
        if not l.strip():
            continue
        wid, name, active = l.split("|")
        badge = "🟢 ATIVO" if active == "t" else "⚪ PAUSADO"
        msg += f"• `{wid}` | {badge}\n  *{name}*\n"
    msg += "\n🔗 [Abrir n8n Web](https://automacao.automatizaprocessos.tech)"
    return msg

def handle_onboarding(text):
    # Formato esperado: /onboard Nome Empresa | Telefone | Email | Obra 1, Obra 2
    parts = [p.strip() for p in text.replace("/onboard", "").strip().split("|")]
    if len(parts) < 1 or not parts[0]:
        return (
            "⚠️ *Formato inválido.*\n"
            "Use: `/onboard Nome Empresa | Telefone | Email | Obra 1, Obra 2`\n\n"
            "*Exemplo:*\n"
            "`/onboard Construtora Alfa | 49999999999 | dono@alfa.com | Obra Aurora, Obra BRF`"
        )
    
    name = parts[0]
    phone = parts[1] if len(parts) > 1 and parts[1] else None
    email = parts[2] if len(parts) > 2 and parts[2] else None
    works = [w.strip() for w in parts[3].split(",")] if len(parts) > 3 and parts[3] else None

    cmd = ["python3", str(BASE_DIR / "mct_client_onboarding.py"), "--name", name]
    if phone:
        cmd.extend(["--phone", phone])
    if email:
        cmd.extend(["--email", email])
    if works:
        cmd.extend(["--works"] + works)

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao provisionar cliente:\n`{res.stderr.strip()}`"
    
    return f"🚀 *ONBOARDING CONCLUÍDO COM SUCESSO!*\n\n{res.stdout.strip()}"

def handle_audit(company_or_work):
    cmd = ["python3", str(BASE_DIR / "mct_industrial_compliance_engine.py"), "audit"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao rodar auditoria:\n`{res.stderr.strip()}`"
    return res.stdout.strip()

def process_command(chat_id, user_id, text):
    global ADMIN_USER_ID
    if not ADMIN_USER_ID:
        ADMIN_USER_ID = str(user_id)
        print(f"🔒 [SECURITY] Bloqueando bot exclusivamente para o usuário: {ADMIN_USER_ID}")

    if str(user_id) != str(ADMIN_USER_ID):
        send_message(chat_id, "⛔ *Acesso Negado.* Este terminal executivo é soberano e restrito à diretoria da MCT LTDA.")
        return

    text = text.strip()
    cmd = text.split()[0].lower() if text else ""

    if cmd in ["/start", "/help", "/ajuda"]:
        msg = (
            "🤖 *MCT SECRETÁRIO EXECUTIVO (Soberano)*\n"
            "Central de comando dos fluxos do n8n, Google Drive e auditorias da VPS.\n\n"
            "📌 *Comandos Disponíveis:*\n"
            "• `/onboard <dados>` — Provisiona novo cliente e cria pastas no Drive\n"
            "• `/auditoria` — Audita liberação de portaria de obras (SST / ASO)\n"
            "• `/workflows` — Lista e monitora fluxos do n8n na VPS\n"
            "• `/vps` — Relatório de saúde de hardware (RAM, Disco, Docker)\n"
            "• `/drive` — Link do repositório master de clientes no Google Drive\n"
            "• `/ajuda` — Exibe esta mensagem de ajuda"
        )
        send_message(chat_id, msg)

    elif cmd == "/vps":
        send_message(chat_id, get_vps_status())

    elif cmd == "/workflows":
        send_message(chat_id, get_n8n_workflows())

    elif cmd.startswith("/onboard"):
        send_message(chat_id, "⏳ *Iniciando provisionamento na VPS e no Google Drive...*")
        reply = handle_onboarding(text)
        send_message(chat_id, reply)

    elif cmd.startswith("/auditoria"):
        send_message(chat_id, "🔍 *Executando auditoria de portaria em tempo real...*")
        reply = handle_audit(text)
        send_message(chat_id, reply)

    elif cmd == "/drive":
        msg = (
            "📁 *REPOSITÓRIO MASTER DE CLIENTES*\n\n"
            "🔗 [Abrir Google Drive MCT Clientes](https://drive.google.com/drive/folders/1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4)\n\n"
            "Service Account ativa: `mct-drive-worker@sosautonatiza.iam.gserviceaccount.com`"
        )
        send_message(chat_id, msg)

    else:
        send_message(chat_id, f"❓ Comando não reconhecido: `{cmd}`. Digite `/ajuda` para ver as opções.")

def run_polling():
    print("🚀 [TELEGRAM-SECRETARY] Agente Secretário Soberano iniciado em modo Long-Polling...")
    offset = 0
    while True:
        try:
            updates = api_telegram("getUpdates", {"offset": offset, "timeout": 20})
            if updates.get("ok"):
                for u in updates.get("result", []):
                    offset = u["update_id"] + 1
                    msg = u.get("message")
                    if msg and "text" in msg:
                        chat_id = msg["chat"]["id"]
                        user_id = msg["from"]["id"]
                        text = msg["text"]
                        user_name = msg["from"].get("first_name", "Desconhecido")
                        print(f"📩 [{user_name} ({user_id})]: {text}")
                        process_command(chat_id, user_id, text)
        except Exception as e:
            print(f"⚠️ Erro no loop de polling Telegram: {e}")
            time.sleep(3)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        print("Teste local de status:")
        print(get_vps_status())
    else:
        run_polling()
