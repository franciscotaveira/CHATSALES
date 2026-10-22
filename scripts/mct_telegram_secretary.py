#!/usr/bin/env python3
"""
MCT Soberano — Agente Secretário Executivo no Telegram (Tavibot)
Gerenciamento de Workflows n8n, Onboarding Turnkey, Sentinela e IA Nemotron 550B
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

# Configurações do Bot & Segurança P0
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8804569791:AAGpM7pVP7TAySQNPUUr7Ch0cle-yJMVLk0")
ADMIN_USER_ID = os.environ.get("TELEGRAM_ADMIN_ID", "6485261630")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "nvapi-Zl7m3-9g-W8R0lS2vK0bJ2n6z6aP5kM")

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
        print(f"Erro ao enviar mensagem Telegram (Markdown): {e}")
        data.pop("parse_mode", None)
        try:
            return api_telegram("sendMessage", data)
        except Exception as e2:
            print(f"Erro no fallback sem Markdown: {e2}")
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
    # Formato: /onboard Nome Empresa | Telefone | Email | Obra 1, Obra 2
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

def handle_audit():
    cmd = ["python3", str(BASE_DIR / "mct_industrial_compliance_engine.py"), "audit"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao rodar auditoria:\n`{res.stderr.strip()}`"
    return res.stdout.strip()

def handle_checklist_m02b():
    cmd = ["python3", str(BASE_DIR / "plx_checklist_engine.py"), "shadow-run"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao rodar M02B:\n`{res.stderr.strip()}`"
    return f"📋 *AUDITORIA CONTÁBIL M02B EXECUTADA!*\n\n```\n{res.stdout.strip()[:1500]}\n```"

def ask_nemotron_brain(prompt):
    """Consulta o modelo NVIDIA Nemotron-3 Ultra 550B para raciocínio e tomada de decisão."""
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {NVIDIA_API_KEY}"
    }
    system_prompt = (
        "Você é o Tavibot, o Secretário Executivo Operacional da MCT LTDA e do Francisco Rios em Chapecó/SC. "
        "Você opera sob a filosofia MCT OS v2.0: Poder invisível, simplicidade visível, Truth in Data. "
        "Você gerencia as automações na VPS Hostinger KVM 4: DocOps Contábil, DocOps Obras, SOS Vendas, LUMA OS e Google Drive Soberano. "
        "Seja conciso, direto, prestativo e focado em resolução de problemas reais de negócios. Nunca use jargões desnecessários."
    )
    payload = {
        "model": "nvidia/nemotron-3-ultra-550b-a55b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 1024
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            res = json.loads(resp.read().decode())
            return res["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"💡 [Hermes Nemotron Offline no momento]: {e}"

def process_command(chat_id, user_id, text):
    global ADMIN_USER_ID

    # Trava de segurança P0: Apenas o Francisco tem acesso
    if str(user_id) != str(ADMIN_USER_ID):
        print(f"⛔ Tentativa de acesso não autorizada: {user_id}")
        send_message(chat_id, "⛔ *Acesso Negado.* Este terminal executivo é soberano e restrito à diretoria da MCT LTDA.")
        return

    text = text.strip()
    cmd = text.split()[0].lower() if text else ""

    if cmd in ["/start", "/help", "/ajuda"]:
        msg = (
            "🤖 *TAVIBOT — SECRETÁRIO EXECUTIVO MCT SOBERANO*\n"
            "Central de comando da Mothership VPS, n8n, Google Drive e Nemotron 550B.\n\n"
            "📌 *Comandos Rápidos:*\n"
            "• `/vps` — Saúde de hardware, memória, disco e 17 containers\n"
            "• `/workflows` — Monitora os fluxos do n8n na VPS\n"
            "• `/auditoria` — Auditoria de portaria de obras (SST / ASO)\n"
            "• `/m02b` — Reconciliação do fechamento contábil e faltantes\n"
            "• `/onboard <dados>` — Cria cliente e árvore no Google Drive\n"
            "• `/drive` — Link master das pastas no Google Drive\n"
            "• `/briefing` — Relatório executivo consolidado agora\n\n"
            "💬 *Perguntas e Ordens em Linguagem Natural:*\n"
            "Você pode falar comigo diretamente sobre qualquer tema da operação! O cérebro do NVIDIA Nemotron 550B responde na hora."
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
        reply = handle_audit()
        send_message(chat_id, reply)

    elif cmd.startswith("/m02b"):
        send_message(chat_id, "🔍 *Executando reconciliação contábil M02B...*")
        reply = handle_checklist_m02b()
        send_message(chat_id, reply)

    elif cmd == "/drive":
        msg = (
            "📁 *REPOSITÓRIO MASTER DE CLIENTES*\n\n"
            "🔗 [Abrir Google Drive MCT Clientes](https://drive.google.com/drive/folders/1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4)\n\n"
            "• Service Account ativa: `mct-drive-worker@sosautonatiza.iam.gserviceaccount.com`\n"
            "• Todas as subpastas de empresas criadas aparecem aqui automaticamente."
        )
        send_message(chat_id, msg)

    elif cmd == "/briefing":
        send_message(chat_id, "📊 *Gerando briefing executivo da operação...*")
        cmd_b = ["python3", str(BASE_DIR / "mct_hermes_morning_briefing.py")]
        res = subprocess.run(cmd_b, capture_output=True, text=True)
        if res.returncode == 0:
            lines = res.stdout.split("=== BRIEFING GERADO ===")
            out = lines[1].strip() if len(lines) > 1 else res.stdout.strip()
            send_message(chat_id, out)
        else:
            send_message(chat_id, f"❌ Erro ao gerar briefing: {res.stderr.strip()}")

    else:
        # Mensagem em linguagem natural: passa para o cérebro NVIDIA Nemotron 550B
        send_message(chat_id, "🧠 *Consultando Nemotron 550B...*")
        answer = ask_nemotron_brain(text)
        send_message(chat_id, answer)

def run_polling():
    print(f"🚀 [TAVIBOT] Agente Secretário Soberano ativo para o usuário {ADMIN_USER_ID}...")
    offset = 0
    # Envia mensagem inicial avisando o Francisco que o bot subiu
    try:
        welcome = (
            "🚀 *Tavibot Conectado com Sucesso!*\n\n"
            "Olá Francisco! Seu Secretário Executivo Operacional está online 24/7 na VPS Hostinger KVM 4.\n\n"
            "Digite `/ajuda` para ver os comandos ou mande qualquer pergunta em áudio/texto para o Nemotron 550B."
        )
        send_message(ADMIN_USER_ID, welcome)
        print("✅ Mensagem de boas-vindas enviada para o Francisco!")
    except Exception as e:
        print(f"Aviso ao enviar boas-vindas: {e}")

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
                        user_name = msg["from"].get("first_name", "Francisco")
                        print(f"📩 [{user_name} ({user_id})]: {text}")
                        process_command(chat_id, user_id, text)
        except Exception as e:
            print(f"⚠️ Erro no loop de polling Telegram: {e}")
            time.sleep(3)

if __name__ == "__main__":
    run_polling()
