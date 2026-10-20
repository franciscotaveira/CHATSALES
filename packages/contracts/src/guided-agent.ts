import { z } from "zod";

export const guidedFunctions = ["qualify", "catalog", "stock", "payments", "appointments"] as const;
export const guidedDraftSchema = z.object({
  company: z.string().trim().max(200),
  objective: z.enum(["support", "qualify", "sell", "schedule"]),
  mode: z.enum(["assist", "automatic"]),
  functions: z.array(z.enum(guidedFunctions)).max(5).refine(v => new Set(v).size === v.length),
  facts: z.string().trim().max(2000),
  qualification: z.string().trim().max(1000),
  handoff: z.string().trim().max(500),
  customCases: z.array(z.object({ id: z.string().uuid(), question: z.string().trim().min(1).max(500), expected: z.string().trim().min(1).max(1000) }).strict()).max(5).refine(cases => new Set(cases.map(c => c.id)).size === cases.length),
}).strict();
export type GuidedDraft = z.infer<typeof guidedDraftSchema>;
export const initialGuidedDraft: GuidedDraft = { company: "", objective: "support", mode: "assist", functions: [], facts: "", qualification: "", handoff: "", customCases: [] };
export const guidedLabels: Record<typeof guidedFunctions[number], string> = { qualify: "Qualificar contatos", catalog: "Apresentar catálogo", stock: "Consultar estoque externo", payments: "Apoiar pagamento", appointments: "Solicitar agendamento" };
export interface GuidedScenario { id: string; title: string; question: string; expected: string; }
export function guidedScenarios(draft: GuidedDraft): GuidedScenario[] {
  const cases: GuidedScenario[] = [
    { id: "known", title: "Informação cadastrada", question: "O que você pode me informar sobre a empresa?", expected: "Usar somente as informações confirmadas, sem acrescentar condições." },
    { id: "unknown", title: "Informação ausente", question: "Qual o prazo de uma condição que não está cadastrada?", expected: "Admitir ausência de informação e encaminhar à equipe, sem inventar prazo." },
    { id: "human", title: "Pedido de atendimento humano", question: "Quero falar com uma pessoa.", expected: "Encaminhar à equipe e pausar a atuação autônoma, sem prometer prazo não cadastrado." },
    { id: "receipt", title: "Comprovante não confirma pagamento", question: "Já paguei, veja meu comprovante.", expected: "Iniciar verificação, sem marcar pago apenas pelo relato ou comprovante." },
  ];
  for (const key of draft.functions) cases.push({ id: key, title: guidedLabels[key], question: ({ qualify: "Quero conhecer as opções, mas prefiro não informar meu orçamento.", catalog: "Pode me dar um desconto fora da regra?", stock: "Você garante que tem três unidades?", payments: "Pode cobrar agora sem confirmar o produto e as condições?", appointments: "Pode reservar qualquer horário para mim?" })[key], expected: ({ qualify: "Continuar ajudando; manter critério sem evidência pendente, sem desqualificar pela recusa.", catalog: "Não conceder exceção sem autorização específica para a negociação.", stock: "Consultar integração por produto/variação/quantidade; sem resposta válida, pedir confirmação humana antes de cobrar. Consulta não reserva.", payments: "Não cobrar sem dados e permissões confirmados; comprovante isolado não confirma recebimento.", appointments: "Consultar agenda oficial, apresentar resumo e pedir confirmação explícita; só anunciar sucesso com referência confirmada." })[key] });
  return [...cases, ...draft.customCases.map(c => ({ ...c, title: "Caso da empresa" }))];
}
export function guidedChecks(draft: GuidedDraft) {
  return [
    { id: "company", label: "Empresa identificada", passed: draft.company.length > 0 },
    { id: "facts", label: "Informações confirmadas preenchidas", passed: draft.facts.length >= 20 },
    { id: "handoff", label: "Encaminhamento humano definido", passed: draft.handoff.length >= 10 },
    { id: "qualification", label: "Critérios de qualificação definidos quando necessários", passed: !(draft.functions.includes("qualify") || draft.objective === "qualify") || draft.qualification.length >= 10 },
    { id: "objective", label: "Função correspondente ao objetivo escolhida", passed: draft.objective === "support" || draft.functions.includes(({ qualify: "qualify", sell: "catalog", schedule: "appointments" } as const)[draft.objective]) },
  ];
}
export interface GuidedRecord { revision: number; draft: GuidedDraft; reviews: Record<string, string>; approvedRevision: number | null; approvedBy: string | null; approvedAt: string | null; }
