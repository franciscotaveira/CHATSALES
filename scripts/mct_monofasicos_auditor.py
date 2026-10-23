#!/usr/bin/env python3
"""
MCT Auditor Soberano de PIS/COFINS Monofásicos & ICMS-ST
Auditoria determinística de XML de NF-e e NFC-e para recuperação de créditos no Simples Nacional
Lei 10.147/2000 | MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import sys
import json
import xml.etree.ElementTree as ET
from pathlib import Path

# Matriz canônica de prefixos NCM sujeitos a PIS/COFINS Monofásico
NCM_MONOFASICOS = {
    # 1. Autopeças & Componentes Automotivos (Lei 10.485/2002)
    "8407": "Motores de pistão e peças",
    "8408": "Motores diesel/semi-diesel",
    "8409": "Partes e peças de motores",
    "8413": "Bombas para combustíveis e lubrificantes",
    "8414": "Compressores e ventiladores automotivos",
    "8421": "Filtros de óleo, ar e combustível",
    "8483": "Árvores de transmissão e engrenagens",
    "8507": "Acumuladores elétricos e baterias",
    "8511": "Velas, distribuidores e bobinas",
    "8512": "Aparelhos de iluminação e sinalização automotiva",
    "8536": "Relés e fusíveis automotivos",
    "8708": "Partes e acessórios de veículos automóveis",
    
    # 2. Pneus e Câmaras de Ar (Lei 10.485/2002)
    "4011": "Pneus novos de borracha",
    "4013": "Câmaras de ar de borracha",

    # 3. Bebidas Frias (Lei 13.097/2015)
    "2201": "Águas minerais e gaseificadas",
    "2202": "Refrigerantes, isotônicos e energéticos",
    "2203": "Cervejas de malte",

    # 4. Medicamentos e Produtos Farmacêuticos (Lei 10.147/2000)
    "3003": "Medicamentos não dosados",
    "3004": "Medicamentos preparados para venda a retalho",
    "3005": "Curativos e gazes medicinais",

    # 5. Cosméticos e Higiene Pessoal (Lei 10.147/2000)
    "3303": "Perfumes e águas de colônia",
    "3304": "Produtos de beleza e maquiagem",
    "3305": "Preparações capilares (xampus e tinturas)",
    "3306": "Preparações para higiene bucal/dentifrícios",
    "3307": "Desodorantes e preparações para barbear"
}

def is_monofasico(ncm_code):
    clean_ncm = "".join(filter(str.isdigit, str(ncm_code)))
    for prefix, desc in NCM_MONOFASICOS.items():
        if clean_ncm.startswith(prefix):
            return True, desc
    return False, None

import re

def parse_tag(xml_snippet, tag_name):
    m = re.search(rf'<{tag_name}[^>]*>(.*?)</{tag_name}>', xml_snippet, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else ""

def audit_nfe_xml(xml_content):
    """
    Analisa a estrutura XML de uma NF-e ou NFC-e usando parser regex puro e soberano:
    Identifica emitente, produtos, NCMs monofásicos e calcula o imposto passível de restituição.
    """
    try:
        if isinstance(xml_content, bytes):
            xml_str = xml_content.decode('utf-8', errors='ignore')
        else:
            xml_str = str(xml_content)
    except Exception as e:
        return {"sucesso": False, "erro": f"Erro de codificação: {e}"}

    if "<infNFe" not in xml_str and "<det" not in xml_str:
        return {"sucesso": False, "erro": "Arquivo não aparenta ser um XML de NF-e/NFC-e válido da SEFAZ"}

    # Identificação da Nota
    emit_block = parse_tag(xml_str, "emit")
    emitente_nome = parse_tag(emit_block, "xNome") or "Emitente Identificado"
    emitente_cnpj = parse_tag(emit_block, "CNPJ") or "00.000.000/0000-00"
    if len(emitente_cnpj) == 14:
        emitente_cnpj = f"{emitente_cnpj[:2]}.{emitente_cnpj[2:5]}.{emitente_cnpj[5:8]}/{emitente_cnpj[8:12]}-{emitente_cnpj[12:]}"

    ide_block = parse_tag(xml_str, "ide")
    num_nota = parse_tag(ide_block, "nNF") or "N/D"
    data_emissao = parse_tag(ide_block, "dhEmi") or parse_tag(ide_block, "dEmi") or ""
    crt = parse_tag(emit_block, "CRT") or "1" # 1 = Simples Nacional

    itens_monofasicos = []
    total_produtos = 0.0
    total_monofasico = 0.0
    total_itens = 0

    # Itera sobre todas as tags <det ...>...</det>
    det_matches = re.finditer(r'<det\b[^>]*>(.*?)</det>', xml_str, re.DOTALL | re.IGNORECASE)
    for m in det_matches:
        det_xml = m.group(1)
        total_itens += 1
        prod_xml = parse_tag(det_xml, "prod")
        
        ncm = parse_tag(prod_xml, "NCM")
        desc = parse_tag(prod_xml, "xProd")
        v_prod_str = parse_tag(prod_xml, "vProd") or "0.0"
        try:
            v_prod = float(v_prod_str)
        except ValueError:
            v_prod = 0.0
            
        cfop = parse_tag(prod_xml, "CFOP")
        total_produtos += v_prod

        monofasico, categoria = is_monofasico(ncm)
        if monofasico:
            total_monofasico += v_prod
            itens_monofasicos.append({
                "item": total_itens,
                "ncm": ncm,
                "categoria": categoria,
                "descricao": desc,
                "cfop": cfop,
                "valor": v_prod
            })

    # Alíquota média de PIS/COFINS embutida no Simples Nacional (~1.98%)
    aliquota_pis_cofins = 0.0198
    imposto_recuperavel = total_monofasico * aliquota_pis_cofins

    pct_monofasico = (total_monofasico / total_produtos * 100) if total_produtos > 0 else 0.0

    return {
        "sucesso": True,
        "emitente": emitente_nome,
        "cnpj": emitente_cnpj,
        "numero_nota": num_nota,
        "data_emissao": data_emissao[:10] if data_emissao else "Recente",
        "regime_tributario": "Simples Nacional" if crt == "1" else "Regime Normal / Presumido",
        "total_produtos": round(total_produtos, 2),
        "total_monofasico": round(total_monofasico, 2),
        "percentual_monofasico": round(pct_monofasico, 1),
        "total_itens_analisados": total_itens,
        "itens_monofasicos_encontrados": len(itens_monofasicos),
        "imposto_recuperavel_estimado": round(imposto_recuperavel, 2),
        "itens": itens_monofasicos[:10]
    }

def generate_sample_xml():
    """Gera um XML sintético de exemplo com autopeças reais para demonstração imediata."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe42261008283744000140550010000045211000452110" versao="4.00">
      <ide>
        <nNF>4521</nNF>
        <dhEmi>2026-10-21T14:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>08283744000140</CNPJ>
        <xNome>AUTO PECAS &amp; MECANICA CHAPECOENSE LTDA</xNome>
        <CRT>1</CRT>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>001</cProd>
          <xProd>PASTILHA DE FREIO DIANTEIRA CERAMICA</xProd>
          <NCM>87083090</NCM>
          <CFOP>5102</CFOP>
          <vProd>480.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>002</cProd>
          <xProd>BATERIA AUTOMOTIVA 60AH 12V</xProd>
          <NCM>85071010</NCM>
          <CFOP>5102</CFOP>
          <vProd>550.00</vProd>
        </prod>
      </det>
      <det nItem="3">
        <prod>
          <cProd>003</cProd>
          <xProd>OLEO MOTOR SINTETICO 5W30</xProd>
          <NCM>27101932</NCM>
          <CFOP>5102</CFOP>
          <vProd>220.00</vProd>
        </prod>
      </det>
      <det nItem="4">
        <prod>
          <cProd>004</cProd>
          <xProd>FILTRO DE OLEO MOTOR BLINDADO</xProd>
          <NCM>84212300</NCM>
          <CFOP>5102</CFOP>
          <vProd>85.00</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>"""

if __name__ == "__main__":
    if len(sys.argv) > 1 and Path(sys.argv[1]).exists():
        content = Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore")
    else:
        content = generate_sample_xml()
        print("📄 Analisando XML de amostra (Autopeças no Simples Nacional)...")
        
    resultado = audit_nfe_xml(content)
    print("\n" + json.dumps(resultado, indent=2, ensure_ascii=False))
