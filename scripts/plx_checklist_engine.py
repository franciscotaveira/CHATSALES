#!/usr/bin/env python3
"""
PLX Sovereign Checklist Engine (M02B) — Modo Sombra & Reconciliação Contábil
MCT OS v2.0 | Francisco Rios | PLX Contabilidade | Chapecó, SC
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

def seed_default_rules(group_id="120363430175893546@g.us", business_name="PLX Contabilidade (Piloto Assistido)"):
    print(f"🌱 [SEED] Configurando regras canônicas para grupo {group_id}...")
    rules = [
        ("RULE-01-NFE", "nf-e", "fiscal", "mensal", 5, "Notas Fiscais de Produto (NF-e)"),
        ("RULE-02-NFSE", "nfs-e", "fiscal", "mensal", 5, "Notas Fiscais de Serviço (NFS-e)"),
        ("RULE-03-BOLETO", "boleto", "contabil", "mensal", 10, "Boletos Pagos e Guias"),
        ("RULE-04-COMPROVANTE", "comprovante", "contabil", "mensal", 10, "Comprovantes de Transferência / Pix"),
        ("RULE-05-FGTS", "fgts", "pessoal", "mensal", 7, "Guia e Comprovante FGTS / Folha"),
        ("RULE-06-EXTRATO", "extrato", "contabil", "mensal", 5, "Extrato Bancário Mensal (PDF/OFX)")
    ]
    
    count = 0
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for rule_id, doc_type, dept, cadence, due_day, notes in rules:
        check = run_psql(f"SELECT count(*) FROM {RULES_TABLE} WHERE rule_id = '{rule_id}' AND group_id = '{group_id}';")
        if int(check or 0) == 0:
            msg_tpl = f"Prezado cliente, lembramos do envio de {notes} referente à competência do mês. Prazo: {due_day}."
            sql = f"""
            INSERT INTO {RULES_TABLE} 
            (rule_id, business_name, business_match_key, group_id, document_type, department, cadence, due_day, reminder_days, active, send_enabled, message_template, notes, "createdAt", "updatedAt")
            VALUES 
            ('{rule_id}', '{business_name}', 'PLX-PILOTO-01', '{group_id}', '{doc_type}', '{dept}', '{cadence}', {due_day}, '[-2, 0, 2]', true, false, '{msg_tpl}', '{notes}', '{now}', '{now}');
            """
            run_psql(sql)
            count += 1
            print(f"  + Regra inserida: {rule_id} ({doc_type} - {dept}, dia {due_day}) [send_enabled=false: MODO SOMBRA]")
        else:
            print(f"  * Regra já existente: {rule_id}")
    return count

def materialize(competence="2026-10", group_id="120363430175893546@g.us"):
    print(f"📋 [MATERIALIZE] Materializando checklist para competência {competence}...")
    rules_raw = run_psql(f"SELECT rule_id, due_day, document_type FROM {RULES_TABLE} WHERE group_id = '{group_id}' AND active = true;")
    if not rules_raw:
        print("Nenhuma regra ativa encontrada.")
        return 0

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    created = 0
    for line in rules_raw.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        rule_id, due_day, doc_type = parts[0], int(parts[1]), parts[2]
        exec_id = f"CHK-{competence}-{rule_id}"
        expected_by = f"{competence}-{due_day:02d}"

        check = run_psql(f"SELECT count(*) FROM {RUNS_TABLE} WHERE execution_id = '{exec_id}';")
        if int(check or 0) == 0:
            sql = f"""
            INSERT INTO {RUNS_TABLE}
            (execution_id, rule_id, competence, status, expected_by, found_count, document_ids, reminder_count, message, checked_at, "createdAt", "updatedAt")
            VALUES
            ('{exec_id}', '{rule_id}', '{competence}', 'PENDING', '{expected_by}', 0, '[]', 0, 'Aguardando verificação', '{now}', '{now}', '{now}');
            """
            run_psql(sql)
            created += 1
            print(f"  + Item de checklist materializado: {exec_id} (esperado até {expected_by})")
        else:
            print(f"  * Item já materializado: {exec_id}")
    return created

def reconcile(competence="2026-10", group_id="120363430175893546@g.us"):
    print(f"🔍 [RECONCILE] Reconciliando documentos recebidos para competência {competence}...")
    runs_raw = run_psql(f"""
        SELECT r.execution_id, r.rule_id, r.expected_by, k.document_type, k.department 
        FROM {RUNS_TABLE} r
        JOIN {RULES_TABLE} k ON r.rule_id = k.rule_id
        WHERE r.competence = '{competence}' AND k.group_id = '{group_id}';
    """)
    if not runs_raw:
        print("Nenhuma execução de checklist encontrada para esta competência.")
        return []

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    today_str = datetime.date.today().isoformat()
    results = []

    for line in runs_raw.splitlines():
        if not line.strip():
            continue
        exec_id, rule_id, expected_by, doc_type, dept = line.split("|")
        
        # Consultar documentos correspondentes no acervo da competência
        docs_raw = run_psql(f"""
            SELECT id, drive_file_id 
            FROM {DOCS_TABLE} 
            WHERE group_id = '{group_id}' 
              AND document_type = '{doc_type}' 
              AND reference_date LIKE '{competence}%';
        """)
        
        doc_ids = []
        drive_ids = []
        if docs_raw:
            for d in docs_raw.splitlines():
                if d.strip():
                    parts = d.split("|")
                    doc_ids.append(parts[0])
                    if len(parts) > 1 and parts[1]:
                        drive_ids.append(parts[1])

        found_count = len(doc_ids)
        if found_count > 0:
            status = "RECEIVED"
            msg = f"{found_count} documento(s) recebido(s) e arquivado(s) no Drive"
        else:
            if today_str > expected_by:
                status = "OVERDUE"
                msg = f"Documento faltante em atraso (prazo era {expected_by})"
            else:
                status = "PENDING"
                msg = f"Pendente dentro do prazo (vence em {expected_by})"

        doc_ids_json = json.dumps(doc_ids)
        sql = f"""
        UPDATE {RUNS_TABLE}
        SET status = '{status}',
            found_count = {found_count},
            document_ids = '{doc_ids_json}',
            message = '{msg}',
            checked_at = '{now}',
            "updatedAt" = '{now}'
        WHERE execution_id = '{exec_id}';
        """
        run_psql(sql)
        results.append({
            "execution_id": exec_id,
            "rule_id": rule_id,
            "document_type": doc_type,
            "department": dept,
            "status": status,
            "found_count": found_count,
            "expected_by": expected_by,
            "message": msg,
            "drive_ids": drive_ids
        })
        print(f"  -> [{status}] {rule_id} ({doc_type}): {msg}")

    return results

def report(competence="2026-10", group_id="120363430175893546@g.us"):
    print(f"\n📊 [REPORT] Gerando relatório de conferência contábil (Modo Sombra)...")
    res = reconcile(competence, group_id)
    if not res:
        print("Nenhum dado reconciliado.")
        return

    total = len(res)
    received = sum(1 for r in res if r["status"] == "RECEIVED")
    overdue = sum(1 for r in res if r["status"] == "OVERDUE")
    pending = sum(1 for r in res if r["status"] == "PENDING")
    compliance_rate = (received / total * 100) if total > 0 else 0

    lines = [
        f"# Relatório de Checklist Contábil (M02B) — Competência {competence}",
        f"> **Grupo:** `{group_id}` | **Modo de Operação:** SHADOW (Modo Sombra Governança)",
        f"> **Data da Auditoria:** {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}",
        "",
        "## Resumo Executivo de Conformidade",
        f"- **Total de Obrigações Mapeadas:** {total}",
        f"- **Obrigações Cumpridas (Recebidas no Drive):** {received} ({compliance_rate:.1f}%)",
        f"- **Obrigações em Atraso (Faltantes):** {overdue}",
        f"- **Obrigações Pendentes (Dentro do Prazo):** {pending}",
        f"- **Disparo de Mensagens WhatsApp:** BLOQUEADO (`send_enabled = false` — Zero poluição externa)",
        "",
        "## Detalhamento por Obrigação",
        "| Regra | Departamento | Tipo Documental | Status | Docs Recebidos | Prazo Limite | Situação |",
        "|---|---|---|---|---|---|---|"
    ]

    for r in res:
        badge = "✅ RECEBIDO" if r["status"] == "RECEIVED" else ("🚨 EM ATRASO" if r["status"] == "OVERDUE" else "⏳ PENDENTE")
        lines.append(f"| `{r['rule_id']}` | {r['department'].capitalize()} | {r['document_type'].upper()} | {badge} | {r['found_count']} | {r['expected_by']} | {r['message']} |")

    lines.extend([
        "",
        "## Evidências de Arquivamento no Drive",
        "Os seguintes documentos foram conferidos e vinculados às obrigações cumpridas:"
    ])

    for r in res:
        if r["drive_ids"]:
            sample_ids = ", ".join(f"`{d}`" for d in r["drive_ids"][:3])
            lines.append(f"- **{r['document_type'].upper()}:** {len(r['drive_ids'])} arquivo(s) verificado(s) no Drive (IDs de amostra: {sample_ids})")

    content = "\n".join(lines)
    out_dir = Path("/opt/plx-documentos/app/evidence")
    out_dir.mkdir(parents=True, exist_ok=True)
    report_file = out_dir / f"checklist-report-{competence}.md"
    report_file.write_text(content, encoding="utf-8")
    print(f"\n📄 Relatório gravado com sucesso em: {report_file}")
    print("\n" + content)

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "shadow-run"
    comp = sys.argv[2] if len(sys.argv) > 2 else "2026-10"
    
    if cmd == "seed":
        seed_default_rules()
    elif cmd == "materialize":
        materialize(comp)
    elif cmd == "reconcile":
        reconcile(comp)
    elif cmd == "report":
        report(comp)
    elif cmd == "shadow-run":
        seed_default_rules()
        materialize(comp)
        report(comp)
    else:
        print("Uso: python3 plx_checklist_engine.py [seed|materialize|reconcile|report|shadow-run] [competencia]")
