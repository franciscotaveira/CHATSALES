#!/usr/bin/env python3
"""
MCT Core — Biblioteca Compartilhada Soberana
Eliminação de código duplicado: PostgreSQL plx-n8n-db, WAHA WhatsApp e Telegram Tavibot
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import subprocess
from pathlib import Path

# Diretórios canônicos
BASE_DIR = Path("/opt/plx-documentos/app/scripts")
if not BASE_DIR.exists():
    BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR.parent / "data"
if not DATA_DIR.exists():
    DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Credenciais e parâmetros de ambiente
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8804569791:AAGpM7pVP7TAySQNPUUr7Ch0cle-yJMVLk0")
ADMIN_USER_ID = os.environ.get("TELEGRAM_ADMIN_ID", "6485261630")
WAHA_BASE_URL = os.environ.get("WAHA_BASE_URL", "http://plx-waha:3000")
POSTGRES_CONTAINER = os.environ.get("POSTGRES_CONTAINER", "plx-n8n-db")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "plx_user")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "plx_n8n")


def run_psql(query: str) -> str:
    """
    Executa uma query no banco de dados soberano PostgreSQL plx-n8n-db via docker exec.
    Elimina a duplicação antes presente em 5 scripts diferentes.
    """
    cmd = [
        "docker", "exec", "-i", POSTGRES_CONTAINER,
        "psql", "-U", POSTGRES_USER, "-d", POSTGRES_DB, "-t", "-A", "-c", query
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql error: {res.stderr.strip()}")
    return res.stdout.strip()


def send_telegram(chat_id=None, text="", parse_mode="Markdown", reply_markup=None):
    """
    Disparo canônico de mensagens para o Telegram com fallback seguro contra erros de Markdown.
    """
    target_chat = chat_id or ADMIN_USER_ID
    if not TELEGRAM_BOT_TOKEN:
        print(f"[Telegram Mock] Para {target_chat}: {text[:80]}...")
        return None

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": target_chat,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": False
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup

    headers = {"Content-Type": "application/json"}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"⚠️ Erro ao enviar Telegram com parse_mode={parse_mode}: {e}")
        # Fallback sem parse_mode caso tenha caractere especial não escapado
        if parse_mode:
            payload.pop("parse_mode", None)
            body = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=body, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.loads(resp.read().decode())
            except Exception as e2:
                print(f"❌ Erro fatal no envio Telegram: {e2}")
                return None
        return None


def send_whatsapp(recipient: str, text: str) -> bool:
    """
    Disparo canônico de mensagens WhatsApp via engine WAHA.
    Aceita telefone (ex: 554999999999 ou +5549...) ou ID de grupo (@g.us).
    """
    clean_id = recipient.strip().replace("+", "").replace("-", "").replace(" ", "")
    if "@" not in clean_id:
        chat_id = f"{clean_id}@c.us"
    else:
        chat_id = clean_id

    # Tenta rota Docker interna plx-waha:3000 e fallback para localhost:3000
    urls = [
        f"{WAHA_BASE_URL}/api/sendText",
        "http://localhost:3000/api/sendText"
    ]
    
    payload = json.dumps({
        "session": "default",
        "chatId": chat_id,
        "text": text
    }).encode("utf-8")

    headers = {"Content-Type": "application/json"}

    for url in urls:
        try:
            req = urllib.request.Request(url, data=payload, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in [200, 201]:
                    return True
        except Exception:
            continue

    print(f"⚠️ Não foi possível entregar WhatsApp via WAHA para {chat_id}")
    return False


def format_currency_brl(value: float) -> str:
    """Formata valor float para moeda brasileira R$ 1.234,56."""
    try:
        val = float(value)
        formatted = f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"R$ {formatted}"
    except (ValueError, TypeError):
        return f"R$ {value}"


if __name__ == "__main__":
    print("✅ MCT Core inicializado com sucesso.")
    print(f"• Base Dir: {BASE_DIR}")
    print(f"• Data Dir: {DATA_DIR}")
    print(f"• Telegram Admin: {ADMIN_USER_ID}")
