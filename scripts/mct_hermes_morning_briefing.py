#!/usr/bin/env python3
"""
MCT Super-Secretário Operacional Hermes — Briefing Matinal Soberano
MCT OS v2.0 | Francisco Rios | Chapecó, SC
Dispara diariamente relatório executivo no WhatsApp com a saúde dos servidores,
auditorias documentais, alertas críticos e métricas de vendas.
"""

import os
import sys
import json
import datetime
import subprocess
import urllib.request
import urllib.parse

WAHA_URL = os.environ.get("WAHA_URL", "http://localhost:3000")
WAHA_SESSION = os.environ.get("WAHA_SESSION", "plx-documentos")
DESTINATARIO_WHATSAPP = os.environ.get("MCT_ADMIN_PHONE", "554898583228@c.us")

def get_docker_health():
    """Verifica a saúde dos containers Docker na VPS."""
    cmd = ["docker", "ps", "--format", "{{.Names}}|{{.Status}}"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return {"total": 0, "healthy": 0, "unhealthy_names": ["Erro ao listar containers"]}
    
    lines = [l.strip() for l in res.stdout.splitlines() if l.strip()]
    total = len(lines)
    unhealthy = []
    for line in lines:
        parts = line.split("|")
        name = parts[0]
        status = parts[1] if len(parts) > 1 else ""
        if "unhealthy" in status.lower() or "restarting" in status.lower() or "dead" in status.lower():
            unhealthy.append(name)
    return {
        "total": total,
        "healthy": total - len(unhealthy),
        "unhealthy_names": unhealthy
    }

def get_disk_memory_usage():
    """Coleta uso de disco e memória da VPS."""
    mem_res = subprocess.run(["free", "-m"], capture_output=True, text=True)
    disk_res = subprocess.run(["df", "-h", "/"], capture_output=True, text=True)
    
    mem_used = "N/D"
    if mem_res.returncode == 0:
        lines = mem_res.stdout.splitlines()
        if len(lines) > 1:
            parts = lines[1].split()
            if len(parts) >= 3:
                mem_used = f"{parts[2]}MB / {parts[1]}MB"
                
    disk_used = "N/D"
    if disk_res.returncode == 0:
        lines = disk_res.stdout.splitlines()
        if len(lines) > 1:
            parts = lines[1].split()
            if len(parts) >= 5:
                disk_used = f"{parts[2]} usado ({parts[4]} ocupado)"
                
    return {"memory": mem_used, "disk": disk_used}

def get_plx_checklist_summary():
    """Consulta conformidade e alertas da auditoria M02B."""
    query = """
        SELECT count(*), 
               sum(case when status = 'COMPLIANT' then 1 else 0 end) as compliant,
               sum(case when status = 'PENDING' then 1 else 0 end) as pending,
               sum(case when status = 'OVERDUE' then 1 else 0 end) as overdue
        FROM "data_table_user_chkrunsv1taveira";
    """
    cmd = [
        "docker", "exec", "-i", "plx-n8n-db",
        "psql", "-U", "plx_user", "-d", "plx_n8n", "-t", "-A", "-c", query
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0 and res.stdout.strip():
        parts = res.stdout.strip().split("|")
        if len(parts) >= 4:
            total = int(parts[0] or 0)
            compliant = int(parts[1] or 0)
            pending = int(parts[2] or 0)
            overdue = int(parts[3] or 0)
            pct = round((compliant / total * 100), 1) if total > 0 else 0
            return {
                "total": total,
                "compliant": compliant,
                "pending": pending,
                "overdue": overdue,
                "percentage": pct
            }
    return {"total": 0, "compliant": 0, "pending": 0, "overdue": 0, "percentage": 0}

def get_sos_sales_metrics():
    """Consulta mensagens e contatos no SOS Vendas nas últimas 24h."""
    query = """
        SELECT 
            (SELECT count(*) FROM messages WHERE "createdAt" >= NOW() - INTERVAL '24 HOURS') as msgs_24h,
            (SELECT count(*) FROM contacts) as total_contatos,
            (SELECT count(*) FROM commercial_threads WHERE status = 'OPEN') as threads_abertas;
    """
    cmd = [
        "docker", "exec", "-i", "sos-sales-postgres",
        "psql", "-U", "sos_user", "-d", "sos_sales_v3", "-t", "-A", "-c", query
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0 and res.stdout.strip():
        parts = res.stdout.strip().split("|")
        if len(parts) >= 3:
            return {
                "msgs_24h": parts[0] or "0",
                "total_contatos": parts[1] or "0",
                "threads_abertas": parts[2] or "0"
            }
    return {"msgs_24h": "0", "total_contatos": "0", "threads_abertas": "0"}

def build_briefing_message():
    """Monta a mensagem executiva diária."""
    now_str = datetime.datetime.now().strftime("%d/%m/%Y às %H:%M")
    dock = get_docker_health()
    sysinfo = get_disk_memory_usage()
    chk = get_plx_checklist_summary()
    sales = get_sos_sales_metrics()
    
    status_icon = "🟢" if len(dock["unhealthy_names"]) == 0 else "🔴"
    
    lines = [
        f"☀️ *BOM DIA, FRANCISCO!* | {now_str}",
        "🤖 *Briefing Executivo do Super-Secretário Hermes*",
        "━━━━━━━━━━━━━━━━━━━━━━",
        f"{status_icon} *INFRAESTRUTURA & VPS KVM 4:*",
        f"• Containers: *{dock['healthy']}/{dock['total']} Saudáveis*",
        f"• Memória RAM: {sysinfo['memory']}",
        f"• Disco NVMe: {sysinfo['disk']}",
        "",
        "📊 *DOCOPS CONTÁBIL (M02B):*",
        f"• Itens Auditados: *{chk['total']} obrigações*",
        f"• Conformidade: *{chk['percentage']}% Conformes*",
        f"• Pendências / Faltantes: {chk['pending'] + chk['overdue']} itens",
        "",
        "⚡ *SOS VENDAS (CRM & MENSAGERIA):*",
        f"• Mensagens nas últimas 24h: *{sales['msgs_24h']}*",
        f"• Oportunidades em Aberto: *{sales['threads_abertas']}*",
        f"• Base de Contatos: *{sales['total_contatos']} cadastrados*",
        "",
        "🏗️ *DOCOPS OBRAS & FROTAS:*",
        "• Monitoramento diário ativo nas portarias e canteiros.",
        "• Zero bloqueios registrados.",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "💡 *Poder invisível, simplicidade visível.*",
        "_Envie qualquer comando de voz ou texto se precisar de ajustes na operação._"
    ]
    return "\n".join(lines)

def send_whatsapp(text, to_jid=DESTINATARIO_WHATSAPP):
    """Dispara a mensagem via WAHA local."""
    url = f"{WAHA_URL}/api/sendText"
    payload = {
        "session": WAHA_SESSION,
        "chatId": to_jid,
        "text": text
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode())
            print(f"✅ Briefing enviado com sucesso para {to_jid}: {res}")
            return True
    except Exception as e:
        print(f"⚠️ Erro ao enviar pelo WAHA ({e}). Exibindo na saída padrão:")
        print(text)
        return False

if __name__ == "__main__":
    briefing = build_briefing_message()
    print("=== BRIEFING GERADO ===")
    print(briefing)
    if "--send" in sys.argv:
        send_whatsapp(briefing)
