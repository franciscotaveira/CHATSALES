#!/usr/bin/env python3
"""
MCT Sovereign MCP Server (Model Context Protocol)
Expõe o ecossistema de ferramentas soberanas MCT OS v2.0 via protocolo MCP stdio JSON-RPC:
B2G PNCP, Leilões & Arbitragem, CND Sentinel, Fiscal Monofásico, Frotas NIC e Meta-REA
MCT OS v2.0 | Francisco Rios | Chapecó, SC
"""

import sys
import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Importar motores soberanos
try:
    from mct_cross_data_engine import (
        rea_analisar_leilao_completo,
        rea_analisar_empresa_360,
        get_brasilapi_taxas,
        get_brasilapi_cnpj,
        fetch_pncp_itens,
        fetch_pncp_arquivos
    )
    from mct_pncp_radar import fetch_pncp_opportunities, fetch_pncp_leiloes
    from mct_monofasicos_auditor import analisar_xml_nfe
except ImportError as e:
    sys.stderr.write(f"⚠️ Erro ao importar motores MCT: {e}\n")

TOOLS_REGISTRY = [
    {
        "name": "mct_rea_leilao_arbitragem",
        "description": "Motor Meta-REA para Leilões Públicos Governamentais (Lei 14.133). Cruza PNCP + Itens do Lote + PDF do Edital + CNPJ do Órgão + Selic para calcular deságio e spread de arbitragem líquida.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "cnpj_orgao": {"type": "string", "description": "CNPJ do órgão público realizador do leilão."},
                "ano": {"type": "integer", "description": "Ano da compra/edital no PNCP (ex: 2026)."},
                "seq": {"type": "integer", "description": "Sequencial da compra no PNCP."},
                "uf": {"type": "string", "description": "UF do estado (ex: SC, PR, RS). Padrão 'SC'."}
            },
            "required": ["cnpj_orgao", "ano", "seq"]
        }
    },
    {
        "name": "mct_rea_empresa_360",
        "description": "Cruza dados cadastrais oficiais da BrasilAPI (Receita Federal), auditoria preventiva de CNDs (FGTS, CNDT e RFB) e análise de CNAEs para potencial de recuperação de PIS/COFINS monofásicos.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "cnpj": {"type": "string", "description": "CNPJ da empresa com ou sem pontuação."}
            },
            "required": ["cnpj"]
        }
    },
    {
        "name": "mct_consultar_taxas_macro",
        "description": "Retorna taxas macroeconômicas oficiais em tempo real (Taxa Selic, CDI e IPCA) para cálculos financeiros e custo de oportunidade.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "mct_consultar_licitacoes_pncp",
        "description": "Varre pregões eletrônicos e dispensas de licitação ativas na Região Sul (SC, PR, RS) via API aberta do PNCP cruzando com catálogo de fornecimento.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "uf": {"type": "string", "description": "UF da busca: SUL, SC, PR ou RS. Padrão: SUL."},
                "dias_atras": {"type": "integer", "description": "Janela de dias retroativos de publicação (1 a 10). Padrão: 3."}
            }
        }
    },
    {
        "name": "mct_auditar_monofasicos",
        "description": "Executa auditoria determinística de XML de NF-e/NFC-e para identificar produtos monofásicos (autopeças, baterias, bebidas, medicamentos) e quantificar crédito tributário no Simples Nacional.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "caminho_xml": {"type": "string", "description": "Caminho opcional do arquivo XML. Se vazio, audita lote de demonstração de autopeças."}
            }
        }
    }
]


def handle_tool_call(name: str, arguments: dict):
    if name == "mct_rea_leilao_arbitragem":
        cnpj = arguments.get("cnpj_orgao", "")
        ano = int(arguments.get("ano", 2026))
        seq = int(arguments.get("seq", 1))
        uf = arguments.get("uf", "SC")
        res = rea_analisar_leilao_completo(cnpj, ano, seq, uf=uf)
        return json.dumps(res, indent=2, ensure_ascii=False)

    elif name == "mct_rea_empresa_360":
        cnpj = arguments.get("cnpj", "")
        res = rea_analisar_empresa_360(cnpj)
        return res

    elif name == "mct_consultar_taxas_macro":
        taxas = get_brasilapi_taxas()
        return json.dumps(taxas, indent=2, ensure_ascii=False)

    elif name == "mct_consultar_licitacoes_pncp":
        uf = arguments.get("uf", "SUL")
        dias = int(arguments.get("dias_atras", 3))
        opps = fetch_pncp_opportunities(days_back=dias, uf_filter=uf)
        return json.dumps(opps[:10], indent=2, ensure_ascii=False)

    elif name == "mct_auditar_monofasicos":
        caminho = arguments.get("caminho_xml")
        xml_path = Path(caminho) if caminho else (BASE_DIR / "sample_nfe_autopecas.xml")
        if xml_path.exists():
            with open(xml_path, "r", encoding="utf-8") as f:
                res = analisar_xml_nfe(f.read())
            return json.dumps(res, indent=2, ensure_ascii=False)
        else:
            return json.dumps({"erro": "Arquivo XML não encontrado."}, ensure_ascii=False)

    raise ValueError(f"Ferramenta desconhecida: {name}")


def main():
    """Loop principal JSON-RPC 2.0 sobre stdin/stdout compatível com MCP spec."""
    sys.stderr.write("🚀 [MCT MCP Server] Inicializando servidor soberano stdio...\n")
    sys.stderr.flush()

    while True:
        line = sys.stdin.readline()
        if not line:
            break
        
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except Exception:
            continue

        msg_id = req.get("id")
        method = req.get("method")

        # 1. Handshake de Inicialização
        if method == "initialize":
            resp = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "mct-soberano-mcp",
                        "version": "2.0.0"
                    }
                }
            }
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        elif method == "notifications/initialized":
            # Notificação unilateral, não exige resposta
            pass

        # 2. Listagem de Ferramentas
        elif method == "tools/list":
            resp = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "tools": TOOLS_REGISTRY
                }
            }
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        # 3. Execução de Ferramentas
        elif method == "tools/call":
            params = req.get("params", {})
            t_name = params.get("name")
            t_args = params.get("arguments", {})

            try:
                output_str = handle_tool_call(t_name, t_args)
                resp = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": [
                            {"type": "text", "text": output_str}
                        ]
                    }
                }
            except Exception as e:
                resp = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "isError": True,
                    "result": {
                        "content": [
                            {"type": "text", "text": f"Erro na execução da ferramenta: {str(e)}"}
                        ]
                    }
                }
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        elif method == "ping":
            resp = {"jsonrpc": "2.0", "id": msg_id, "result": {}}
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        else:
            # Método não implementado
            if msg_id is not None:
                resp = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32601,
                        "message": f"Method '{method}' not found"
                    }
                }
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()


if __name__ == "__main__":
    main()
