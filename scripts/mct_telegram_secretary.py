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

def handle_licitacoes():
    cmd = ["python3", str(BASE_DIR / "mct_pncp_radar.py")]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"❌ Erro no Radar PNCP:\n`{res.stderr.strip()}`"
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
            "*Exemplo:*\n"
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

def get_persistent_keyboard():
    """Teclado persistente na parte inferior do Telegram para acesso em 1 toque."""
    return {
        "keyboard": [
            [{"text": "📡 Radar PNCP"}, {"text": "🏦 Conciliar OFX"}],
            [{"text": "🚛 Frotas & NIC"}, {"text": "📖 3º Setor / Doações"}],
            [{"text": "🛡️ CND Sentinel"}, {"text": "📊 Briefing Matinal"}],
            [{"text": "🖥️ VPS Status"}, {"text": "🎛️ Painel Master"}]
        ],
        "resize_keyboard": True,
        "is_persistent": True
    }

def get_master_panel_inline_keyboard():
    """Painel de botões inline categorizado como um cockpit interativo."""
    return {
        "inline_keyboard": [
            # Categoria 1: B2G & Mercados Ocultos
            [
                {"text": "📡 Radar PNCP SC", "callback_data": "panel_licitacoes"},
                {"text": "🏦 Conciliação OFX", "callback_data": "panel_conciliar"}
            ],
            # Categoria 2: Regulação & Frotas
            [
                {"text": "🚛 Frotas & Multa NIC", "callback_data": "panel_frotas"},
                {"text": "📖 3º Setor (Caixa)", "callback_data": "panel_livrocaixa"}
            ],
            # Categoria 3: Certidões & Fechamento Contábil
            [
                {"text": "🛡️ Varredura CNDs", "callback_data": "panel_cnd"},
                {"text": "📋 Fechamento M02B", "callback_data": "panel_m02b"}
            ],
            # Categoria 4: Operações & Auditoria SST
            [
                {"text": "🏗️ Auditoria Obras", "callback_data": "panel_auditoria"},
                {"text": "📊 Briefing Matinal", "callback_data": "panel_briefing"}
            ],
            # Categoria 5: Infraestrutura VPS
            [
                {"text": "🖥️ Hardware & VPS", "callback_data": "panel_vps"},
                {"text": "⚙️ n8n Workflows", "callback_data": "panel_workflows"}
            ],
            # Categoria 6: Atalhos Rápidos & Drive
            [
                {"text": "📜 Form Doação", "callback_data": "panel_form_doacao"},
                {"text": "📋 Form FICI", "callback_data": "panel_form_fici"},
                {"text": "📁 Drive Master", "callback_data": "panel_drive"}
            ]
        ]
    }

def get_back_to_panel_keyboard():
    """Botão para retornar ao painel central a qualquer momento."""
    return {
        "inline_keyboard": [
            [{"text": "🔙 Voltar ao Painel Master", "callback_data": "panel_home"}]
        ]
    }

def get_master_panel_text():
    return (
        "🎛️ *MCT COCKPIT EXECUTIVO — PAINEL DE CONTROLE SOBERANO*\n"
        "Ambiente operacional ativo na VPS Hostinger KVM 4 (`200.141.17.99`).\n"
        "Toque em qualquer botão abaixo para executar a consulta em tempo real:\n\n"
        "🏛️ *B2G & Mercados Ocultos:*\n"
        "  • *Radar PNCP:* Dispensas e pregões SC com checagem de CNDs\n"
        "  • *Conciliador OFX:* Pareamento bancário contra NF-e (DocOps M02C)\n"
        "  • *Frotas & NIC:* Prevenção da duplicação de multas PJ (CTB 257)\n"
        "  • *3º Setor:* Recibos formais com SHA-256 e Livro Caixa\n\n"
        "🛡️ *Compliance, DocOps & Infra:*\n"
        "  • *CND Sentinel:* Certidões FGTS, CNDT e Receita Federal\n"
        "  • *Fechamento M02B:* Auditoria de faltantes contábeis\n"
        "  • *Auditoria Obras:* Conformidade de portaria e SST\n"
        "  • *VPS & n8n:* Saúde dos 17 containers e workflows ativos\n\n"
        "👇 _Selecione uma categoria no painel interativo abaixo:_"
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

    elif data == "panel_licitacoes":
        edit_message_text(chat_id, message_id, "📡 *Consultando API oficial do PNCP e auditando CNDs em Santa Catarina...*")
        reply = handle_licitacoes()
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

    elif data == "panel_briefing":
        edit_message_text(chat_id, message_id, "📊 *Gerando briefing executivo da operação...*")
        cmd_b = ["python3", str(BASE_DIR / "mct_hermes_morning_briefing.py")]
        res = subprocess.run(cmd_b, capture_output=True, text=True)
        if res.returncode == 0:
            lines = res.stdout.split("=== BRIEFING GERADO ===")
            out = lines[1].strip() if len(lines) > 1 else res.stdout.strip()
            edit_message_text(chat_id, message_id, out[:4000], reply_markup=back_kb)
        else:
            edit_message_text(chat_id, message_id, f"❌ Erro ao gerar briefing: {res.stderr.strip()}", reply_markup=back_kb)

    elif data == "panel_vps":
        reply = get_vps_status()
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_workflows":
        reply = get_n8n_workflows()
        edit_message_text(chat_id, message_id, reply[:4000], reply_markup=back_kb)

    elif data == "panel_form_doacao":
        txt = (
            "📜 *EMISSÃO DE RECIBO DO TERCEIRO SETOR (COM CPF & PDF)*\n\n"
            "Para emitir recibo formal de doação/dízimo com assinatura digital SHA-256 e PDF via ReportLab, "
            "copie o modelo abaixo, preencha os dados e envie aqui no chat:\n\n"
            "`/doacao Nome do Doador | 000.000.000-00 | 1250.00 | Dízimo`\n\n"
            "*Exemplo real:*\n"
            "`/doacao Marcos Aurelio Silveira | 045.892.119-40 | 1250.00 | Dízimo`\n\n"
            "⚖️ *Amparo:* Art. 150, VI, 'b' da CF/88 (Imunidade Tributária Religiosa)."
        )
        edit_message_text(chat_id, message_id, txt, reply_markup=back_kb)

    elif data == "panel_form_fici":
        txt = (
            "📋 *FORMULÁRIO FICI — INDICAÇÃO DE CONDUTOR PJ*\n\n"
            "Para gerar o formulário pré-preenchido e evitar a duplicação automática da multa (Multa NIC), envie:\n\n"
            "`/fici <PLACA>`\n\n"
            "*Exemplo:*\n"
            "`/fici RLG4E12`\n\n"
            "⚖️ *Amparo:* Art. 257, § 8º do CTB e Resolução CONTRAN 710/2017."
        )
        edit_message_text(chat_id, message_id, txt, reply_markup=back_kb)

    elif data == "panel_drive":
        txt = (
            "📁 *REPOSITÓRIO MASTER DE CLIENTES NO GOOGLE DRIVE*\n\n"
            "🔗 [Abrir Google Drive MCT Clientes](https://drive.google.com/drive/folders/1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4)\n\n"
            "• Service Account: `mct-drive-worker@sosautonatiza.iam.gserviceaccount.com`\n"
            "• Todas as subpastas criadas aparecem aqui automaticamente."
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

    # Mapeamento do Menu Central e Painel
    if cmd in ["/start", "/help", "/ajuda", "/painel", "/menu", "painel", "menu"] or text in ["🎛️ Painel Master", "🎛️ painel master"]:
        # Envia o Painel com Inline Buttons e ativa o Teclado Persistente
        send_message(
            chat_id,
            get_master_panel_text(),
            reply_markup=get_master_panel_inline_keyboard()
        )
        # Garante teclado persistente visível
        send_message(
            chat_id,
            "💡 _Use também os atalhos rápidos fixados no teclado abaixo._",
            reply_markup=persistent_kb
        )

    # 1. Radar PNCP B2G
    elif cmd in ["/licitacoes", "/pncp"] or text in ["📡 Radar PNCP", "📡 radar pncp"]:
        send_message(chat_id, "📡 *Consultando API oficial do PNCP e auditando CNDs em Santa Catarina...*")
        reply = handle_licitacoes()
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    # 2. Conciliação OFX
    elif cmd == "/conciliar" or text in ["🏦 Conciliar OFX", "🏦 conciliar ofx"]:
        send_message(chat_id, "🏦 *Executando conciliação de extratos OFX contra notas fiscais...*")
        reply = handle_conciliar()
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    # 3. Sentinela de Frotas & NIC
    elif cmd == "/frotas" or text in ["🚛 Frotas & NIC", "🚛 frotas & nic"]:
        send_message(chat_id, "🚛 *Varrendo autuações de veículos PJ e calculando prazo para Multa NIC...*")
        reply = handle_frotas()
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    elif cmd.startswith("/fici"):
        reply = handle_fici(text)
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    # 4. Motor do Terceiro Setor
    elif cmd.startswith("/doacao"):
        send_message(chat_id, "📜 *Processando doação, assinando com SHA-256 e gerando PDF formal...*")
        reply = handle_doacao(text)
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    elif cmd.startswith("/livrocaixa") or text in ["📖 3º Setor / Doações", "📖 3º Setor", "📖 3º setor"]:
        send_message(chat_id, "📖 *Consultando Livro Caixa do Terceiro Setor...*")
        reply = handle_livro_caixa(text)
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    # 5. CND Sentinel
    elif cmd == "/cnd" or text in ["🛡️ CND Sentinel", "🛡️ cnd sentinel"]:
        send_message(chat_id, "🛡️ *Iniciando varredura autônoma de CNDs...*")
        reply = handle_cnd_check()
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    # 6. Status VPS & Infraestrutura
    elif cmd == "/vps" or text in ["🖥️ VPS Status", "🖥️ vps status"]:
        send_message(chat_id, get_vps_status(), reply_markup=get_back_to_panel_keyboard())

    elif cmd == "/workflows":
        send_message(chat_id, get_n8n_workflows(), reply_markup=get_back_to_panel_keyboard())

    elif cmd.startswith("/provisionar"):
        send_message(chat_id, "⏳ *Iniciando provisionamento Zero-Touch (<15s)...*")
        reply = handle_provision(text)
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    elif cmd.startswith("/onboard"):
        send_message(chat_id, "⏳ *Iniciando provisionamento na VPS e no Google Drive...*")
        reply = handle_onboarding(text)
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    elif cmd.startswith("/auditoria"):
        send_message(chat_id, "🔍 *Executando auditoria de portaria em tempo real...*")
        reply = handle_audit()
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    elif cmd.startswith("/m02b"):
        send_message(chat_id, "🔍 *Executando reconciliação contábil M02B...*")
        reply = handle_checklist_m02b()
        send_message(chat_id, reply, reply_markup=get_back_to_panel_keyboard())

    elif cmd == "/drive":
        msg = (
            "📁 *REPOSITÓRIO MASTER DE CLIENTES*\n\n"
            "🔗 [Abrir Google Drive MCT Clientes](https://drive.google.com/drive/folders/1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4)\n\n"
            "• Service Account ativa: `mct-drive-worker@sosautonatiza.iam.gserviceaccount.com`\n"
            "• Todas as subpastas de empresas criadas aparecem aqui automaticamente."
        )
        send_message(chat_id, msg, reply_markup=get_back_to_panel_keyboard())

    elif cmd == "/briefing" or text in ["📊 Briefing Matinal", "📊 briefing matinal"]:
        send_message(chat_id, "📊 *Gerando briefing executivo da operação...*")
        cmd_b = ["python3", str(BASE_DIR / "mct_hermes_morning_briefing.py")]
        res = subprocess.run(cmd_b, capture_output=True, text=True)
        if res.returncode == 0:
            lines = res.stdout.split("=== BRIEFING GERADO ===")
            out = lines[1].strip() if len(lines) > 1 else res.stdout.strip()
            send_message(chat_id, out, reply_markup=get_back_to_panel_keyboard())
        else:
            send_message(chat_id, f"❌ Erro ao gerar briefing: {res.stderr.strip()}", reply_markup=get_back_to_panel_keyboard())

    else:
        # Mensagem em linguagem natural: passa para o cérebro NVIDIA Nemotron 550B
        send_message(chat_id, "🧠 *Consultando Nemotron 550B...*")
        answer = ask_nemotron_brain(text)
        send_message(chat_id, answer, reply_markup=get_back_to_panel_keyboard())

def run_polling():
    print(f"🚀 [TAVIBOT] Agente Secretário Soberano ativo para o usuário {ADMIN_USER_ID}...")
    offset = 0
    # Envia mensagem inicial com o teclado persistente e o painel de boas-vindas
    try:
        welcome = (
            "🚀 *Tavibot Conectado com Sucesso!*\n\n"
            "Olá Francisco! Seu Secretário Executivo Operacional está online 24/7 na VPS Hostinger KVM 4.\n\n"
            "Use os botões de atalho fixados no teclado ou acione `/painel` para o Cockpit interativo completo."
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
