#!/usr/bin/env node
// ==============================================================================
// MCT OS v2.0 — Screen-to-Workflow (S2W) Compiler
// Converte arquivos de especificação de rotinas (.spec.md) em workflows n8n JSON
// ==============================================================================

import fs from 'fs';
import path from 'path';

const inputFile = process.argv[2];

if (!inputFile) {
  console.log(`
Uso: node scripts/compile-spec-to-n8n.mjs <caminho-para-o-arquivo.spec.md> [arquivo-saida.n8n.json]

Exemplo:
  node scripts/compile-spec-to-n8n.mjs "04 - Projetos autorais/Operações Conversacionais/TEMPLATE-ROTINA-TELA-PARA-N8N.md"
`);
  process.exit(1);
}

const resolvedInput = path.resolve(process.cwd(), inputFile);
if (!fs.existsSync(resolvedInput)) {
  console.error(`Erro: Arquivo não encontrado: ${resolvedInput}`);
  process.exit(1);
}

const content = fs.readFileSync(resolvedInput, 'utf8');

// 1. Extrair Metadados do Frontmatter YAML
const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
const metadata = {};
if (frontmatterMatch) {
  const lines = frontmatterMatch[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !key.startsWith('#')) {
        metadata[key] = val;
      }
    }
  }
}

const workflowName = metadata.titulo || path.basename(inputFile, path.extname(inputFile));

// 2. Extrair Blocos Anotados <!-- @n8n:node ... --> ou <!-- @n8n:trigger ... -->
const regex = /<!--\s*@n8n:(trigger|node|errorHandler)\s+([^>]*?)\s*-->\s*\n##\s*\[(.*?)\]/g;
let match;
const stages = [];

while ((match = regex.exec(content)) !== null) {
  const role = match[1]; // trigger, node, errorHandler
  const rawAttrs = match[2];
  const stageTitle = match[3];

  const attrs = {};
  const attrRegex = /(\w+)=["']([^"']*)["']/g;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
    attrs[attrMatch[1]] = attrMatch[2];
  }

  stages.push({
    role,
    attrs,
    stageTitle,
  });
}

if (stages.length === 0) {
  console.error('Nenhuma anotação <!-- @n8n:... --> encontrada no arquivo Markdown!');
  process.exit(1);
}

// 3. Montar Nós Canônicos do n8n
const nodes = [];
const connections = {};
let xPos = 250;
const yPos = 300;
let previousNodeName = null;

stages.forEach((stage, idx) => {
  const nodeName = stage.attrs.name || stage.stageTitle.replace(/[^\w\s-]/g, '').trim();
  const nodeType = stage.attrs.type || (stage.role === 'trigger' ? 'n8n-nodes-base.webhook' : 'n8n-nodes-base.code');
  const typeVersion = stage.attrs.typeVersion ? parseFloat(stage.attrs.typeVersion) : 1;

  const nodeObj = {
    parameters: {},
    id: `node-${idx + 1}-${Math.random().toString(36).substring(2, 7)}`,
    name: nodeName,
    type: nodeType,
    typeVersion: typeVersion,
    position: [xPos, stage.role === 'errorHandler' ? yPos + 220 : yPos],
  };

  // Configurações padrão por tipo
  if (nodeType.includes('webhook')) {
    nodeObj.parameters = {
      httpMethod: stage.attrs.httpMethod || 'POST',
      path: stage.attrs.path || 'webhook-endpoint',
      responseMode: 'onReceived',
      responseData: 'allEntries',
    };
    nodeObj.webhookId = `wh-${Math.random().toString(36).substring(2, 9)}`;
  } else if (nodeType.includes('postgres')) {
    nodeObj.parameters = {
      operation: stage.attrs.operation || 'executeQuery',
      query: `-- Execução gerada a partir da etapa: ${stage.stageTitle}\nSELECT 1;`,
    };
  } else if (nodeType.includes('httpRequest')) {
    nodeObj.parameters = {
      method: stage.attrs.method || 'POST',
      url: stage.attrs.url || 'https://chat.automatizaprocessos.tech/api/v1/webhook',
    };
  }

  nodes.push(nodeObj);

  // Conectar linearmente os nós normais
  if (stage.role !== 'errorHandler') {
    if (previousNodeName) {
      if (!connections[previousNodeName]) {
        connections[previousNodeName] = { main: [[]] };
      }
      connections[previousNodeName].main[0].push({
        node: nodeName,
        type: 'main',
        index: 0,
      });
    }
    previousNodeName = nodeName;
    xPos += 260;
  }
});

// 4. Estruturar o JSON final compatível com n8n v1 / v2
const n8nWorkflow = {
  name: workflowName,
  nodes: nodes,
  pinData: {},
  connections: connections,
  active: false,
  settings: {
    executionOrder: 'v1',
    saveExecutionProgress: true,
    saveManualExecutions: true,
  },
  tags: metadata.tags ? metadata.tags.replace(/[\[\]]/g, '').split(',').map(t => ({ name: t.trim() })) : [],
};

// 5. Gravar Arquivo de Saída
const defaultOutput = inputFile.replace(/\.spec\.md$|\.md$/, '.n8n.json');
const outputFile = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : defaultOutput;

fs.writeFileSync(outputFile, JSON.stringify(n8nWorkflow, null, 2), 'utf8');

console.log(`\n🎉 Workflow compilado com sucesso a partir da documentação de tela!`);
console.log(`📄 Origem: ${inputFile}`);
console.log(`⚙️  Nome:   ${workflowName}`);
console.log(`🧩 Nós:    ${nodes.length} nós gerados`);
console.log(`💾 Salvo:  ${outputFile}\n`);
console.log(`Pronto para importar diretamente no seu painel: https://automacao.automatizaprocessos.tech`);
