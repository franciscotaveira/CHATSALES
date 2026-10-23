#!/usr/bin/env python3
"""
MCT Soberano — Suite E2E de Validação Integral dos 5 Mercados Ocultos
Executa baterias de testes automatizados com dados reais e asserções estritas.
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import os
import sys
import json
import time
import urllib.request
from pathlib import Path

BASE_DIR = Path("/opt/plx-documentos/app/scripts")
if not BASE_DIR.exists():
    BASE_DIR = Path(__file__).resolve().parent

sys.path.insert(0, str(BASE_DIR))

# Cores para terminal
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

results = []

def run_test(name, fn):
    print(f"{CYAN}▶ Executando: {BOLD}{name}{RESET}...", end=" ", flush=True)
    t0 = time.time()
    try:
        fn()
        elapsed = time.time() - t0
        print(f"{GREEN}✔ PASS{RESET} ({elapsed:.2f}s)")
        results.append({"name": name, "status": "PASS", "time": elapsed})
    except Exception as e:
        elapsed = time.time() - t0
        print(f"{RED}✖ FAIL{RESET} ({elapsed:.2f}s)\n  {RED}Erro: {e}{RESET}")
        results.append({"name": name, "status": "FAIL", "time": elapsed, "error": str(e)})

# ─────────────────────────────────────────────────────────────
# 1. TESTES ETAPA 1: RADAR PNCP & CND SENTINEL
# ─────────────────────────────────────────────────────────────
def test_pncp_radar_live_fetch():
    import mct_pncp_radar
    opps = mct_pncp_radar.fetch_pncp_opportunities(days_back=5, uf_filter="SC")
    assert isinstance(opps, list), "Oportunidades devem ser uma lista"
    print(f"[{len(opps)} oportunidades encontradas]", end=" ")

def test_pncp_cnd_integration():
    import mct_pncp_radar
    cnd = mct_pncp_radar.simulate_cnd_check("69.553.990/0001-91", "MCT LTDA")
    assert "fgts" in cnd, "Resultado CND deve conter fgts"
    assert "cndt" in cnd, "Resultado CND deve conter cndt"
    assert "receita_federal" in cnd, "Resultado CND deve conter receita_federal"
    assert cnd["fgts"]["status"] == "REGULAR", "FGTS deve estar REGULAR"
    assert cnd["cndt"]["status"] == "REGULAR", "CNDT deve estar REGULAR"
    assert cnd["receita_federal"]["status"] == "REGULAR", "Receita Federal deve estar REGULAR"

def test_pncp_formatting_telegram():
    import mct_pncp_radar
    relatorio = mct_pncp_radar.generate_radar_report(uf="SC")
    assert "MCT RADAR B2G" in relatorio, "Relatório deve conter cabeçalho do radar"
    assert "Status de Habilitação do CNPJ" in relatorio, "Relatório deve conter status de CND"

# ─────────────────────────────────────────────────────────────
# 2. TESTES ETAPA 2: AUDITOR DE PIS/COFINS MONOFÁSICOS
# ─────────────────────────────────────────────────────────────
SAMPLE_XML_NFE = """<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe42261008283744000140550010000045211000045218" versao="4.00">
      <ide>
        <nNF>4521</nNF>
        <dhEmi>2026-10-21T14:32:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>08283744000140</CNPJ>
        <xNome>AUTO PECAS &amp; MECANICA CHAPECOENSE LTDA</xNome>
        <CRT>1</CRT>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>FRE-001</cProd>
          <xProd>PASTILHA DE FREIO DIANTEIRA CERAMICA</xProd>
          <NCM>87083090</NCM>
          <CFOP>5102</CFOP>
          <vProd>480.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>BAT-060</cProd>
          <xProd>BATERIA AUTOMOTIVA 60AH 12V</xProd>
          <NCM>85071010</NCM>
          <CFOP>5102</CFOP>
          <vProd>550.00</vProd>
        </prod>
      </det>
      <det nItem="3">
        <prod>
          <cProd>SRV-010</cProd>
          <xProd>SERVICO DE TROCA E BALANCEAMENTO</xProd>
          <NCM>00000000</NCM>
          <CFOP>5933</CFOP>
          <vProd>220.00</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>"""

def test_monofasicos_parser_calculation():
    import mct_monofasicos_auditor
    report = mct_monofasicos_auditor.audit_nfe_xml(SAMPLE_XML_NFE)
    assert report["sucesso"] is True, "Auditoria do XML deve retornar sucesso"
    assert report["numero_nota"] == "4521", "Número da nota deve ser 4521"
    assert report["total_produtos"] == 1250.0, f"Total produtos esperado 1250.0, obtido {report['total_produtos']}"
    assert report["total_monofasico"] == 1030.0, f"Total monofásico esperado 1030.0, obtido {report['total_monofasico']}"
    assert report["itens_monofasicos_encontrados"] == 2, "Devem ser encontrados 2 itens monofásicos"
    assert report["imposto_recuperavel_estimado"] > 0, "Imposto recuperável deve ser maior que zero"

def test_test_drive_web_route_live():
    url = "https://automatizaprocessos.tech/test-drive/"
    req = urllib.request.Request(url, headers={"User-Agent": "MCT-Test-Runner/2.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        assert resp.status == 200, f"Status esperado 200, obtido {resp.status}"
        body = resp.read().decode('utf-8')
        assert "nfe_monofasico" in body, "Test-drive deve conter função nfe_monofasico"
        assert "Lei 10.147/2000" in body, "Test-drive deve citar Lei 10.147/2000"
        assert "ctaWppBtn" in body, "Test-drive deve conter botão de CTA WhatsApp"

# ─────────────────────────────────────────────────────────────
# 3. TESTES ETAPA 3: CONCILIADOR OFX (DOCOPS M02C)
# ─────────────────────────────────────────────────────────────
SAMPLE_OFX = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>756
<ACCTID>14582-9
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261001000000
<DTEND>20261021235959
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261005120000
<TRNAMT>-3200.00
<FITID>20261005001
<MEMO>PIX TRANSF FORNECEDOR CIMENTO OESTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261008103000
<TRNAMT>-450.00
<FITID>20261008002
<MEMO>PAGTO ELETRON POSTO IPIRANGA COMBUSTIVEL
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261010150000
<TRNAMT>18500.00
<FITID>20261010003
<MEMO>PIX RECEBIDO MEDICAO OBRA EDIFICIO AURORA
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>"""

def test_ofx_parser_and_conciliation():
    import mct_ofx_conciliator
    parsed = mct_ofx_conciliator.parse_ofx(SAMPLE_OFX)
    assert parsed["banco"] == "756", f"Banco esperado 756, obtido {parsed['banco']}"
    assert parsed["conta"] == "14582-9", f"Conta esperada 14582-9, obtida {parsed['conta']}"
    assert len(parsed["transacoes"]) == 3, f"Esperadas 3 transações, obtidas {len(parsed['transacoes'])}"
    
    # Testa conciliação
    reconciled = mct_ofx_conciliator.reconcile_with_database(parsed)
    assert reconciled["banco"] == "756", "Banco no relatório deve ser 756"
    assert reconciled["total"] == 3, f"Total esperado 3, obtido {reconciled['total']}"
    assert "taxa_conciliacao" in reconciled, "Deve calcular taxa de conciliação"
    
    # Testa relatório formatado para Telegram
    report_txt = mct_ofx_conciliator.format_reconciliation_report(reconciled)
    assert "CONCILIAÇÃO BANCÁRIA OFX" in report_txt, "Relatório deve conter cabeçalho OFX"
# ─────────────────────────────────────────────────────────────
# 4. TESTES ETAPA 4: MOTOR TERCEIRO SETOR & IMUNIDADE FISCAL
# ─────────────────────────────────────────────────────────────
def test_terceiro_setor_receipt_and_pdf():
    import mct_terceiro_setor_engine
    res = mct_terceiro_setor_engine.emitir_recibo(
        doador="Dra. Helena Vasconcelos",
        cpf="543.210.987-65",
        valor=4750.50,
        finalidade="Construção e Manutenção do Templo",
        gerar_pdf=True
    )
    assert res["status"] == "EMITIDO", "Status do recibo deve ser EMITIDO"
    rec = res["recibo"]
    assert rec["valor"] == 4750.50, "Valor do recibo deve ser 4750.50"
    assert len(rec["hash_autenticidade"]) == 64, "Hash SHA-256 deve ter 64 caracteres"
    assert res["pdf_path"] is not None, "Caminho do PDF não pode ser nulo"
    
    pdf_p = Path(res["pdf_path"])
    assert pdf_p.exists(), f"Arquivo PDF {pdf_p} deve existir no disco"
    assert pdf_p.stat().st_size > 1000, f"Arquivo PDF deve ter tamanho válido (> 1KB), tem {pdf_p.stat().st_size} bytes"
    with open(pdf_p, "rb") as f:
        header = f.read(5)
        assert header.startswith(b"%PDF"), f"Cabeçalho do PDF deve iniciar com %PDF, obtido {header}"

def test_terceiro_setor_ledger_integrity():
    import mct_terceiro_setor_engine
    resumo = mct_terceiro_setor_engine.obter_resumo_livro_caixa()
    assert resumo["total_lancamentos"] >= 1, "Livro caixa deve conter pelo menos 1 lançamento"
    assert resumo["saldo"] == (resumo["total_entradas"] - resumo["total_saidas"]), "Saldo deve ser Entradas - Saídas"

# ─────────────────────────────────────────────────────────────
# 5. TESTES ETAPA 5: SENTINELA DE FROTAS & MULTA NIC
# ─────────────────────────────────────────────────────────────
def test_frotas_nic_deadlines_and_status():
    import mct_frotas_nic_sentinel
    audit = mct_frotas_nic_sentinel.auditar_frotas_nic()
    assert audit["total_infracoes"] > 0, "Deve conter infrações de frotas cadastradas"
    assert isinstance(audit["alertas_criticos"], list), "Alertas críticos deve ser uma lista"
    assert audit["risco_adicional_multa_nic"] >= 0, "Risco adicional de multa NIC deve ser >= 0"

def test_frotas_fici_form_generation():
    import mct_frotas_nic_sentinel
    infracoes = mct_frotas_nic_sentinel.carregar_infracoes()
    assert len(infracoes) > 0, "Deve haver infrações disponíveis"
    alvo = infracoes[0]
    pz = mct_frotas_nic_sentinel.calcular_prazos(alvo)
    form = mct_frotas_nic_sentinel.gerar_formulario_fici(alvo, pz)
    assert "FORMULÁRIO FICI" in form, "Formulário deve conter cabeçalho FICI"
    assert alvo["placa"] in form, "Formulário deve conter a placa do veículo"
    assert alvo["ait"] in form, "Formulário deve conter o número do AIT"
    assert "MULTA NIC" in form, "Formulário deve alertar sobre o risco de Multa NIC"

def test_frotas_nominate_driver():
    import mct_frotas_nic_sentinel
    infracoes = mct_frotas_nic_sentinel.carregar_infracoes()
    alvo = infracoes[0]
    sucesso, msg = mct_frotas_nic_sentinel.indicar_condutor(alvo["placa"], "Carlos Alberto Souza", "05892184912")
    assert sucesso is True, f"Indicação de condutor deve retornar sucesso: {msg}"
    
    # Recarrega e valida se o status mudou
    infracoes_atualizadas = mct_frotas_nic_sentinel.carregar_infracoes()
    alvo_atualizado = [i for i in infracoes_atualizadas if i["placa"] == alvo["placa"]][0]
    assert alvo_atualizado["status"] == "REGULARIZADO", "Status deve ter mudado para REGULARIZADO"
    assert alvo_atualizado["condutor_indicado"] == "Carlos Alberto Souza", "Condutor indicado deve estar registrado"

# ─────────────────────────────────────────────────────────────
# 6. TESTES INTEGRAÇÃO TAVIBOT
# ─────────────────────────────────────────────────────────────
def test_tavibot_handlers():
    import mct_telegram_secretary
    
    # Testa handler de licitações
    rep_licit = mct_telegram_secretary.handle_licitacoes()
    assert "MCT RADAR B2G" in rep_licit, "handle_licitacoes deve retornar relatório formatado"
    
    # Testa handler de conciliação
    rep_conc = mct_telegram_secretary.handle_conciliar()
    assert "CONCILIAÇÃO BANCÁRIA OFX" in rep_conc, "handle_conciliar deve retornar relatório formatado"
    
    # Testa handler de doação
    rep_doacao = mct_telegram_secretary.handle_doacao("/doacao Amigo da Comunidade | 987.654.321-00 | 500.00 | Dízimo")
    assert "RECIBO FORMAL DE DOAÇÃO" in rep_doacao, "handle_doacao deve retornar recibo formatado"
    
    # Testa handler de frotas
    rep_frotas = mct_telegram_secretary.handle_frotas()
    assert "SENTINELA DE FROTAS" in rep_frotas, "handle_frotas deve retornar status de frotas"
    
    # Testa handler de FICI
    rep_fici = mct_telegram_secretary.handle_fici("/fici RLG4E12")
    assert "FORMULÁRIO FICI" in rep_fici, "handle_fici deve retornar formulário formatado"

def main():
    print(f"\n{BOLD}══════════════════════════════════════════════════════════════════{RESET}")
    print(f"{BOLD}   MCT OS v2.0 — SUITE DE TESTES E2E: 5 MERCADOS OCULTOS          {RESET}")
    print(f"{BOLD}══════════════════════════════════════════════════════════════════{RESET}\n")

    # 1. Radar PNCP B2G
    run_test("1.1 Radar PNCP: Consulta em tempo real à API PNCP", test_pncp_radar_live_fetch)
    run_test("1.2 Radar PNCP: Cruzamento com CNDs (FGTS, CNDT, Receita)", test_pncp_cnd_integration)
    run_test("1.3 Radar PNCP: Formatação executiva Telegram", test_pncp_formatting_telegram)

    # 2. Auditor Monofásicos
    run_test("2.1 Auditor Monofásicos: Parse de XML e segregação de tributos", test_monofasicos_parser_calculation)
    run_test("2.2 Test-Drive Web: Disponibilidade HTTP 200 e scripts ativos", test_test_drive_web_route_live)

    # 3. Conciliador OFX
    run_test("3.1 Conciliador OFX: Parser determinístico e conciliação", test_ofx_parser_and_conciliation)

    # 4. Motor Terceiro Setor
    run_test("4.1 Terceiro Setor: Emissão de recibo, SHA-256 e PDF físico", test_terceiro_setor_receipt_and_pdf)
    run_test("4.2 Terceiro Setor: Integridade do Livro Caixa e saldo", test_terceiro_setor_ledger_integrity)

    # 5. Sentinela de Frotas & NIC
    run_test("5.1 Sentinela Frotas: Cálculo de prazos CTB 257 e risco NIC", test_frotas_nic_deadlines_and_status)
    run_test("5.2 Sentinela Frotas: Geração do Formulário FICI pré-preenchido", test_frotas_fici_form_generation)
    run_test("5.3 Sentinela Frotas: Indicação de condutor e neutralização do risco", test_frotas_nominate_driver)

    # 6. Integração Tavibot
    run_test("6.1 Tavibot Telegram: Execução de todos os handlers de comando", test_tavibot_handlers)

    # Sumário
    total = len(results)
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = total - passed

    print(f"\n{BOLD}══════════════════════════════════════════════════════════════════{RESET}")
    if failed == 0:
        print(f"{GREEN}{BOLD}✔ TODOS OS {total} TESTES PASSARAM COM SUCESSO! (100% CONFORMIDADE){RESET}")
    else:
        print(f"{RED}{BOLD}✖ {failed} DE {total} TESTES FALHARAM!{RESET}")
    print(f"{BOLD}══════════════════════════════════════════════════════════════════{RESET}\n")

    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
