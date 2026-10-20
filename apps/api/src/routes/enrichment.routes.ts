import type { FastifyPluginAsync } from "fastify";

interface CnpjCacheEntry {
  expiresAt: number;
  data: CnpjEnrichedData;
}

interface CepCacheEntry {
  expiresAt: number;
  data: CepEnrichedData;
}

export interface CnpjEnrichedData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  telefone: string;
  email: string;
}

export interface CepEnrichedData {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

const cnpjCache = new Map<string, CnpjCacheEntry>();
const cepCache = new Map<string, CepCacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export function validateCnpjDigits(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const weightsFirst = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weightsSecond = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * weightsFirst[i]!;
  }
  let rem = sum % 11;
  const firstDigit = rem < 2 ? 0 : 11 - rem;
  if (Number(digits[12]) !== firstDigit) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(digits[i]) * weightsSecond[i]!;
  }
  rem = sum % 11;
  const secondDigit = rem < 2 ? 0 : 11 - rem;
  return Number(digits[13]) === secondDigit;
}

export function formatCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").padStart(14, "0").slice(0, 14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export const enrichmentRoutes: FastifyPluginAsync = async (app) => {
  // 1. CNPJ Enrichment
  app.get(
    "/v1/enrichment/cnpj/:cnpj",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      const params = request.params as { cnpj?: string };
      const rawCnpj = (params.cnpj || "").replace(/\D/g, "");

      if (!validateCnpjDigits(rawCnpj)) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "CNPJ Inválido",
          status: 400,
          detail: "O CNPJ informado possui dígitos verificadores inválidos.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      // Check cache
      const cached = cnpjCache.get(rawCnpj);
      if (cached && cached.expiresAt > Date.now()) {
        return reply.status(200).send(cached.data);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`, {
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            "User-Agent": "MCT-SOSVendas-FiscalEnricher/3.0",
          },
        });
        clearTimeout(timeout);

        if (response.status === 404) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "CNPJ Não Encontrado",
            status: 404,
            detail: "CNPJ não encontrado na base da Receita Federal via BrasilAPI.",
            instance: request.url,
            correlationId: request.id,
          });
        }

        if (!response.ok) {
          throw new Error(`BrasilAPI retornou status HTTP ${response.status}`);
        }

        const data = (await response.json()) as any;
        const enriched: CnpjEnrichedData = {
          cnpj: formatCnpj(rawCnpj),
          razaoSocial: (data.razao_social || "").trim(),
          nomeFantasia: (data.nome_fantasia || data.razao_social || "").trim(),
          situacaoCadastral: (data.descricao_situacao_cadastral || "ATIVA").trim(),
          logradouro: (data.logradouro || "").trim(),
          numero: (data.numero || "S/N").trim(),
          complemento: (data.complemento || "").trim(),
          bairro: (data.bairro || "").trim(),
          cep: (data.cep || "").replace(/\D/g, ""),
          municipio: (data.municipio || "").trim(),
          uf: (data.uf || "").trim(),
          telefone: (data.ddd_telefone_1 || "").replace(/\D/g, ""),
          email: (data.email || "").trim().toLowerCase(),
        };

        cnpjCache.set(rawCnpj, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          data: enriched,
        });

        return reply.status(200).send(enriched);
      } catch (err: unknown) {
        const error = err as Error;
        request.log.error({ err: error, cnpj: rawCnpj }, "Falha ao consultar CNPJ na BrasilAPI");
        return reply.status(502).send({
          type: "https://sos-sales.mct.br/errors/bad-gateway",
          title: "Serviço de Consulta Indisponível",
          status: 502,
          detail: "Não foi possível consultar os dados do CNPJ na Receita Federal no momento. Preencha manualmente.",
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 2. CEP Enrichment
  app.get(
    "/v1/enrichment/cep/:cep",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      const params = request.params as { cep?: string };
      const rawCep = (params.cep || "").replace(/\D/g, "");

      if (rawCep.length !== 8) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "CEP Inválido",
          status: 400,
          detail: "O CEP informado deve conter exatamente 8 dígitos numéricos.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      // Check cache
      const cached = cepCache.get(rawCep);
      if (cached && cached.expiresAt > Date.now()) {
        return reply.status(200).send(cached.data);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${rawCep}`, {
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            "User-Agent": "MCT-SOSVendas-FiscalEnricher/3.0",
          },
        });
        clearTimeout(timeout);

        if (response.status === 404) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "CEP Não Encontrado",
            status: 404,
            detail: "O CEP informado não foi localizado na base dos Correios.",
            instance: request.url,
            correlationId: request.id,
          });
        }

        if (!response.ok) {
          throw new Error(`BrasilAPI retornou status HTTP ${response.status}`);
        }

        const data = (await response.json()) as any;
        const enriched: CepEnrichedData = {
          cep: rawCep,
          street: (data.street || "").trim(),
          neighborhood: (data.neighborhood || "").trim(),
          city: (data.city || "").trim(),
          state: (data.state || "").trim(),
        };

        cepCache.set(rawCep, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          data: enriched,
        });

        return reply.status(200).send(enriched);
      } catch (err: unknown) {
        const error = err as Error;
        request.log.error({ err: error, cep: rawCep }, "Falha ao consultar CEP na BrasilAPI");
        return reply.status(502).send({
          type: "https://sos-sales.mct.br/errors/bad-gateway",
          title: "Serviço de Consulta Indisponível",
          status: 502,
          detail: "Não foi possível consultar os dados do CEP no momento. Preencha manualmente.",
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );
};
