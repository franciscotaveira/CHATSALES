#!/usr/bin/env python3
"""
MCT Motor do Terceiro Setor & Imunidade Fiscal (Igrejas, Associações e ONGs)
Inspirado em hiltonbruce/Igreja e Art. 150, VI, 'b' da Constituição Federal
Emissão de Recibos Formais com CPF, Assinatura Digital SHA-256 e Livro Caixa Soberano
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import os
import sys
import json
import hashlib
import datetime
import argparse
from pathlib import Path

# Diretórios de persistência
BASE_DIR = Path("/opt/plx-documentos/app/scripts")
if not BASE_DIR.exists():
    BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR.parent / "data"
if not DATA_DIR.exists():
    DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

RECIBOS_DIR = DATA_DIR / "recibos"
RECIBOS_DIR.mkdir(parents=True, exist_ok=True)

LEDGER_FILE = DATA_DIR / "livro_caixa_terceiro_setor.json"

# Dados institucionais padrão da entidade religiosa/terceiro setor
ENTIDADE_PADRAO = {
    "razao_social": "COMUNIDADE CRISTÃ SOBERANA - TERCEIRO SETOR",
    "cnpj": "48.291.832/0001-44",
    "endereco": "Av. Fernando Machado, Centro - Chapecó / SC",
    "tesoureiro": "Tesouraria Geral MCT",
    "fundamentacao_legal": "Art. 150, VI, 'b' da CF/88 c/c Lei nº 9.532/1997 e Lei nº 13.019/2014"
}

def numero_para_extenso(valor):
    """Conversor simples de moeda para extenso em português."""
    centavos = int(round((valor - int(valor)) * 100))
    inteiro = int(valor)
    
    unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"]
    de_10_a_19 = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"]
    dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]
    centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"]

    def converte_ate_999(n):
        if n == 0:
            return ""
        if n == 100:
            return "cem"
        c = n // 100
        d = (n % 100) // 10
        u = n % 10
        partes = []
        if c > 0:
            partes.append(centenas[c])
        if d == 1:
            partes.append(de_10_a_19[u])
        else:
            if d > 1:
                partes.append(dezenas[d])
            if u > 0:
                partes.append(unidades[u])
        return " e ".join(partes)

    if inteiro == 0:
        texto_int = "zero reais"
    elif inteiro == 1:
        texto_int = "um real"
    elif inteiro < 1000:
        texto_int = f"{converte_ate_999(inteiro)} reais"
    elif inteiro < 1000000:
        milhar = inteiro // 1000
        resto = inteiro % 1000
        milhar_txt = "mil" if milhar == 1 else f"{converte_ate_999(milhar)} mil"
        if resto > 0:
            resto_txt = converte_ate_999(resto)
            sep = " e " if (resto < 100 or resto % 100 == 0) else " "
            texto_int = f"{milhar_txt}{sep}{resto_txt} reais"
        else:
            texto_int = f"{milhar_txt} reais"
    else:
        texto_int = f"{inteiro} reais"

    if centavos > 0:
        cent_txt = "um centavo" if centavos == 1 else f"{converte_ate_999(centavos)} centavos"
        return f"{texto_int} e {cent_txt}"
    return texto_int

def carregar_livro_caixa():
    if not LEDGER_FILE.exists():
        return {"saldo_inicial": 0.0, "lancamentos": []}
    try:
        with open(LEDGER_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"saldo_inicial": 0.0, "lancamentos": []}

def salvar_livro_caixa(dados):
    with open(LEDGER_FILE, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)

def gerar_recibo_pdf(dados_recibo, output_path):
    """Gera um PDF formal do Recibo do Terceiro Setor via ReportLab."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    except ImportError:
        return False, "ReportLab não está instalado."

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#0F172A'),
        alignment=1
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#475569'),
        alignment=1
    )
    
    body_style = ParagraphStyle(
        'BodyTxt',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#1E293B')
    )

    highlight_style = ParagraphStyle(
        'HighTxt',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#0F172A')
    )

    legal_style = ParagraphStyle(
        'LegalTxt',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#64748B'),
        alignment=1
    )

    story = []
    
    # Cabeçalho da Entidade
    story.append(Paragraph(f"<b>{dados_recibo['entidade']['razao_social']}</b>", title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"CNPJ: {dados_recibo['entidade']['cnpj']} | {dados_recibo['entidade']['endereco']}", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#3B82F6"), spaceAfter=15))

    # Título do Recibo
    story.append(Paragraph(f"<b>RECIBO DE CONTRIBUIÇÃO / DOAÇÃO RELIGIOSA</b>", ParagraphStyle('ReciboH', parent=title_style, fontSize=13, textColor=colors.HexColor("#1E3A8A"))))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"Controle Oficial nº: <b>{dados_recibo['numero_recibo']}</b> &nbsp;&nbsp;|&nbsp;&nbsp; Data: <b>{dados_recibo['data_formatada']}</b>", subtitle_style))
    story.append(Spacer(1, 15))

    # Caixa de Valor
    t_valor = Table(
        [[Paragraph(f"VALOR RECEBIDO: <b>R$ {dados_recibo['valor']:,.2f}</b>", highlight_style),
          Paragraph(f"<b>({dados_recibo['valor_extenso'].capitalize()})</b>", body_style)]],
        colWidths=[180, 350]
    )
    t_valor.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F1F5F9')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_valor)
    story.append(Spacer(1, 15))

    # Corpo do Recibo
    texto_declaracao = (
        f"Recebemos do(a) contribuinte <b>{dados_recibo['doador']}</b>, "
        f"inscrito(a) no CPF/MF sob o nº <b>{dados_recibo['cpf']}</b>, "
        f"a quantia líquida de <b>R$ {dados_recibo['valor']:,.2f}</b> ({dados_recibo['valor_extenso']}), "
        f"a título de <b>{dados_recibo['finalidade'].upper()}</b>."
    )
    story.append(Paragraph(texto_declaracao, body_style))
    story.append(Spacer(1, 10))

    texto_destinacao = (
        "Declaramos que os recursos recebidos foram integralmente recolhidos à Tesouraria e são aplicados "
        "exclusivamente na manutenção, desenvolvimento e cumprimento dos objetivos institucionais e religiosos da entidade, "
        "não constituindo qualquer contraprestação de serviços de natureza comercial ou lucrativa."
    )
    story.append(Paragraph(texto_destinacao, body_style))
    story.append(Spacer(1, 15))

    # Tabela de Amparo Legal
    t_legal = Table(
        [[Paragraph(f"<b>AMPARO LEGAL DA IMUNIDADE TRIBUTÁRIA:</b><br/>{dados_recibo['entidade']['fundamentacao_legal']}<br/><i>(Vedada a instituição de impostos sobre templos de qualquer culto)</i>", legal_style)]],
        colWidths=[530]
    )
    t_legal.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#EFF6FF')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#93C5FD')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_legal)
    story.append(Spacer(1, 30))

    # Linha de Assinatura e Carimbo Digital
    t_assinatura = Table([
        [Paragraph(f"_______________________________________________<br/><b>{dados_recibo['entidade']['tesoureiro']}</b><br/>Representante da Entidade", subtitle_style),
         Paragraph(f"_______________________________________________<br/><b>{dados_recibo['doador']}</b><br/>Doador / Contribuinte", subtitle_style)]
    ], colWidths=[265, 265])
    t_assinatura.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_assinatura)
    story.append(Spacer(1, 20))

    # Assinatura Digital Hash SHA-256
    hash_txt = (
        f"<b>Chave de Autenticidade Digital SHA-256:</b><br/>"
        f"<code>{dados_recibo['hash_autenticidade']}</code><br/>"
        f"<i>Emitido pelo Sistema Soberano MCT OS v2.0 Terceiro Setor em {datetime.datetime.now().strftime('%d/%m/%Y às %H:%M:%S')}</i>"
    )
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1"), spaceAfter=8))
    story.append(Paragraph(hash_txt, legal_style))

    doc.build(story)
    return True, str(output_path)

def emitir_recibo(doador, cpf, valor, finalidade="Dízimo", gerar_pdf=True):
    """
    Emite recibo, assina digitalmente, registra no Livro Caixa e gera PDF.
    """
    agora = datetime.datetime.now()
    timestamp_str = agora.strftime("%Y%m%d%H%M%S")
    data_formatada = agora.strftime("%d/%m/%Y")
    
    # Normalização de CPF
    cpf_limpo = "".join([c for c in cpf if c.isdigit()])
    if len(cpf_limpo) == 11:
        cpf_formatado = f"{cpf_limpo[:3]}.{cpf_limpo[3:6]}.{cpf_limpo[6:9]}-{cpf_limpo[9:]}"
    else:
        cpf_formatado = cpf.strip()

    num_recibo = f"REC-{agora.strftime('%Y%m%d')}-{timestamp_str[-4:]}"
    valor_float = float(valor)
    valor_ext = numero_para_extenso(valor_float)

    # Assinatura Digital SHA-256
    raw_hash_data = f"{num_recibo}|{doador}|{cpf_formatado}|{valor_float:.2f}|{finalidade}|{agora.isoformat()}"
    hash_autenticidade = hashlib.sha256(raw_hash_data.encode('utf-8')).hexdigest()

    recibo_data = {
        "numero_recibo": num_recibo,
        "data_formatada": data_formatada,
        "timestamp": agora.isoformat(),
        "doador": doador.strip(),
        "cpf": cpf_formatado,
        "valor": valor_float,
        "valor_extenso": valor_ext,
        "finalidade": finalidade.strip(),
        "hash_autenticidade": hash_autenticidade,
        "entidade": ENTIDADE_PADRAO
    }

    # Registro no Livro Caixa
    livro = carregar_livro_caixa()
    lancamento = {
        "id": num_recibo,
        "data": agora.strftime("%Y-%m-%d"),
        "tipo": "ENTRADA",
        "categoria": finalidade.strip(),
        "descricao": f"Doação/Dízimo recebido de {doador.strip()} (CPF: {cpf_formatado})",
        "doador": doador.strip(),
        "cpf": cpf_formatado,
        "valor": valor_float,
        "hash": hash_autenticidade
    }
    livro["lancamentos"].append(lancamento)
    salvar_livro_caixa(livro)

    # Geração de PDF se solicitado
    pdf_path = None
    if gerar_pdf:
        pdf_file = RECIBOS_DIR / f"{num_recibo}.pdf"
        sucesso, msg_pdf = gerar_recibo_pdf(recibo_data, pdf_file)
        if sucesso:
            pdf_path = str(pdf_file)
        else:
            print(f"⚠️ Aviso ao gerar PDF: {msg_pdf}")

    return {
        "status": "EMITIDO",
        "recibo": recibo_data,
        "pdf_path": pdf_path
    }

def obter_resumo_livro_caixa(mes_referencia=None):
    """
    Retorna o resumo consolidado de entradas, saídas e saldo do Livro Caixa.
    """
    livro = carregar_livro_caixa()
    lancamentos = livro.get("lancamentos", [])
    
    if mes_referencia:
        # Formato YYYY-MM
        lancamentos = [l for l in lancamentos if l.get("data", "").startswith(mes_referencia)]

    total_entradas = sum(l["valor"] for l in lancamentos if l.get("tipo") == "ENTRADA")
    total_saidas = sum(l["valor"] for l in lancamentos if l.get("tipo") == "SAIDA")
    saldo = total_entradas - total_saidas

    por_finalidade = {}
    for l in lancamentos:
        if l.get("tipo") == "ENTRADA":
            cat = l.get("categoria", "Outros")
            por_finalidade[cat] = por_finalidade.get(cat, 0.0) + l["valor"]

    return {
        "mes": mes_referencia or "TOTAL GERAL",
        "total_lancamentos": len(lancamentos),
        "total_entradas": total_entradas,
        "total_saidas": total_saidas,
        "saldo": saldo,
        "por_finalidade": por_finalidade,
        "ultimos_lancamentos": lancamentos[-5:] if lancamentos else []
    }

def formatar_recibo_telegram(res):
    rec = res["recibo"]
    pdf_info = f"\n📄 *PDF Gerado:* `{res['pdf_path']}`" if res.get("pdf_path") else ""
    return (
        "📜 *RECIBO FORMAL DE DOAÇÃO & DÍZIMO (TERCEIRO SETOR)*\n"
        f"🏛️ *Entidade:* {rec['entidade']['razao_social']}\n"
        f"📑 *CNPJ:* `{rec['entidade']['cnpj']}`\n\n"
        f"🔢 *Nº Recibo:* `{rec['numero_recibo']}`\n"
        f"👤 *Doador:* {rec['doador']}\n"
        f"🆔 *CPF:* `{rec['cpf']}`\n"
        f"💰 *Valor:* R$ {rec['valor']:,.2f} ({rec['valor_extenso']})\n"
        f"🎯 *Finalidade:* {rec['finalidade']}\n"
        f"📅 *Data:* {rec['data_formatada']}\n\n"
        f"⚖️ *Amparo Constitucional:*\n_{rec['entidade']['fundamentacao_legal']}_\n\n"
        f"🔐 *Hash Soberano SHA-256:*\n`{rec['hash_autenticidade']}`"
        f"{pdf_info}\n\n"
        "✅ *Registrado automaticamente no Livro Caixa Soberano da Entidade.*"
    )

def formatar_livro_caixa_telegram(resumo):
    msg = (
        f"📖 *LIVRO CAIXA DO TERCEIRO SETOR ({resumo['mes']})*\n\n"
        f"📥 *Total de Entradas:* R$ {resumo['total_entradas']:,.2f}\n"
        f"📤 *Total de Saídas:* R$ {resumo['total_saidas']:,.2f}\n"
        f"💵 *Saldo em Caixa:* R$ {resumo['saldo']:,.2f}\n\n"
        "📊 *Distribuição por Finalidade:*\n"
    )
    for cat, val in resumo["por_finalidade"].items():
        msg += f"  • {cat}: R$ {val:,.2f}\n"
    
    if resumo["ultimos_lancamentos"]:
        msg += "\n🕒 *Últimos Registros:*\n"
        for l in reversed(resumo["ultimos_lancamentos"][-3:]):
            msg += f"  • {l['data']} | {l['categoria']} | R$ {l['valor']:,.2f} ({l.get('doador', 'Anônimo')})\n"
    return msg

def main():
    parser = argparse.ArgumentParser(description="Motor do Terceiro Setor & Imunidade Fiscal MCT")
    subparsers = parser.add_subparsers(dest="subcommand")

    # Subcomando emitir
    p_emitir = subparsers.add_parser("emitir", help="Emite recibo com assinatura digital e registra no Livro Caixa")
    p_emitir.add_argument("--doador", required=True, help="Nome do doador/contribuinte")
    p_emitir.add_argument("--cpf", required=True, help="CPF do doador")
    p_emitir.add_argument("--valor", required=True, type=float, help="Valor em reais")
    p_emitir.add_argument("--finalidade", default="Dízimo", help="Dízimo, Oferta, Missões, Reforma, etc.")
    p_emitir.add_argument("--no-pdf", action="store_true", help="Não gerar PDF")

    # Subcomando livro-caixa
    p_livro = subparsers.add_parser("livro-caixa", help="Exibe extrato e saldo do Livro Caixa")
    p_livro.add_argument("--mes", help="Mês de referência (ex: 2026-10)")

    args = parser.parse_args()

    if args.subcommand == "emitir":
        res = emitir_recibo(
            doador=args.doador,
            cpf=args.cpf,
            valor=args.valor,
            finalidade=args.finalidade,
            gerar_pdf=not args.no_pdf
        )
        print(json.dumps(res, indent=2, ensure_ascii=False))
        if res.get("pdf_path"):
            print(f"\n[OK] Recibo PDF salvo com sucesso em: {res['pdf_path']}")

    elif args.subcommand == "livro-caixa":
        resumo = obter_resumo_livro_caixa(args.mes)
        print(json.dumps(resumo, indent=2, ensure_ascii=False))

    else:
        # Exibe status padrão
        resumo = obter_resumo_livro_caixa()
        print(formatar_livro_caixa_telegram(resumo))

if __name__ == "__main__":
    main()
