---
name: mct-industrial-compliance
description: "Auditoria de conformidade de obras, SST, ASOs e NRs para liberação de equipes de construtoras na portaria de indústrias (Aurora Coop, BRF, Tirol, JBS)."
version: 1.0.0
author: Francisco Rios / MCT LTDA
license: Proprietary
platforms: [linux]
metadata:
  hermes:
    tags: [compliance, sst, obras, aso, nr35, nr33, aurora, brf, tirol, mct-os]
prerequisites:
  commands: [python3, docker]
---

# MCT Industrial Compliance & Gate Release

Esta skill ensina o Hermes Agent a monitorar, auditar e gerar relatórios de liberação de equipes de construtoras e prestadores de serviços industriais.

## Contexto Crítico de Negócio
Indústrias gigantes como **Aurora Coop, BRF, Tirol e JBS** possuem exigências estritas de Segurança do Trabalho (SESMT/SGI). Se um único colaborador estiver com o ASO vencido ou sem treinamento de NR-35/NR-33, a portaria da fábrica barra a equipe inteira na guarita, gerando prejuízos diários de paralisação.

## Quando Usar

- Quando o usuário disser: "Audite a obra X", "Como está a liberação da Aurora?", "Verifique os ASOs da construtora Y", ou usar `/auditoria`.
- Na rotina matinal das 07:00 AM para emitir o briefing de validades.
- Sempre que um novo lote de documentos de colaboradores for recebido pelo WhatsApp.

## Como Executar

Para rodar a auditoria de liberação de portaria via bash:

```bash
python3 /opt/plx-documentos/app/scripts/mct_industrial_compliance_engine.py audit
```

Ou para semear e demonstrar regras industriais:
```bash
python3 /opt/plx-documentos/app/scripts/mct_industrial_compliance_engine.py demo
```

## Como Analisar o Resultado (Semáforo Soberano):

Ao ler o relatório gerado, o Hermes deve classificar a equipe em 3 estados:
- 🟢 **TOTALMENTE LIBERADO:** Exames e NRs com mais de 15 dias de validade.
- 🟡 **LIBERADO COM RESSALVA:** Exames que vencem nos próximos 15 dias (alerta preventivo de renovação).
- 🔴 **BARRADO NA PORTARIA:** Exame ou treinamento VENCIDO ou ausente (ação imediata: equipe não pode ir ao canteiro).

O Hermes deve sempre entregar o resumo em tabela executiva e indicar qual ação deve ser tomada pelo mestre de obras no WhatsApp.
