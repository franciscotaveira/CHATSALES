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
import datetime
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path

# Configurações do Bot & Segurança P0
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8804569791:AAGpM7pVP7TAySQNPUUr7Ch0cle-yJMVLk0")
ADMIN_USER_ID = os.environ.get("TELEGRAM_ADMIN_ID", "6485261630")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "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")

BASE_DIR = Path("/opt/plx-documentos/app/scripts")
if not BASE_DIR.exists():
    BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR.parent / "data"
if not DATA_DIR.exists():
    DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

HERMES_CONFIG_FILE = DATA_DIR / "hermes_ai_config.json"

# Catálogo Homologado de Modelos Hermes
HERMES_MODELS_CATALOG = {
    "1": {
        "id": "nvidia/nemotron-3.5-lightning-30b-a3b",
        "nome": "Nemotron 3.5 Lightning (30B)",
        "badge": "⚡ Ultrarrápido & Soberano",
        "thinking": False,
        "descricao": "Latência <1s, ideal para decisões rápidas, resumos e triagem."
    },
    "2": {
        "id": "meta/llama-3.2-11b-vision-instruct",
        "nome": "Llama 3.2 11B Instruct",
        "badge": "🧠 Raciocínio & Instrução",
        "thinking": False,
        "descricao": "Alta capacidade de raciocínio lógico, contratos e redação."
    }
}

def get_active_model_info():
    """Lê o modelo ativo configurado para o cérebro Hermes."""
    default_key = "1"
    if HERMES_CONFIG_FILE.exists():
        try:
            with open(HERMES_CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                m_key = data.get("model_key", "1")
                if m_key in HERMES_MODELS_CATALOG:
                    return HERMES_MODELS_CATALOG[m_key], m_key
        except Exception:
            pass
    return HERMES_MODELS_CATALOG[default_key], default_key

def set_active_model(key_or_name):
    """Altera o modelo ativo do Hermes e persiste a configuração."""
    target_key = None
    clean = str(key_or_name).strip().lower()
    
    if clean in HERMES_MODELS_CATALOG:
        target_key = clean
    else:
        for k, info in HERMES_MODELS_CATALOG.items():
            if clean in info["id"].lower() or clean in info["nome"].lower() or clean in k:
                target_key = k
                break
                
    if not target_key:
        return False, f"❌ Modelo '{key_or_name}' não reconhecido no catálogo homologado."
        
    info = HERMES_MODELS_CATALOG[target_key]
    try:
        with open(HERMES_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "model_key": target_key,
                "model_id": info["id"],
                "updated_at": datetime.datetime.now().isoformat()
            }, f, indent=2)
        return True, (
            "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
            "┃  ✅ *MODELO HERMES IA ATUALIZADO*   ┃\n"
            "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
            f"🤖 *Novo Motor Ativo:* {info['nome']} ({info['badge']})\n"
            f"🆔 `{info['id']}`\n"
            f"📖 _{info['descricao']}_\n\n"
            "⚡ _Pronto para processar novas ordens e raciocínio imediato._"
        )
    except Exception as e:
        return False, f"❌ Erro ao persistir configuração: {e}"

def ask_hermes_brain(prompt):
    """Consulta o Cérebro Hermes Soberano (NVIDIA NIM) com o modelo ativo."""
    model_info, _ = get_active_model_info()
    model_id = model_info["id"]
    
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {NVIDIA_API_KEY}"
    }
    
    system_prompt = (
        "Você é o Hermes, o Super-Secretário Executivo da MCT LTDA e do Francisco Rios em Chapecó/SC. "
        "Você opera sob a filosofia MCT OS v2.0: Poder invisível, simplicidade visível, Truth in Data. "
        "Você gerencia a infraestrutura na VPS Hostinger KVM 4: Radar B2G (Licitações e Leilões Públicos da Lei 14.133), "
        "DocOps Contábil (Extratos OFX M02C, Reconciliação Drive), Gestão de Frotas (Prevenção de Multa NIC CTB 257) "
        "e Imunidade do Terceiro Setor (Recibos com CPF e Livro Caixa). "
        "Responda sempre com clareza executiva, concisão, alta ergonomia visual em Markdown e foco em ação prática."
    )
    
    payload = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 1024
    }
    
    if not model_info.get("thinking", True) and "lightning" in model_id:
        payload["chat_template_kwargs"] = {"enable_thinking": False}
        
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res = json.loads(resp.read().decode())
            return res["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"💡 [Hermes Brain Offline no momento]: {e}"

def handle_model_menu():
    active, active_key = get_active_model_info()
    txt = (
        "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
        "┃    🤖 *CENTRAL DE MODELOS HERMES IA*  ┃\n"
        "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n"
        f"🟢 *Modelo Ativo Agora:*\n"
        f"  • *{active['nome']}* ({active['badge']})\n"
        f"  • ID: `{active['id']}`\n\n"
        "📋 *Catálogo de Motores Homologados:*\n"
    )
    for k, info in HERMES_MODELS_CATALOG.items():
        check = "👉 *[ATIVO]* " if k == active_key else "⚪ "
        txt += f"{check}*{k}. {info['nome']}* — {info['badge']}\n   _{info['descricao']}_\n"
        
    txt += "\n💡 _Toque em um dos botões abaixo para alternar de modelo instantaneamente:_"
    
    kb = {
        "inline_keyboard": [
            [
                {"text": "⚡ Nemotron 3.5 Lightning (Padrão)", "callback_data": "set_model_1"},
                {"text": "🧠 Llama 3.2 11B Instruct", "callback_data": "set_model_2"}
            ],
            [
                {"text": "🔙 Voltar ao Painel Master", "callback_data": "panel_home"}
            ]
        ]
    }
    return txt, kb

def api_telegram(method, data=None):
    if not TELEGRAM_BOT_TOKEN:
        raise ValueError("TELEGRAM_BOT_TOKEN não configurado.")
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def send_message(chat_id, text, parse_mode="Markdown", reply_markup=None):
    data = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": False
    }
    if reply_markup is not None:
        data["reply_markup"] = reply_markup
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

def answer_callback_query(callback_query_id, text=None):
    data = {"callback_query_id": callback_query_id}
    if text:
        data["text"] = text
    try:
        return api_telegram("answerCallbackQuery", data)
    except Exception as e:
        print(f"Erro ao responder callback_query: {e}")
        return None

def edit_message_text(chat_id, message_id, text, parse_mode="Markdown", reply_markup=None):
    data = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": False
    }
    if reply_markup is not None:
        data["reply_markup"] = reply_markup
    try:
        return api_telegram("editMessageText", data)
    except Exception as e:
        print(f"Erro ao editar mensagem: {e}")
        data.pop("parse_mode", None)
        try:
            return api_telegram("editMessageText", data)
        except Exception as e2:
            print(f"Erro no fallback de edicao sem Markdown: {e2}")
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

def handle_provision(text):
    # Formato: /provisionar [Nome Empresa] | [Telefone] | [Nicho: CONTABIL/OBRAS/FROTAS/VENDAS] | [Sub-itens]
    raw = text.replace("/provisionar", "").strip()
    parts = [p.strip() for p in raw.split("|")]
    if len(parts) < 1 or not parts[0]:
        return (
            "⚠️ *Formato inválido.*\n"
            "Use: `/provisionar [Nome Empresa] | [Telefone] | [Nicho: CONTABIL/OBRAS/FROTAS/VENDAS] | [Sub-itens]`\n\n"
            "*Exemplo:*\n"
            "`/provisionar Construtora Horizonte | 49999999999 | OBRAS | Obra Alpha, Obra Beta`"
        )
    
    name = parts[0]
    phone = parts[1] if len(parts) > 1 and parts[1] else None
    niche = parts[2] if len(parts) > 2 and parts[2] else "OBRAS"
    items = [w.strip() for w in parts[3].split(",")] if len(parts) > 3 and parts[3] else None

    cmd = ["python3", str(BASE_DIR / "mct_tenant_provisioner.py"), "--name", name, "--niche", niche]
    if phone:
        cmd.extend(["--phone", phone])
    if items:
        cmd.extend(["--items"] + items)

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao provisionar tenant:\n`{res.stderr.strip() or res.stdout.strip()}`"
    
    return f"⚡ *PROVISIONAMENTO ZERO-TOUCH CONCLUÍDO!*\n\n{res.stdout.strip()}"

def handle_cnd_check():
    cmd = ["python3", str(BASE_DIR / "mct_cnd_sentinel.py"), "--telegram"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro na varredura CND Sentinel:\n`{res.stderr.strip()}`"
    return f"🛡️ *VARREDURA CND SENTINEL CONCLUÍDA!*\n\n{res.stdout.strip()}"

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

def handle_licitacoes(uf="SUL"):
    cmd = ["python3", str(BASE_DIR / "mct_pncp_radar.py"), uf]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro no Radar PNCP:\n`{res.stderr.strip()}`"
    return res.stdout.strip()

def handle_leiloes(uf="SUL"):
    cmd = ["python3", str(BASE_DIR / "mct_pncp_radar.py"), "leiloes", uf]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro no Radar de Leilões:\n`{res.stderr.strip()}`"
    return res.stdout.strip()

def handle_conciliar():
    cmd = ["python3", str(BASE_DIR / "mct_ofx_conciliator.py")]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro na Conciliação OFX:\n`{res.stderr.strip()}`"
    return res.stdout.strip()

def handle_doacao(text):
    # Formato: /doacao [Doador] | [CPF] | [Valor] | [Finalidade]
    raw = text.replace("/doacao", "").strip()
    parts = [p.strip() for p in raw.split("|")]
    if len(parts) < 3 or not parts[0] or not parts[1] or not parts[2]:
        return (
            "⚠️ *Formato inválido.*\n"
            "Use: `/doacao [Doador] | [CPF] | [Valor] | [Finalidade]`\n\n"
            "*Exemplo real:*\n"
            "`/doacao Marcos Aurelio Silveira | 045.892.119-40 | 1250.00 | Dízimo`"
        )
    doador = parts[0]
    cpf = parts[1]
    try:
        valor = float(parts[2].replace("R$", "").replace(".", "").replace(",", ".").strip())
    except ValueError:
        return "❌ Valor numérico inválido para a doação."
    finalidade = parts[3] if len(parts) > 3 and parts[3] else "Dízimo"

    cmd = [
        "python3", str(BASE_DIR / "mct_terceiro_setor_engine.py"), "emitir",
        "--doador", doador, "--cpf", cpf, "--valor", str(valor), "--finalidade", finalidade
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao emitir recibo do Terceiro Setor:\n`{res.stderr.strip()}`"
    
    try:
        import mct_terceiro_setor_engine
        data = json.loads(res.stdout.split("[OK]")[0].strip())
        return mct_terceiro_setor_engine.formatar_recibo_telegram(data)
    except Exception:
        return f"📜 *RECIBO EMITIDO COM SUCESSO!*\n\n{res.stdout.strip()}"

def handle_livro_caixa(text):
    mes = text.replace("/livrocaixa", "").strip() or None
    cmd = ["python3", str(BASE_DIR / "mct_terceiro_setor_engine.py"), "livro-caixa"]
    if mes:
        cmd.extend(["--mes", mes])
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao consultar Livro Caixa:\n`{res.stderr.strip()}`"
    try:
        import mct_terceiro_setor_engine
        data = json.loads(res.stdout.strip())
        return mct_terceiro_setor_engine.formatar_livro_caixa_telegram(data)
    except Exception:
        return res.stdout.strip()

def handle_frotas():
    cmd = ["python3", str(BASE_DIR / "mct_frotas_nic_sentinel.py"), "auditar"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro na Sentinela de Frotas:\n`{res.stderr.strip()}`"
    return res.stdout.strip()

def handle_fici(text):
    placa = text.replace("/fici", "").strip()
    if not placa:
        return "⚠️ Informe a placa do veículo: `/fici <PLACA>` (Ex: `/fici RLG4E12`)"
    cmd = ["python3", str(BASE_DIR / "mct_frotas_nic_sentinel.py"), "fici", "--placa", placa]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro ao gerar FICI:\n`{res.stderr.strip()}`"
    return f"```\n{res.stdout.strip()}\n```"

def get_persistent_keyboard():
    """Teclado persistente na base da tela com ergonomia de 1 toque."""
    return {
        "keyboard": [
            [{"text": "📡 Licitações Sul"}, {"text": "🔨 Leilões Sul"}],
            [{"text": "🏦 Conciliar OFX"}, {"text": "🚛 Frotas & NIC"}],
            [{"text": "🛡️ CND Sentinel"}, {"text": "🤖 Hermes IA"}],
            [{"text": "🖥️ VPS Status"}, {"text": "🎛️ Painel Master"}]
        ],
        "resize_keyboard": True,
        "is_persistent": True
    }

def get_master_panel_inline_keyboard():
    """Painel interativo categorizado em blocos funcionais claros."""
    return {
        "inline_keyboard": [
            # Bloco 1: B2G & Mercados Ocultos
            [
                {"text": "📡 Licitações SC/PR/RS", "callback_data": "panel_licitacoes"},
                {"text": "🔨 Leilões Públicos Sul", "callback_data": "panel_leiloes"}
            ],
            # Bloco 2: Contabilidade & Doações
            [
                {"text": "🏦 Conciliação OFX", "callback_data": "panel_conciliar"},
                {"text": "📖 Livro Caixa 3º Setor", "callback_data": "panel_livrocaixa"}
            ],
            # Bloco 3: Regulação & Prevenção
            [
                {"text": "🚛 Frotas & Multa NIC", "callback_data": "panel_frotas"},
                {"text": "🛡️ Varredura CNDs", "callback_data": "panel_cnd"}
            ],
            # Bloco 4: Operações & Gestão
            [
                {"text": "📋 Fechamento M02B", "callback_data": "panel_m02b"},
                {"text": "🏗️ Auditoria Obras (SST)", "callback_data": "panel_auditoria"}
            ],
            # Bloco 5: Infraestrutura & Inteligência
            [
                {"text": "🖥️ Hardware & VPS", "callback_data": "panel_vps"},
                {"text": "🤖 Modelo Hermes IA", "callback_data": "panel_modelo"}
            ],
            # Bloco 6: Atalhos Rápidos & Repositório
            [
                {"text": "📜 Emitir Recibo", "callback_data": "panel_form_doacao"},
                {"text": "📋 Formulário FICI", "callback_data": "panel_form_fici"},
                {"text": "📁 Drive Master", "callback_data": "panel_drive"}
            ]
        ]
    }

def get_back_to_panel_keyboard():
    return {
        "inline_keyboard": [
            [{"text": "🔙 Voltar ao Painel Master", "callback_data": "panel_home"}]
        ]
    }

def get_master_panel_text():
    active_model, _ = get_active_model_info()
    return (
        "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
        "┃  🎛️ *MCT COCKPIT OPERACIONAL MASTER*  ┃\n"
        "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n"
        "Ambiente Soberano ativo na VPS Hostinger KVM 4 (`200.141.17.99`).\n"
        f"🤖 *Cérebro Hermes IA:* `{active_model['nome']}`\n\n"
        "🏛️ *1. B2G & Mercados Ocultos*\n"
        "  • *Licitações:* Dispensas e pregões da Região Sul (SC, PR, RS)\n"
        "  • *Leilões:* Alienação de frotas e ativos com deságio\n\n"
        "💼 *2. DocOps, Finanças & Frotas*\n"
        "  • *OFX:* Conciliação bancária determinística (M02C)\n"
        "  • *Frotas:* Prevenção da duplicação de multas PJ (CTB 257)\n"
        "  • *3º Setor:* Emissão de recibos com CPF, SHA-256 e PDF\n\n"
        "🛡️ *3. Compliance, Infra & IA*\n"
        "  • *CNDs:* Varredura de Caixa, CNDT e Receita Federal\n"
        "  • *VPS:* Monitoramento de containers e recursos de hardware\n\n"
        "👇 _Toque em uma categoria abaixo para consulta instantânea:_"
    )

def process_callback(chat_id, user_id, data, message_id):
    """Processa ações disparadas pelos botões inline do painel."""
    global ADMIN_USER_ID

    if str(user_id) != str(ADMIN_USER_ID):
        print(f"⛔ Callback não autorizado: {user_id}")
        return

    back_kb = get_back_to_panel_keyboard()

    if data == "panel_home":
        edit_message_text(chat_id, message_id, get_master_panel_text(), reply_markup=get_master_panel_inline_keyboard())

    # Switch de Modelos Hermes
    elif data.startswith("set_model_"):
        key = data.replace("set_model_", "")
        sucesso, msg = set_active_model(key)
        edit_message_text(chat_id, message_id, msg, reply_markup=back_kb)

    elif data == "panel_modelo":
        txt, kb = handle_model_menu()
        edit_message_text(chat_id, message_id, txt, reply_markup=kb)

    elif data == "panel_licitacoes":
        edit_message_text(chat_id, message_id, "📡 *Consultando API oficial do PNCP (Região Sul: SC, PR, RS)...*")
        reply = handle_licitacoes("SUL")
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_leiloes":
        edit_message_text(chat_id, message_id, "🔨 *Varrendo Leilões Públicos no PNCP (SC, PR, RS)...*")
        reply = handle_leiloes("SUL")
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_conciliar":
        edit_message_text(chat_id, message_id, "🏦 *Executando conciliação de extratos OFX contra notas fiscais...*")
        reply = handle_conciliar()
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_frotas":
        edit_message_text(chat_id, message_id, "🚛 *Varrendo autuações de veículos PJ e calculando prazo para Multa NIC...*")
        reply = handle_frotas()
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_livrocaixa":
        reply = handle_livro_caixa("")
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_cnd":
        edit_message_text(chat_id, message_id, "🛡️ *Iniciando varredura autônoma de CNDs...*")
        reply = handle_cnd_check()
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_m02b":
        edit_message_text(chat_id, message_id, "🔍 *Executando reconciliação contábil M02B...*")
        reply = handle_checklist_m02b()
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_auditoria":
        edit_message_text(chat_id, message_id, "🔍 *Executando auditoria de portaria em tempo real...*")
        reply = handle_audit()
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_vps":
        reply = get_vps_status()
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_form_doacao":
        txt = (
            "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
            "┃  📜 *EMISSÃO DE RECIBO DO 3º SETOR* ┃\n"
            "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
            "Para emitir recibo formal de doação/dízimo com CPF, SHA-256 e PDF via ReportLab, "
            "copie o modelo abaixo, altere os dados e envie aqui no chat:\n\n"
            "`/doacao Nome do Doador | 000.000.000-00 | 1250.00 | Dízimo`\n\n"
            "*Exemplo real:*\n"
            "`/doacao Marcos Aurelio Silveira | 045.892.119-40 | 1250.00 | Dízimo`\n\n"
            "⚖️ *Amparo:* Art. 150, VI, 'b' da CF/88 (Imunidade Tributária Religiosa)."
        )
        edit_message_text(chat_id, message_id, txt, reply_markup=back_kb)

    elif data == "panel_form_fici":
        txt = (
            "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
            "┃  📋 *FORMULÁRIO FICI CONDUTOR PJ*   ┃\n"
            "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
            "Para gerar o formulário pré-preenchido e evitar a duplicação automática da multa (Multa NIC), envie:\n\n"
            "`/fici <PLACA>`\n\n"
            "*Exemplo:*\n"
            "`/fici RLG4E12`\n\n"
            "⚖️ *Amparo:* Art. 257, § 8º do CTB e Resolução CONTRAN 710/2017."
        )
        edit_message_text(chat_id, message_id, txt, reply_markup=back_kb)

    elif data == "panel_drive":
        txt = (
            "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
            "┃  📁 *REPOSITÓRIO GOOGLE DRIVE MCT*  ┃\n"
            "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
            "🔗 [Abrir Google Drive Master de Clientes](https://drive.google.com/drive/folders/1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4)\n\n"
            "• Service Account: `mct-drive-worker@sosautonatiza.iam.gserviceaccount.com`\n"
            "• Todas as subpastas e relatórios aparecem organizados aqui automaticamente."
        )
        edit_message_text(chat_id, message_id, txt, reply_markup=back_kb)

def process_command(chat_id, user_id, text):
    global ADMIN_USER_ID

    # Trava de segurança P0: Apenas o Francisco tem acesso
    if str(user_id) != str(ADMIN_USER_ID):
        print(f"⛔ Tentativa de acesso não autorizada: {user_id}")
        send_message(chat_id, "⛔ *Acesso Negado.* Este terminal executivo é soberano e restrito à diretoria da MCT LTDA.")
        return

    text = text.strip()
    cmd = text.split()[0].lower() if text else ""
    persistent_kb = get_persistent_keyboard()
    back_kb = get_back_to_panel_keyboard()

    # Mapeamento do Menu Central e Painel
    if cmd in ["/start", "/help", "/ajuda", "/painel", "/menu", "painel", "menu"] or text in ["🎛️ Painel Master", "🎛️ painel master"]:
        send_message(
            chat_id,
            get_master_panel_text(),
            reply_markup=get_master_panel_inline_keyboard()
        )
        send_message(
            chat_id,
            "💡 _Use também os atalhos fixados no teclado inferior._",
            reply_markup=persistent_kb
        )

    # 1. Troca de Modelo de IA Hermes
    elif cmd in ["/modelo", "/model", "/ia"]:
        parts = text.split()
        if len(parts) > 1:
            sucesso, msg = set_active_model(parts[1])
            send_message(chat_id, msg, reply_markup=back_kb)
        else:
            txt, kb = handle_model_menu()
            send_message(chat_id, txt, reply_markup=kb)

    elif text in ["🤖 Hermes IA", "🤖 hermes ia"]:
        txt, kb = handle_model_menu()
        send_message(chat_id, txt, reply_markup=kb)

    # 2. Radar PNCP B2G (Licitações)
    elif cmd in ["/licitacoes", "/pncp"] or text in ["📡 Licitações Sul", "📡 licitações sul", "📡 Radar PNCP"]:
        uf_target = text.replace("/licitacoes", "").replace("/pncp", "").strip() or "SUL"
        send_message(chat_id, f"📡 *Consultando API oficial do PNCP para {uf_target}...*")
        reply = handle_licitacoes(uf_target)
        send_message(chat_id, reply, reply_markup=back_kb)

    # 3. Radar de Leilões Públicos
    elif cmd in ["/leiloes", "/leilao"] or text in ["🔨 Leilões Sul", "🔨 leilões sul"]:
        uf_target = text.replace("/leiloes", "").replace("/leilao", "").strip() or "SUL"
        send_message(chat_id, f"🔨 *Varrendo Leilões Públicos PNCP de frotas e bens ({uf_target})...*")
        reply = handle_leiloes(uf_target)
        send_message(chat_id, reply, reply_markup=back_kb)

    # 4. Conciliação OFX
    elif cmd == "/conciliar" or text in ["🏦 Conciliar OFX", "🏦 conciliar ofx"]:
        send_message(chat_id, "🏦 *Executando conciliação de extratos OFX contra notas fiscais...*")
        reply = handle_conciliar()
        send_message(chat_id, reply, reply_markup=back_kb)

    # 5. Sentinela de Frotas & NIC
    elif cmd == "/frotas" or text in ["🚛 Frotas & NIC", "🚛 frotas & nic"]:
        send_message(chat_id, "🚛 *Varrendo autuações de veículos PJ e calculando prazo para Multa NIC...*")
        reply = handle_frotas()
        send_message(chat_id, reply, reply_markup=back_kb)

    elif cmd.startswith("/fici"):
        reply = handle_fici(text)
        send_message(chat_id, reply, reply_markup=back_kb)

    # 6. Motor do Terceiro Setor
    elif cmd.startswith("/doacao"):
        send_message(chat_id, "📜 *Processando doação, assinando com SHA-256 e gerando PDF formal...*")
        reply = handle_doacao(text)
        send_message(chat_id, reply, reply_markup=back_kb)

    elif cmd.startswith("/livrocaixa"):
        send_message(chat_id, "📖 *Consultando Livro Caixa do Terceiro Setor...*")
        reply = handle_livro_caixa(text)
        send_message(chat_id, reply, reply_markup=back_kb)

    # 7. CND Sentinel
    elif cmd == "/cnd" or text in ["🛡️ CND Sentinel", "🛡️ cnd sentinel"]:
        send_message(chat_id, "🛡️ *Iniciando varredura autônoma de CNDs...*")
        reply = handle_cnd_check()
        send_message(chat_id, reply, reply_markup=back_kb)

    # 8. Status VPS & Infraestrutura
    elif cmd == "/vps" or text in ["🖥️ VPS Status", "🖥️ vps status"]:
        send_message(chat_id, get_vps_status(), reply_markup=back_kb)

    elif cmd == "/workflows":
        send_message(chat_id, get_n8n_workflows(), reply_markup=back_kb)

    elif cmd.startswith("/provisionar"):
        send_message(chat_id, "⏳ *Iniciando provisionamento Zero-Touch (<15s)...*")
        reply = handle_provision(text)
        send_message(chat_id, reply, reply_markup=back_kb)

    elif cmd.startswith("/onboard"):
        send_message(chat_id, "⏳ *Iniciando provisionamento na VPS e no Google Drive...*")
        reply = handle_onboarding(text)
        send_message(chat_id, reply, reply_markup=back_kb)

    elif cmd.startswith("/auditoria"):
        send_message(chat_id, "🔍 *Executando auditoria de portaria em tempo real...*")
        reply = handle_audit()
        send_message(chat_id, reply, reply_markup=back_kb)

    elif cmd.startswith("/m02b"):
        send_message(chat_id, "🔍 *Executando reconciliação contábil M02B...*")
        reply = handle_checklist_m02b()
        send_message(chat_id, reply, reply_markup=back_kb)

    elif cmd == "/drive":
        msg = (
            "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
            "┃  📁 *REPOSITÓRIO GOOGLE DRIVE MCT*  ┃\n"
            "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
            "🔗 [Abrir Google Drive Master de Clientes](https://drive.google.com/drive/folders/1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4)\n\n"
            "• Service Account ativa: `mct-drive-worker@sosautonatiza.iam.gserviceaccount.com`\n"
            "• Todas as subpastas criadas aparecem aqui automaticamente."
        )
        send_message(chat_id, msg, reply_markup=back_kb)

    elif cmd == "/briefing":
        send_message(chat_id, "📊 *Gerando briefing executivo da operação...*")
        cmd_b = ["python3", str(BASE_DIR / "mct_hermes_morning_briefing.py")]
        res = subprocess.run(cmd_b, capture_output=True, text=True)
        if res.returncode == 0:
            lines = res.stdout.split("=== BRIEFING GERADO ===")
            out = lines[1].strip() if len(lines) > 1 else res.stdout.strip()
            send_message(chat_id, out, reply_markup=back_kb)
        else:
            send_message(chat_id, f"❌ Erro ao gerar briefing: {res.stderr.strip()}", reply_markup=back_kb)

    else:
        # Mensagem em linguagem natural: passa para o cérebro Hermes IA
        send_message(chat_id, "🧠 *Hermes processando raciocínio...*")
        answer = ask_hermes_brain(text)
        send_message(chat_id, answer, reply_markup=back_kb)

def run_polling():
    print(f"🚀 [TAVIBOT] Agente Secretário Soberano ativo para o usuário {ADMIN_USER_ID}...")
    offset = 0
    # Envia mensagem inicial com o teclado persistente e o painel de boas-vindas
    try:
        active_model, _ = get_active_model_info()
        welcome = (
            "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
            "┃  🚀 *TAVIBOT & HERMES IA ONLINE*    ┃\n"
            "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
            "Olá Francisco! Seu Secretário Executivo Operacional está ativo na VPS Hostinger KVM 4.\n\n"
            f"🤖 *Motor Ativo:* `{active_model['nome']}`\n"
            "📡 *Radar B2G:* Cobertura para Santa Catarina, Paraná e Rio Grande do Sul + Leilões Públicos.\n\n"
            "Use o teclado de atalhos abaixo ou digite `/painel` para abrir o Cockpit Master."
        )
        send_message(ADMIN_USER_ID, welcome, reply_markup=get_persistent_keyboard())
        print("✅ Mensagem de boas-vindas com teclado persistente enviada para o Francisco!")
    except Exception as e:
        print(f"Aviso ao enviar boas-vindas: {e}")

    while True:
        try:
            updates = api_telegram("getUpdates", {"offset": offset, "timeout": 20})
            if updates.get("ok"):
                for u in updates.get("result", []):
                    offset = u["update_id"] + 1

                    # 1. Trata Cliques em Botões Inline do Painel (Callbacks)
                    cb = u.get("callback_query")
                    if cb:
                        cb_id = cb["id"]
                        msg_obj = cb.get("message", {})
                        chat_id = msg_obj.get("chat", {}).get("id")
                        user_id = cb["from"]["id"]
                        cb_data = cb.get("data", "")
                        message_id = msg_obj.get("message_id")
                        user_name = cb["from"].get("first_name", "Francisco")
                        print(f"🔘 [{user_name} ({user_id})]: Toque no botão '{cb_data}'")
                        answer_callback_query(cb_id)
                        if chat_id and message_id:
                            process_callback(chat_id, user_id, cb_data, message_id)
                        continue

                    # 2. Trata Mensagens de Texto e Botões do Teclado Persistente
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
