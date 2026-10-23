#!/usr/bin/env python3
"""
MCT Sentinela de Frotas & Prevenção de Multa NIC (Não Indicação de Condutor)
Monitoramento do prazo de 30 dias (Art. 257 do CTB e Resolução CONTRAN 710/2017)
Alerta preventivo a <= 15 dias com Formulário FICI pré-preenchido para evitar duplicação da multa.
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import os
import sys
import json
import datetime
import argparse
from pathlib import Path

BASE_DIR = Path("/opt/plx-documentos/app/scripts")
if not BASE_DIR.exists():
    BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR.parent / "data"
if not DATA_DIR.exists():
    DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

INFRACÕES_FILE = DATA_DIR / "frotas_infracoes_nic.json"

# Base padrão de frotas ativas de clientes transportadoras/construção
FROTAS_PADRAO = [
    {
        "id": "AIT-SC-889102",
        "placa": "RLG4E12",
        "veiculo": "Scania R450 6x2 (Caminhão Trator)",
        "empresa": "TransOeste Cargas & Logística LTDA",
        "cnpj": "34.567.890/0001-22",
        "ait": "T104882190",
        "orgao": "PRF / Delegacia Chapecó",
        "codigo_infracao": "745-50",
        "descricao": "Transitar em velocidade superior à máxima em até 20%",
        "local": "BR-282, KM 534 - Chapecó / SC",
        "data_infracao": (datetime.date.today() - datetime.timedelta(days=18)).strftime("%Y-%m-%d"),
        "data_notificacao": (datetime.date.today() - datetime.timedelta(days=17)).strftime("%Y-%m-%d"),
        "valor_original": 130.16,
        "condutor_indicado": None,
        "cnh_condutor": None,
        "status": "PENDENTE"
    },
    {
        "id": "AIT-SC-889105",
        "placa": "MHP9A34",
        "veiculo": "Volvo FH 540 6x4 (Bitrem)",
        "empresa": "TransOeste Cargas & Logística LTDA",
        "cnpj": "34.567.890/0001-22",
        "ait": "T104882341",
        "orgao": "DETRAN-SC",
        "codigo_infracao": "574-63",
        "descricao": "Transitar em local/horário não permitido pela regulamentação",
        "local": "Av. General Osório - Chapecó / SC",
        "data_infracao": (datetime.date.today() - datetime.timedelta(days=22)).strftime("%Y-%m-%d"),
        "data_notificacao": (datetime.date.today() - datetime.timedelta(days=20)).strftime("%Y-%m-%d"),
        "valor_original": 130.16,
        "condutor_indicado": None,
        "cnh_condutor": None,
        "status": "PENDENTE"
    },
    {
        "id": "AIT-SC-889110",
        "placa": "QIJ7721",
        "veiculo": "Mercedes-Benz Atego 2426 (Caminhão Truck)",
        "empresa": "TransOeste Cargas & Logística LTDA",
        "cnpj": "34.567.890/0001-22",
        "ait": "T104882998",
        "orgao": "DNIT",
        "codigo_infracao": "605-03",
        "descricao": "Avançar sinal vermelho do semáforo ou parada obrigatória",
        "local": "BR-480, KM 4 - Acesso Plínio Arlindo de Nes",
        "data_infracao": (datetime.date.today() - datetime.timedelta(days=6)).strftime("%Y-%m-%d"),
        "data_notificacao": (datetime.date.today() - datetime.timedelta(days=5)).strftime("%Y-%m-%d"),
        "valor_original": 293.47,
        "condutor_indicado": None,
        "cnh_condutor": None,
        "status": "PENDENTE"
    }
]

def carregar_infracoes():
    if not INFRACÕES_FILE.exists():
        salvar_infracoes(FROTAS_PADRAO)
        return FROTAS_PADRAO
    try:
        with open(INFRACÕES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return FROTAS_PADRAO

def salvar_infracoes(dados):
    with open(INFRACÕES_FILE, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)

def calcular_prazos(infracao):
    """Calcula dias decorridos e restantes para os 30 dias fatais da Notificação."""
    try:
        dt_notif = datetime.datetime.strptime(infracao["data_notificacao"], "%Y-%m-%d").date()
    except Exception:
        dt_notif = datetime.date.today()
        
    hoje = datetime.date.today()
    prazo_fatal = dt_notif + datetime.timedelta(days=30)
    dias_restantes = (prazo_fatal - hoje).days
    dias_decorridos = (hoje - dt_notif).days
    
    # Classificação de Gravidade do Risco NIC
    if infracao.get("status") == "REGULARIZADO" or infracao.get("condutor_indicado"):
        status_nic = "REGULAR"
        cor = "🟢"
        alerta = "Condutor já indicado formalmente."
        multa_potencial = infracao["valor_original"]
    elif dias_restantes < 0:
        status_nic = "MULTA_NIC_GERADA"
        cor = "⚫"
        alerta = f"PRAZO EXPIRADO há {abs(dias_restantes)} dias! Multa NIC já em processo de emissão pelo órgão."
        # No mínimo o dobro da multa original
        multa_potencial = infracao["valor_original"] * 2
    elif dias_restantes <= 5:
        status_nic = "EMERGENCIA_CRITICA"
        cor = "🔴"
        alerta = f"RISCO MÁXIMO! Faltam apenas {dias_restantes} dias para a duplicação automática da multa!"
        multa_potencial = infracao["valor_original"] * 2
    elif dias_restantes <= 15:
        status_nic = "ALERTA_PREVENTIVO"
        cor = "🟡"
        alerta = f"ALERTA PREVENTIVO: Faltam {dias_restantes} dias para indicar condutor e evitar Multa NIC."
        multa_potencial = infracao["valor_original"] * 2
    else:
        status_nic = "MONITORANDO"
        cor = "🟢"
        alerta = f"Prazo regular: {dias_restantes} dias restantes."
        multa_potencial = infracao["valor_original"]

    return {
        "dt_notif": dt_notif.strftime("%d/%m/%Y"),
        "prazo_fatal": prazo_fatal.strftime("%d/%m/%Y"),
        "dias_restantes": dias_restantes,
        "dias_decorridos": dias_decorridos,
        "status_nic": status_nic,
        "cor": cor,
        "alerta": alerta,
        "multa_potencial": multa_potencial
    }

def gerar_formulario_fici(infracao, prazo_info):
    """
    Gera o texto do Formulário FICI (Formulário de Indicação do Condutor Infrator)
    pré-preenchido para envio imediato ao gestor da frota / WhatsApp.
    """
    return (
        "═══════════════════════════════════════════════\n"
        "   FORMULÁRIO FICI — INDICAÇÃO DE CONDUTOR PJ   \n"
        "   (Art. 257, § 7º e 8º do CTB / Res. CONTRAN 710)\n"
        "═══════════════════════════════════════════════\n"
        f"🏢 PROPRIETÁRIO (PJ): {infracao['empresa']}\n"
        f"📑 CNPJ: {infracao['cnpj']}\n"
        f"🚛 VEÍCULO: {infracao['veiculo']} | PLACA: {infracao['placa']}\n"
        f"📋 AUTO DE INFRAÇÃO (AIT): {infracao['ait']}\n"
        f"🏛️ ÓRGÃO AUTUADOR: {infracao['orgao']}\n"
        f"📍 LOCAL: {infracao['local']}\n"
        f"⚠️ INFRAÇÃO: {infracao['codigo_infracao']} - {infracao['descricao']}\n"
        f"💰 VALOR ORIGINAL: R$ {infracao['valor_original']:.2f}\n"
        f"🚨 SE NÃO INDICAR (MULTA NIC): R$ {prazo_info['multa_potencial']:.2f} (MULTIPLICADA)\n"
        f"⏰ DATA LIMITE FATAL: {prazo_info['prazo_fatal']} ({prazo_info['dias_restantes']} dias restantes)\n"
        "───────────────────────────────────────────────\n"
        "📝 DADOS DO CONDUTOR A SEREM PREENCHIDOS:\n"
        "Nome Completo: [________________________________________]\n"
        "CPF: [_______________]  RG: [__________________]\n"
        "Nº Registro CNH: [______________]  UF: [_____]\n"
        "Validade CNH: [___/___/____]\n"
        "Telefone / WhatsApp: [_____________________]\n"
        "\n"
        "Assinatura do Proprietário/PJ: ________________________\n"
        "Assinatura do Condutor Infrator: ______________________\n"
        "═══════════════════════════════════════════════"
    )

def auditar_frotas_nic():
    """Varre todas as infrações de PJ cadastradas e compila o relatório de risco NIC."""
    infracoes = carregar_infracoes()
    alertas_criticos = []
    relatorio = []

    total_veiculos = len(infracoes)
    total_multas_originais = sum(i["valor_original"] for i in infracoes)
    risco_total_nic = 0.0

    for i in infracoes:
        pz = calcular_prazos(i)
        i_aug = {**i, **pz}
        relatorio.append(i_aug)
        
        if pz["status_nic"] in ["ALERTA_PREVENTIVO", "EMERGENCIA_CRITICA", "MULTA_NIC_GERADA"]:
            alertas_criticos.append(i_aug)
            risco_total_nic += (pz["multa_potencial"] - i["valor_original"])

    return {
        "data_varredura": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"),
        "total_infracoes": total_veiculos,
        "total_alertas_criticos": len(alertas_criticos),
        "total_multas_originais": total_multas_originais,
        "risco_adicional_multa_nic": risco_total_nic,
        "infracoes": relatorio,
        "alertas_criticos": alertas_criticos
    }

def formatar_relatorio_telegram(audit_data):
    """Gera resumo executivo para o Tavibot no Telegram."""
    criticos = audit_data["alertas_criticos"]
    msg = (
        "🚛 *SENTINELA DE FROTAS & PREVENÇÃO DE MULTA NIC*\n"
        f"📅 *Auditoria:* {audit_data['data_varredura']}\n"
        f"⚠️ *Notificações em Risco:* {len(criticos)} de {audit_data['total_infracoes']}\n"
        f"💸 *Prejuízo Evitável de Multa NIC:* R$ {audit_data['risco_adicional_multa_nic']:,.2f}\n\n"
        "⚖️ *Regra CTB (Art. 257, § 8º):* Veículos de PJ sem condutor indicado no prazo de 30 dias "
        "geram nova multa com valor duplicado pelo fator multiplicador dos últimos 12 meses!\n\n"
    )

    if not criticos:
        msg += "🟢 *Nenhuma notificação em risco no momento! Todas as frotas com prazos regulares.*"
        return msg

    for c in criticos:
        msg += (
            f"{c['cor']} *Placa:* `{c['placa']}` | *AIT:* `{c['ait']}`\n"
            f"  • *Veículo:* {c['veiculo']}\n"
            f"  • *Infração:* {c['descricao']}\n"
            f"  • *Prazo Fatal:* `{c['prazo_fatal']}` (*{c['dias_restantes']} dias restantes*)\n"
            f"  • *Multa Atual:* R$ {c['valor_original']:,.2f} ➔ *Se NIC:* R$ {c['multa_potencial']:,.2f}\n"
            f"  • *Ação:* {c['alerta']}\n\n"
        )

    msg += "💡 *Dica:* Para gerar o FICI pré-preenchido de um veículo, acione o Tavibot com `/fici <PLACA>`."
    return msg

def indicar_condutor(ait_or_placa, nome_condutor, cnh):
    """Registra a indicação formal de condutor para afastar o risco de multa NIC."""
    infracoes = carregar_infracoes()
    encontrado = False
    
    ait_clean = ait_or_placa.strip().upper()
    for i in infracoes:
        if i["ait"].upper() == ait_clean or i["placa"].upper() == ait_clean:
            i["condutor_indicado"] = nome_condutor.strip()
            i["cnh_condutor"] = cnh.strip()
            i["data_indicacao"] = datetime.date.today().strftime("%Y-%m-%d")
            i["status"] = "REGULARIZADO"
            encontrado = True
            break
            
    if encontrado:
        salvar_infracoes(infracoes)
        return True, f"✅ Condutor {nome_condutor} vinculado com sucesso à infração {ait_clean}. Multa NIC neutralizada!"
    return False, f"❌ Infração ou Placa '{ait_clean}' não encontrada na base de frotas."

def main():
    parser = argparse.ArgumentParser(description="MCT Sentinela de Frotas & Multa NIC")
    subparsers = parser.add_subparsers(dest="subcommand")

    # Subcomando auditar
    subparsers.add_parser("auditar", help="Audita frotas e exibe notificações com risco de multa NIC")

    # Subcomando fici
    p_fici = subparsers.add_parser("fici", help="Gera formulário FICI pré-preenchido para uma placa")
    p_fici.add_argument("--placa", required=True, help="Placa do veículo")

    # Subcomando indicar
    p_indicar = subparsers.add_parser("indicar", help="Registra condutor indicado")
    p_indicar.add_argument("--alvo", required=True, help="Placa ou AIT")
    p_indicar.add_argument("--nome", required=True, help="Nome do condutor")
    p_indicar.add_argument("--cnh", required=True, help="Nº da CNH")

    args = parser.parse_args()

    if args.subcommand == "fici":
        infracoes = carregar_infracoes()
        achou = False
        for i in infracoes:
            if i["placa"].upper() == args.placa.strip().upper():
                pz = calcular_prazos(i)
                fici_txt = gerar_formulario_fici(i, pz)
                print(fici_txt)
                achou = True
                break
        if not achou:
            print(f"❌ Placa {args.placa} não encontrada.")

    elif args.subcommand == "indicar":
        sucesso, msg = indicar_condutor(args.alvo, args.nome, args.cnh)
        print(msg)

    else:
        # Default: auditar
        res = auditar_frotas_nic()
        print(formatar_relatorio_telegram(res))

if __name__ == "__main__":
    main()
