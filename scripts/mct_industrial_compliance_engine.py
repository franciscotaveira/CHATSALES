#!/usr/bin/env python3
"""
MCT DocOps & Compliance Industrial Engine (Construção Civil & Prestadores)
Auditoria de SST, ASO, NRs e Liberação de Obras para Aurora, BRF, Tirol, JBS
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import sys
import json
import datetime
import subprocess
from pathlib import Path

RULES_TABLE = '"data_table_user_chkrulesv1taveira"'
RUNS_TABLE = '"data_table_user_chkrunsv1taveira"'
DOCS_TABLE = '"data_table_user_3xiyVdhcSZl6qzP8"'

def run_psql(query):
    cmd = [
        "docker", "exec", "-i", "plx-n8n-db",
        "psql", "-U", "plx_user", "-d", "plx_n8n", "-t", "-A", "-c", query
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql error: {res.stderr.strip()}")
    return res.stdout.strip()

def seed_industrial_rules(group_id="120363999999999999@g.us", business_name="Construtora Piloto (Obras Industriais)"):
    print(f"🌱 [SEED-INDUSTRIAL] Configurando regras canônicas de SST e Obras para {business_name}...")
    rules = [
        ("RULE-ENG-CND-FGTS", "cnd_fgts", "empresa", "mensal", 5, "Certidão de Regularidade do FGTS (CRF 30 dias)"),
        ("RULE-ENG-CNDT", "cndt", "empresa", "semestral", 15, "Certidão Negativa de Débitos Trabalhistas (CNDT)"),
        ("RULE-ENG-CND-FED", "cnd_federal", "empresa", "semestral", 15, "Certidão Conjunta Federal e Previdenciária"),
        ("RULE-ENG-PGR", "pgr", "empresa", "anual", 30, "Programa de Gerenciamento de Riscos (PGR)"),
        ("RULE-ENG-PCMSO", "pcmso", "empresa", "anual", 30, "Programa de Controle Médico de Saúde Ocupacional (PCMSO)"),
        ("RULE-ENG-ASO", "aso", "colaborador", "anual", 15, "Atestado de Saúde Ocupacional (ASO Periódico/Apto)"),
        ("RULE-ENG-NR35", "nr35", "colaborador", "bienal", 20, "Certificado Treinamento NR-35 (Trabalho em Altura)"),
        ("RULE-ENG-NR33", "nr33", "colaborador", "anual", 20, "Certificado Treinamento NR-33 (Espaço Confinado)"),
        ("RULE-ENG-NR10", "nr10", "colaborador", "bienal", 20, "Certificado Treinamento NR-10 (Segurança em Instalações Elétricas)"),
        ("RULE-ENG-EPI", "ficha_epi", "colaborador", "semestral", 10, "Ficha de Entrega de EPI Devidamente Assinada")
    ]

    count = 0
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for rule_id, doc_type, dept, cadence, due_day, notes in rules:
        check = run_psql(f"SELECT count(*) FROM {RULES_TABLE} WHERE rule_id = '{rule_id}' AND group_id = '{group_id}';")
        if int(check or 0) == 0:
            msg_tpl = f"⚠️ [ALERTA COMPLIANCE] Vencimento próximo de {notes} ({dept}). Providencie renovação para evitar bloqueio na portaria."
            sql = f"""
            INSERT INTO {RULES_TABLE} 
            (rule_id, business_name, business_match_key, group_id, document_type, department, cadence, due_day, reminder_days, active, send_enabled, message_template, notes, "createdAt", "updatedAt")
            VALUES 
            ('{rule_id}', '{business_name}', 'ENG-PILOTO-01', '{group_id}', '{doc_type}', '{dept}', '{cadence}', {due_day}, '[-30, -15, -5]', true, false, '{msg_tpl}', '{notes}', '{now}', '{now}');
            """
            run_psql(sql)
            count += 1
            print(f"  + Regra de Obra inserida: {rule_id} ({doc_type} - {dept}) [send_enabled=false: MODO SOMBRA]")
        else:
            print(f"  * Regra já existente: {rule_id}")
    return count

def audit_gate_release(obra="Obra Aurora Coop Chapecó", group_id="120363999999999999@g.us"):
    """
    Simula e audita a liberação de portaria de uma equipe para a indústria contratante.
    """
    print(f"\n🚧 [GATE-AUDIT] Auditando Dossiê de Liberação de Portaria para: {obra}...")
    today = datetime.date.today()
    
    # Exemplo canônico de equipe de obra
    sample_team = [
        {"nome": "João da Silva", "funcao": "Mestre de Obras / Encarregado", "cpf": "012.345.678-90", "docs": {
            "aso": today + datetime.timedelta(days=120),
            "nr35": today + datetime.timedelta(days=45),
            "nr33": today + datetime.timedelta(days=200),
            "ficha_epi": today + datetime.timedelta(days=90)
        }},
        {"nome": "Carlos Eduardo Santos", "funcao": "Montador Industrial", "cpf": "234.567.890-12", "docs": {
            "aso": today + datetime.timedelta(days=15),  # ALERTA: Vence em 15 dias
            "nr35": today + datetime.timedelta(days=180),
            "nr33": today + datetime.timedelta(days=110),
            "ficha_epi": today + datetime.timedelta(days=60)
        }},
        {"nome": "Marcos Antônio Pereira", "funcao": "Eletricista Instalador", "cpf": "345.678.901-23", "docs": {
            "aso": today - datetime.timedelta(days=3),   # BLOQUEIO: Venceu há 3 dias!
            "nr35": today + datetime.timedelta(days=90),
            "nr10": today + datetime.timedelta(days=240),
            "ficha_epi": today + datetime.timedelta(days=30)
        }}
    ]

    lines = [
        f"# Dossiê de Liberação de Portaria (SST & Compliance) — {obra}",
        f"> **Auditoria Realizada em:** {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}",
        f"> **Contratante:** Aurora Coop | **Prestador:** Construtora Piloto",
        "",
        "## 1. Status Geral da Liberação",
    ]

    has_critical_block = False
    colab_results = []

    for colab in sample_team:
        issues = []
        warnings = []
        for doc, exp in colab["docs"].items():
            days_left = (exp - today).days
            if days_left < 0:
                issues.append(f"{doc.upper()} VENCIDO há {abs(days_left)} dia(s) (venceu {exp.strftime('%d/%m/%Y')})")
            elif days_left <= 15:
                warnings.append(f"{doc.upper()} vence em {days_left} dia(s) ({exp.strftime('%d/%m/%Y')})")
        
        if issues:
            status = "🔴 BARRADO NA PORTARIA"
            has_critical_block = True
            msg = " / ".join(issues)
        elif warnings:
            status = "🟡 LIBERADO COM RESSALVA"
            msg = " / ".join(warnings)
        else:
            status = "🟢 TOTALMENTE LIBERADO"
            msg = "Documentos e treinamentos 100% em dia"

        colab_results.append({
            "nome": colab["nome"],
            "funcao": colab["funcao"],
            "cpf": colab["cpf"],
            "status": status,
            "detalhes": msg
        })

    if has_critical_block:
        lines.append("🚨 **STATUS: ALERTA CRÍTICO DE BLOQUEIO NA GUARTA!**")
        lines.append("A portaria da indústria irá barrar colaboradores com exames ou treinamentos vencidos. Providencie a renovação imediata para evitar paralisação da equipe.")
    else:
        lines.append("✅ **STATUS: EQUIPE 100% APTA PARA ENTRADA NA FÁBRICA.**")

    lines.extend([
        "",
        "## 2. Mapa Nominal da Equipe da Obra",
        "| Colaborador | Função | CPF | Status de Entrada | Observações / Validades |",
        "|---|---|---|---|---|"
    ])

    for c in colab_results:
        lines.append(f"| **{c['nome']}** | {c['funcao']} | `{c['cpf']}` | {c['status']} | {c['detalhes']} |")

    lines.extend([
        "",
        "## 3. Diretriz de Ação Rápida (MCT DocOps)",
        "1. Os documentos renovados devem ser enviados diretamente no WhatsApp da construtora.",
        "2. A triagem automática via n8n arquiva o PDF diretamente na pasta do colaborador no Google Drive.",
        "3. O link da pasta do Drive compartilhada com o fiscal da Aurora/BRF é atualizado em tempo real."
    ])

    report_md = "\n".join(lines)
    print("\n" + report_md)
    return report_md

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "seed":
        seed_industrial_rules()
    elif cmd == "audit":
        audit_gate_release()
    elif cmd == "demo":
        seed_industrial_rules()
        audit_gate_release()
    else:
        print("Uso: python3 mct_industrial_compliance_engine.py [seed|audit|demo]")
