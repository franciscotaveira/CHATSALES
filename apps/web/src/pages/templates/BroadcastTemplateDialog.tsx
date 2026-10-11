import { useState, useEffect, useMemo, useRef, type FC, type FormEvent } from "react";
import {
  Dialog,
  Button,
  Input,
  Badge,
  Alert,
  SegmentedControl,
  LoadingState,
  useBreakpoint,
} from "@sos-sales/ui";
import {
  Send,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  FileSpreadsheet,
  UploadCloud,
  Trash2,
  Filter,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  apiClient,
  type MessageTemplateSummary,
  type ChannelSummary,
} from "../../services/api-client";
import { renderWhatsappMarkdown } from "../cockpit/utils/whatsappMarkdown";
import { CreateTemplateDialog } from "./CreateTemplateDialog";

// Brazilian Phone Sanitizer & E.164 Validator
export function sanitizeBrazilianPhoneE164(raw: string): { phoneE164: string } | { error: string } {
  if (!raw) return { error: "Vazio" };
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { error: "Sem dígitos" };

  let clean = digits.startsWith("0") ? digits.slice(1) : digits;

  if (clean.startsWith("55")) {
    clean = clean.slice(2);
  }

  if (clean.length < 10) {
    return { error: "Menos de 10 dígitos (DDD ausente)" };
  }

  const ddd = clean.slice(0, 2);
  const rest = clean.slice(2);

  // Landlines discard (starting with 2, 3, 4, 5 and 8 digits)
  if (rest.length === 8 && /^[2-5]/.test(rest)) {
    return { error: "Telefone fixo descartado" };
  }

  let finalNumber = rest;
  if (rest.length === 8 && /^[6-9]/.test(rest)) {
    finalNumber = `9${rest}`;
  } else if (rest.length === 9 && rest.startsWith("9")) {
    finalNumber = rest;
  } else if (rest.length !== 9) {
    return { error: "Formato de telefone móvel inválido" };
  }

  const e164 = `+55${ddd}${finalNumber}`;
  if (!/^\+55[1-9]{2}9[0-9]{8}$/.test(e164)) {
    return { error: "Dígitos inválidos" };
  }

  return { phoneE164: e164 };
}

function parseCsvText(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0]!;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  let delimiter = ",";
  if (semiCount > commaCount && semiCount >= tabCount) delimiter = ";";
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = "\t";

  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitLine(firstLine).map((h) => h.toLowerCase().replace(/["']/g, ""));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

function extractContactFromRow(row: Record<string, any>): { name?: string; phoneRaw: string } | null {
  const keys = Object.keys(row);
  const phoneKey = keys.find((k) =>
    /telefone|celular|phone|whatsapp|fone|numero|número|mobile|tel|contato/i.test(k)
  );
  const nameKey = keys.find((k) => /nome|name|cliente|lead/i.test(k));

  let phoneRaw = phoneKey ? String(row[phoneKey] || "") : "";
  let name = nameKey ? String(row[nameKey] || "") : "";

  if (!phoneRaw) {
    const candidate = keys.find((k) => String(row[k] || "").replace(/\D/g, "").length >= 8);
    if (candidate) {
      phoneRaw = String(row[candidate] || "");
    }
  }
  if (!nameKey) {
    const candidateName = keys.find((k) => k !== phoneKey && typeof row[k] === "string" && !/^\d+$/.test(row[k]));
    if (candidateName) {
      name = String(row[candidateName] || "");
    }
  }

  if (!phoneRaw) return null;
  return { name: name.trim() || undefined, phoneRaw };
}

// Recipient Name Variable Detector
export function isRecipientNameVariable(key: string): boolean {
  const clean = key.trim().toLowerCase();
  return (
    clean === "1" ||
    /^(nome|name|cliente|lead|primeiro_nome|cliente_nome|nome_do_cliente|primeiro_nome_cliente)$/i.test(clean)
  );
}

// Format template name for commercial/human readability and cost awareness
export function formatTemplateDisplayTitle(
  tpl: MessageTemplateSummary | { name: string; category?: string; metaTemplateId?: string | null }
): string {
  let clean = tpl.name
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\bv(\d+)\b/gi, "(v$1)")
    .trim();

  clean = clean
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (["de", "do", "da", "dos", "das", "e", "para", "em", "com"].includes(lower)) return lower;
      if (lower === "nps") return "NPS";
      if (lower === "pix") return "Pix";
      if (lower === "ctwa") return "CTWA";
      if (lower === "vip") return "VIP";
      if (lower === "ia") return "IA";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");

  const isUtility = tpl.category === "UTILITY";
  const costBadge = isUtility ? "⚡ Utilidade (~R$ 0,04 • -85%)" : "⭐ Marketing (~R$ 0,40)";
  const approvalBadge = tpl.metaTemplateId ? "Meta Aprovado" : "Local";
  return `${clean} [${costBadge} • ${approvalBadge}]`;
}

// Variable metadata with human labels, placeholders, and quick suggestions
export function getVariableMetadata(key: string): {
  label: string;
  placeholder: string;
  isName: boolean;
  suggestions: string[];
} {
  const isName = isRecipientNameVariable(key);
  if (isName) {
    return {
      label: "Nome do Contato",
      placeholder: "[👤 Nome do Contato (Automático)]",
      isName: true,
      suggestions: [],
    };
  }

  const clean = key.trim().toLowerCase();
  if (
    clean === "2" ||
    clean.includes("procedimento") ||
    clean.includes("servico") ||
    clean.includes("produto") ||
    clean.includes("tratamento")
  ) {
    return {
      label: clean === "2" ? "Procedimento ou Oferta ({{2}})" : `Procedimento / Serviço ({{${key}}})`,
      placeholder: "ex: Limpeza Facial, Consulta Avaliativa, Botox",
      isName: false,
      suggestions: ["Limpeza de Pele", "Consulta Avaliativa", "Avaliação Gratuita", "Sessão Especial"],
    };
  }
  if (
    clean === "3" ||
    clean.includes("desconto") ||
    clean.includes("cupom") ||
    clean.includes("oferta") ||
    clean.includes("promocao") ||
    clean.includes("bonus")
  ) {
    return {
      label: clean === "3" ? "Oferta / Desconto ({{3}})" : `Desconto / Cupom ({{${key}}})`,
      placeholder: "ex: 15% OFF, FRETEGRATIS, Bônus R$ 50",
      isName: false,
      suggestions: ["15% OFF", "20% OFF", "Cupom VIP", "Bônus Especial"],
    };
  }
  if (clean.includes("data") || clean.includes("horario") || clean.includes("dia")) {
    return {
      label: `Data ou Horário ({{${key}}})`,
      placeholder: "ex: amanhã às 14h / nesta sexta-feira",
      isName: false,
      suggestions: ["hoje às 15h", "amanhã", "nesta sexta-feira"],
    };
  }
  if (clean.includes("link") || clean.includes("url") || clean.includes("site")) {
    return {
      label: `Link de Ação ({{${key}}})`,
      placeholder: "ex: https://...",
      isName: false,
      suggestions: [],
    };
  }

  return {
    label: `Variável {{${key}}}`,
    placeholder: `Conteúdo para {{${key}}}`,
    isName: false,
    suggestions: [],
  };
}

interface BroadcastTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  initialTemplate?: MessageTemplateSummary | null;
  onBroadcastSuccess?: () => void;
}

export const BroadcastTemplateDialog: FC<BroadcastTemplateDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  initialTemplate,
  onBroadcastSuccess,
}) => {
  const { isMobile } = useBreakpoint();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isLoadingPreflight, setIsLoadingPreflight] = useState(true);
  const [channels, setChannels] = useState<Array<ChannelSummary & { isBlockedForBroadcast: boolean }>>([]);
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [totalActiveContacts, setTotalActiveContacts] = useState(0);

  // Campaign Configuration
  const [campaignName, setCampaignName] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [isAbTest, setIsAbTest] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedTemplateBId, setSelectedTemplateBId] = useState("");
  const [audienceType, setAudienceType] = useState<"ALL_CONTACTS" | "SMART_FILTER" | "IMPORT_LIST" | "BY_STAGE" | "MANUAL">("ALL_CONTACTS");
  const [stage, setStage] = useState("LEAD");
  const [smartFilter, setSmartFilter] = useState<"NON_BUYERS" | "PIX_ABANDONED" | "INACTIVE_30_DAYS" | "CTWA_RESCUE">("NON_BUYERS");
  const [smartCount, setSmartCount] = useState<number | null>(null);
  const [isLoadingSmartCount, setIsLoadingSmartCount] = useState(false);

  // Planilha Import State
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [importedContacts, setImportedContacts] = useState<Array<{ phoneE164: string; name?: string }>>([]);
  const [importStats, setImportStats] = useState<{
    totalRows: number;
    validCount: number;
    duplicateCount: number;
    invalidCount: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [manualPhones, setManualPhones] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [variablesB, setVariablesB] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    batchId: string;
    enqueuedCount: number;
    totalTargeted: number;
    templateName: string;
    isAbTest: boolean;
  } | null>(null);
  const [isCreateAiModalOpen, setIsCreateAiModalOpen] = useState(false);

  const handleTemplateCreated = async () => {
    setIsCreateAiModalOpen(false);
    try {
      const res = await apiClient.getBroadcastPreflight(workspaceId, { token });
      setTemplates(res.templates || []);
      if (res.templates && res.templates.length > 0) {
        setSelectedTemplateId(res.templates[0]!.id);
      }
    } catch (e) {
      console.error("Falha ao recarregar modelos após criação com IA", e);
    }
  };

  // Load preflight data on open
  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;

    let isMounted = true;
    setIsLoadingPreflight(true);
    setErrorMessage(null);
    setSuccessInfo(null);

    apiClient
      .getBroadcastPreflight(workspaceId, { token })
      .then((res) => {
        if (!isMounted) return;
        setChannels(res.channels || []);
        setTemplates(res.templates || []);
        setTotalActiveContacts(res.totalActiveContacts || 0);

        // Pre-select channel: prioritize ready meta_waba or connected channel
        const readyChannel =
          res.channels.find((ch) => ch.provider === "meta_waba" && ch.metaBillingConfigured && ch.status === "connected") ||
          res.channels.find((ch) => ch.status === "connected") ||
          res.channels[0];

        if (readyChannel) {
          setSelectedChannelId(readyChannel.id);
        }

        // Pre-select template A
        if (initialTemplate) {
          setSelectedTemplateId(initialTemplate.id);
        } else if (res.templates && res.templates.length > 0 && res.templates[0]) {
          setSelectedTemplateId(res.templates[0].id);
        }

        // Pre-select template B (prioritize a second template if available)
        if (res.templates && res.templates.length > 1 && res.templates[1]) {
          setSelectedTemplateBId(res.templates[1].id);
        } else if (res.templates && res.templates.length > 0 && res.templates[0]) {
          setSelectedTemplateBId(res.templates[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Falha ao carregar canais e modelos para disparo."
        );
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreflight(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, workspaceId, token, initialTemplate]);

  // Selected Channel Object
  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId),
    [channels, selectedChannelId]
  );

  // Selected Template A Object
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || initialTemplate,
    [templates, selectedTemplateId, initialTemplate]
  );

  // Selected Template B Object
  const selectedTemplateB = useMemo(
    () => templates.find((t) => t.id === selectedTemplateBId),
    [templates, selectedTemplateBId]
  );

  // Extract variables for Template A (Supports both {{1}} and {{nome_cliente}})
  const templateVarKeys = useMemo<string[]>(() => {
    if (!selectedTemplate) return [];
    if (selectedTemplate.variables && selectedTemplate.variables.length > 0) {
      return selectedTemplate.variables;
    }
    const rawBody = selectedTemplate.bodyText || (selectedTemplate as any)?.body_text || "";
    if (!rawBody) return [];
    const matches = rawBody.match(/\{\{([a-zA-Z0-9_]+)\}\}/g);
    if (!matches) return [];
    const keys = Array.from<string>(new Set(matches.map((m: string) => m.replace(/[{}]/g, ""))));
    return keys.sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [selectedTemplate]);

  // Extract variables for Template B (Supports both {{1}} and {{nome_cliente}})
  const templateVarKeysB = useMemo<string[]>(() => {
    if (!selectedTemplateB) return [];
    if (selectedTemplateB.variables && selectedTemplateB.variables.length > 0) {
      return selectedTemplateB.variables;
    }
    const rawBody = selectedTemplateB.bodyText || (selectedTemplateB as any)?.body_text || "";
    if (!rawBody) return [];
    const matches = rawBody.match(/\{\{([a-zA-Z0-9_]+)\}\}/g);
    if (!matches) return [];
    const keys = Array.from<string>(new Set(matches.map((m: string) => m.replace(/[{}]/g, ""))));
    return keys.sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [selectedTemplateB]);

  // Preview body A with Realistic WYSIWYG
  const previewBody = useMemo(() => {
    if (!selectedTemplate) return "";
    let body = selectedTemplate.bodyText || (selectedTemplate as any)?.body_text || "";
    if (!body) return "";
    for (const key of templateVarKeys) {
      const isName = isRecipientNameVariable(key);
      const userVal = variables[key];
      let val = userVal;
      if (!val || val === "[Nome do Contato]" || (isName && (!val.trim() || val.includes("[Nome")))) {
        val = isName ? "Francisco" : `[${getVariableMetadata(key).label.split(" (")[0]}]`;
      }
      body = body.split(`{{${key}}}`).join(val);
    }
    return body;
  }, [selectedTemplate, templateVarKeys, variables]);

  // Preview body B with Realistic WYSIWYG
  const previewBodyB = useMemo(() => {
    if (!selectedTemplateB) return "";
    let body = selectedTemplateB.bodyText || (selectedTemplateB as any)?.body_text || "";
    if (!body) return "";
    for (const key of templateVarKeysB) {
      const isName = isRecipientNameVariable(key);
      const userVal = variablesB[key];
      let val = userVal;
      if (!val || val === "[Nome do Contato]" || (isName && (!val.trim() || val.includes("[Nome")))) {
        val = isName ? "Francisco" : `[${getVariableMetadata(key).label.split(" (")[0]}]`;
      }
      body = body.split(`{{${key}}}`).join(val);
    }
    return body;
  }, [selectedTemplateB, templateVarKeysB, variablesB]);

  // Fetch live count for Smart Filters or Stages
  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;

    if (audienceType === "SMART_FILTER") {
      setIsLoadingSmartCount(true);
      apiClient
        .getAudienceCount(workspaceId, { type: "SMART_FILTER", smartFilter }, { token })
        .then((res) => setSmartCount(res.count))
        .catch(() => setSmartCount(null))
        .finally(() => setIsLoadingSmartCount(false));
    } else if (audienceType === "BY_STAGE") {
      setIsLoadingSmartCount(true);
      apiClient
        .getAudienceCount(workspaceId, { type: "BY_STAGE", stage }, { token })
        .then((res) => setSmartCount(res.count))
        .catch(() => setSmartCount(null))
        .finally(() => setIsLoadingSmartCount(false));
    }
  }, [isOpen, workspaceId, token, audienceType, smartFilter, stage]);

  const processFile = async (file: File) => {
    setIsParsingFile(true);
    setImportError(null);
    setImportedFile(file);

    try {
      let rows: Array<Record<string, any>> = [];
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const isExcel =
        file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");

      if (isCsv) {
        const text = await file.text();
        rows = parseCsvText(text);
      } else if (isExcel) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
          throw new Error("A planilha não possui abas visíveis.");
        }
        const ws = wb.Sheets[firstSheetName];
        if (!ws) {
          throw new Error("Aba da planilha vazia.");
        }
        rows = XLSX.utils.sheet_to_json(ws);
      } else {
        throw new Error("Formato não suportado. Por favor, envie um arquivo .csv ou .xlsx.");
      }

      if (rows.length === 0) {
        throw new Error("Nenhum dado encontrado no arquivo.");
      }

      const phoneMap = new Map<string, { phoneE164: string; name?: string }>();
      let duplicateCount = 0;
      let invalidCount = 0;

      for (const row of rows) {
        const extracted = extractContactFromRow(row);
        if (!extracted) {
          invalidCount++;
          continue;
        }

        const sanit = sanitizeBrazilianPhoneE164(extracted.phoneRaw);
        if ("error" in sanit) {
          invalidCount++;
          continue;
        }

        if (phoneMap.has(sanit.phoneE164)) {
          duplicateCount++;
        } else {
          phoneMap.set(sanit.phoneE164, {
            phoneE164: sanit.phoneE164,
            name: extracted.name,
          });
        }
      }

      const validList = Array.from(phoneMap.values());
      if (validList.length === 0) {
        throw new Error("Nenhum número de WhatsApp válido encontrado na planilha.");
      }

      setImportedContacts(validList);
      setImportStats({
        totalRows: rows.length,
        validCount: validList.length,
        duplicateCount,
        invalidCount,
      });
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Erro ao processar planilha.");
      setImportedContacts([]);
      setImportStats(null);
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const removeImportedFile = () => {
    setImportedFile(null);
    setImportedContacts([]);
    setImportStats(null);
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Mandatory Billing Gate Check
  const isMetaWaba = selectedChannel?.provider === "meta_waba";
  const isMetaBillingConfigured = Boolean(selectedChannel?.metaBillingConfigured);
  const isBillingBlocked = isMetaWaba && !isMetaBillingConfigured;
  const isChannelConnected = selectedChannel?.status === "connected";

  const canSubmit =
    !isLoadingPreflight &&
    !isSubmitting &&
    Boolean(selectedChannelId) &&
    isChannelConnected &&
    !isBillingBlocked &&
    Boolean(selectedTemplateId) &&
    (!isAbTest || Boolean(selectedTemplateBId)) &&
    (audienceType !== "IMPORT_LIST" || importedContacts.length > 0) &&
    (audienceType !== "MANUAL" || manualPhones.trim().length > 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedChannel || !selectedTemplate) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let customPhoneNumbers: string[] | undefined;
      if (audienceType === "MANUAL") {
        const cleaned = manualPhones
          .split(/[\n,;]+/)
          .map((p) => p.trim())
          .filter(Boolean);

        if (cleaned.length === 0) {
          throw new Error("Informe pelo menos um número de telefone com DDI (ex: +554999999999).");
        }

        const validE164 = /^\+[1-9][0-9]{8,14}$/;
        for (const phone of cleaned) {
          if (!validE164.test(phone)) {
            throw new Error(`Número inválido: "${phone}". Use o formato internacional com + (ex: +554999999999).`);
          }
        }
        customPhoneNumbers = cleaned;
      }

      if (audienceType === "IMPORT_LIST" && importedContacts.length === 0) {
        throw new Error("Faça o upload de uma planilha válida com pelo menos um contato.");
      }

      // Prepare sanitized variables: Ensure auto-mapped name variables default to [Nome do Contato] if empty
      const sanitizedVariables: Record<string, string> = { ...variables };
      for (const k of templateVarKeys) {
        if (isRecipientNameVariable(k) && !sanitizedVariables[k]) {
          sanitizedVariables[k] = "[Nome do Contato]";
        }
      }

      const sanitizedVariablesB: Record<string, string> = { ...variablesB };
      for (const k of templateVarKeysB) {
        if (isRecipientNameVariable(k) && !sanitizedVariablesB[k]) {
          sanitizedVariablesB[k] = "[Nome do Contato]";
        }
      }

      const res = await apiClient.createBroadcast(
        workspaceId,
        {
          name: campaignName.trim() || undefined,
          channelInstanceId: selectedChannel.id,
          templateId: selectedTemplate.id,
          isAbTest,
          variantBTemplateId: isAbTest && selectedTemplateB ? selectedTemplateB.id : undefined,
          audience: {
            type: audienceType,
            stage: audienceType === "BY_STAGE" ? stage : undefined,
            customPhoneNumbers,
            importedContacts: audienceType === "IMPORT_LIST" ? importedContacts : undefined,
            smartFilter: audienceType === "SMART_FILTER" ? smartFilter : undefined,
          },
          variables: sanitizedVariables,
          variantBVariables: isAbTest ? sanitizedVariablesB : undefined,
        },
        { token }
      );

      setSuccessInfo({
        batchId: res.batchId,
        enqueuedCount: res.enqueuedCount,
        totalTargeted: res.totalTargeted,
        templateName: res.template.name,
        isAbTest,
      });

      onBroadcastSuccess?.();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Falha ao enfileirar disparo em massa."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={isAbTest ? "Disparo com Teste A/B (Divisão 50/50)" : "Disparo em Massa de Modelo WABA"}
      maxWidth="840px"
      description="Envie mensagens ativas aprovadas pela Meta com rastreamento completo de entrega, leitura, resposta e cliques."
    >
      {isLoadingPreflight ? (
        <div style={{ padding: "32px 0" }}>
          <LoadingState variant="spinner" text="Verificando canais, trava de faturamento e base..." />
        </div>
      ) : successInfo ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "12px 0" }}>
          <div
            style={{
              padding: "20px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid #10b981",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              textAlign: "center",
            }}
          >
            <CheckCircle2 size={48} color="#10b981" />
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Campanha Enfileirada com Sucesso!
              </h3>
              <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                {successInfo.enqueuedCount} mensagens foram geradas e enviadas ao Outbox via{" "}
                <strong>{selectedChannel?.displayName}</strong>.
                {successInfo.isAbTest && (
                  <span style={{ display: "block", marginTop: "4px", color: "var(--color-operational)", fontWeight: 600 }}>
                    ⚡ Teste A/B ativo: O público foi dividido 50% para a Variante A e 50% para a Variante B.
                  </span>
                )}
              </p>
            </div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--bg-surface)",
                padding: "6px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
              }}
            >
              Batch ID: {successInfo.batchId}
            </div>
          </div>

          <div
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--text-secondary)",
              backgroundColor: "var(--bg-canvas)",
              padding: "12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
            }}
          >
            <strong>Regra de Faturamento Meta:</strong> O SOS Sales não cobra nem intermedeia tarifas. Todas as mensagens
            entregues são tarifadas diretamente pela Meta no cartão cadastrado na sua conta do WhatsApp Business Manager.
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
            <Button variant="primary" size="sm" onClick={onClose}>
              Ver Métricas da Campanha
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {errorMessage && (
            <Alert variant="danger" title="Atenção">
              {errorMessage}
            </Alert>
          )}

          {/* 1. Nome da Campanha & Modo A/B */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "12px", alignItems: "end" }}>
            <Input
              label="Nome da Campanha (Opcional)"
              placeholder="Ex: Oferta Relâmpago - Leads Qualificados"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                Tipo de Disparo
              </label>
              <SegmentedControl
                value={isAbTest ? "AB_TEST" : "SINGLE"}
                onChange={(val) => setIsAbTest(val === "AB_TEST")}
                options={[
                  { value: "SINGLE", label: "Disparo Único" },
                  { value: "AB_TEST", label: "Teste A/B (50/50)" },
                ]}
              />
            </div>
          </div>

          {/* 2. Seleção de Canal & Trava de Faturamento Meta */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Canal de Envio (Linha WhatsApp)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px" }}>
              {channels.map((ch) => {
                const isSelected = ch.id === selectedChannelId;
                const isBlocked = ch.provider === "meta_waba" && !ch.metaBillingConfigured;

                return (
                  <div
                    key={ch.id}
                    onClick={() => setSelectedChannelId(ch.id)}
                    style={{
                      border: isSelected
                        ? (isBlocked ? "2px solid #ef4444" : "2px solid var(--color-action)")
                        : (isBlocked ? "1px dashed rgba(239, 68, 68, 0.4)" : "1px solid var(--border-default)"),
                      borderRadius: "var(--radius-lg)",
                      padding: "12px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--bg-surface)" : "var(--bg-canvas)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      transition: "all 0.15s ease",
                      opacity: isBlocked ? 0.9 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                        {ch.displayName}
                      </span>
                      <Badge variant={ch.status === "connected" ? "action" : "danger"}>
                        {ch.status === "connected" ? "Conectado" : "Desconectado"}
                      </Badge>
                    </div>

                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      {ch.provider.toUpperCase()} {ch.phoneNumberE164 ? `· ${ch.phoneNumberE164}` : ""}
                    </div>

                    {ch.provider === "meta_waba" && (
                      <div style={{ marginTop: "4px" }}>
                        {ch.metaBillingConfigured ? (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(16, 185, 129, 0.15)",
                              color: "#10b981",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <ShieldCheck size={12} /> Cartão Meta Configurado
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              color: "#ef4444",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <ShieldAlert size={12} /> Cartão Meta Não Vinculado
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* TRAVA OBRIGATÓRIA DE CARTÃO META */}
            {selectedChannel && isBillingBlocked && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "14px 16px",
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid #ef4444",
                  borderRadius: "var(--radius-lg)",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <ShieldAlert size={24} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "var(--font-size-sm)", color: "#b91c1c" }}>
                    Disparo Ativo Bloqueado — Cartão Meta Não Vinculado
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    O <strong>SOS Sales não cobra nem intermedeia tarifas</strong> de mensagens da Meta.
                    Para realizar disparos ativos neste canal oficial, você deve ter um cartão de crédito cadastrado diretamente no seu <strong>Gerenciador de Negócios da Meta (Business Manager)</strong>.
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Cadastre o cartão na Meta e vá em <strong>Configurações &gt; Canais WhatsApp</strong> para confirmar a vinculação.
                  </span>
                </div>
              </div>
            )}

            {selectedChannel && isMetaWaba && isMetaBillingConfigured && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "10px 14px",
                  backgroundColor: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid #10b981",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <ShieldCheck size={18} color="#10b981" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  <strong>Faturamento Direto Meta Ativo:</strong> Tarifas cobradas diretamente no seu cartão cadastrado no Business Manager. O SOS Sales não cobra intermediários.
                </span>
              </div>
            )}

            {selectedChannel && !isMetaWaba && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "10px 14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <AlertTriangle size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  Canal via QR Code (WAHA). Sem custo por mensagem, porém sujeito a limites e moderação do WhatsApp.
                </span>
              </div>
            )}
          </div>

          {/* 3. Seleção de Público-Alvo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Público-Alvo do Disparo
            </label>
            <SegmentedControl
              value={audienceType}
              onChange={(v) => setAudienceType(v as typeof audienceType)}
              options={[
                { value: "ALL_CONTACTS", label: `Todos Ativos (${totalActiveContacts})` },
                { value: "SMART_FILTER", label: "Filtro Inteligente" },
                { value: "IMPORT_LIST", label: "Planilha (CSV / Excel)" },
                { value: "BY_STAGE", label: "Por Estágio" },
                { value: "MANUAL", label: "Manual" },
              ]}
            />

            {/* A. Filtro Inteligente Soberano */}
            {audienceType === "SMART_FILTER" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Filter size={13} color="var(--color-operational)" /> Critério de Segmentação Soberana:
                  </span>
                  <Badge variant={smartCount && smartCount > 0 ? "action" : "neutral"}>
                    {isLoadingSmartCount ? "Calculando..." : `${smartCount ?? 0} contatos elegíveis`}
                  </Badge>
                </div>

                <select
                  value={smartFilter}
                  onChange={(e) => setSmartFilter(e.target.value as typeof smartFilter)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="NON_BUYERS">🎯 Não Compradores (Sem venda/WON ou Pix pago)</option>
                  <option value="PIX_ABANDONED">⚡ Recuperação Pix (Cobrança expirada ou não paga)</option>
                  <option value="INACTIVE_30_DAYS">⏳ Inativos (Sem interação há mais de 30 dias)</option>
                  <option value="CTWA_RESCUE">📣 Resgate CTWA (Leads de anúncios Meta em Lead/Qualificado)</option>
                </select>

                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {smartFilter === "NON_BUYERS" &&
                    "Filtra contatos que conversaram com a equipe ou IA mas não possuem fechamento comercial (WON) ou Pix pago registrado. Ideal para campanhas de oferta relâmpago e reativação."}
                  {smartFilter === "PIX_ABANDONED" &&
                    "Isola clientes com cobrança Pix gerada que expirou ou não foi concluída, sem histórico de pagamento aprovado. Ideal para recuperação imediata de faturamento perdido com cupons ou novas ofertas."}
                  {smartFilter === "INACTIVE_30_DAYS" &&
                    "Isola contatos sem qualquer mensagem trocada nos últimos 30 dias para campanhas de resgate de base fria."}
                  {smartFilter === "CTWA_RESCUE" &&
                    "Filtra leads que vieram de anúncios Click-to-WhatsApp Ads do Facebook/Instagram e ainda estão no início do funil de vendas."}
                </span>
              </div>
            )}

            {/* B. Importador de Planilhas (CSV / Excel) */}
            {audienceType === "IMPORT_LIST" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />

                {!importedFile ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="sos-dropzone"
                    style={{
                      border: "2px dashed var(--border-default)",
                      borderRadius: "var(--radius-md)",
                      padding: "24px 16px",
                      textAlign: "center",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      backgroundColor: "var(--bg-surface)",
                      transition: "border-color 0.2s ease",
                    }}
                  >
                    <UploadCloud size={32} color="var(--color-operational)" />
                    <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                      {isParsingFile ? "Processando e validando planilha..." : "Clique ou arraste uma planilha (.csv, .xlsx, .xls) aqui"}
                    </span>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      Reconhece colunas de <strong>Nome</strong> e <strong>Telefone</strong> com sanitização E.164 automática (+55DD9XXXXXXXX)
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <FileSpreadsheet size={22} color="var(--color-operational)" />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                            {importedFile.name}
                          </div>
                          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                            {(importedFile.size / 1024).toFixed(1)} KB · {importStats?.totalRows || 0} linhas analisadas
                          </div>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={removeImportedFile}
                        prefixIcon={<Trash2 size={14} />}
                      >
                        Trocar Planilha
                      </Button>
                    </div>

                    {importError && (
                      <Alert variant="danger" title="Aviso de Importação">
                        {importError}
                      </Alert>
                    )}

                    {importStats && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          <span
                            style={{
                              fontSize: "var(--font-size-xs)",
                              padding: "4px 8px",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "var(--color-action-subtle)",
                              color: "var(--color-action)",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <CheckCircle2 size={12} /> {importStats.validCount} Telefones Válidos (E.164)
                          </span>
                          {importStats.duplicateCount > 0 && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                padding: "4px 8px",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "var(--color-warning-subtle)",
                                color: "var(--color-warning)",
                                fontWeight: 600,
                              }}
                            >
                              {importStats.duplicateCount} Duplicados Unificados
                            </span>
                          )}
                          {importStats.invalidCount > 0 && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                padding: "4px 8px",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "var(--color-danger-subtle)",
                                color: "var(--color-danger)",
                                fontWeight: 600,
                              }}
                            >
                              {importStats.invalidCount} Inválidos/Fixos Descartados
                            </span>
                          )}
                        </div>

                        {importedContacts.length > 0 && (
                          <div
                            style={{
                              maxHeight: "140px",
                              overflowY: "auto",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-subtle)",
                              backgroundColor: "var(--bg-surface)",
                              fontSize: "var(--font-size-xs)",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 1fr)",
                                padding: "6px 10px",
                                fontWeight: 600,
                                backgroundColor: "var(--bg-canvas)",
                                borderBottom: "1px solid var(--border-subtle)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              <span>Nome</span>
                              <span>Telefone Sanitizado</span>
                              <span style={{ textAlign: "right" }}>Status</span>
                            </div>
                            {importedContacts.slice(0, 10).map((c, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 1fr)",
                                  padding: "5px 10px",
                                  borderBottom: "1px solid var(--border-subtle)",
                                  alignItems: "center",
                                }}
                              >
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {c.name || "—"}
                                </span>
                                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                                  {c.phoneE164}
                                </span>
                                <span style={{ textAlign: "right", color: "var(--color-action)", fontWeight: 600 }}>
                                  Pronto
                                </span>
                              </div>
                            ))}
                            {importedContacts.length > 10 && (
                              <div
                                style={{
                                  padding: "6px 10px",
                                  textAlign: "center",
                                  color: "var(--text-muted)",
                                  fontSize: "0.75rem",
                                }}
                              >
                                + {importedContacts.length - 10} outros contatos prontos para envio
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* C. Por Estágio do Funil */}
            {audienceType === "BY_STAGE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    Selecione a etapa dos contatos no funil comercial:
                  </span>
                  <Badge variant={smartCount && smartCount > 0 ? "action" : "neutral"}>
                    {isLoadingSmartCount ? "Calculando..." : `${smartCount ?? 0} contatos nesta etapa`}
                  </Badge>
                </div>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="LEAD">Leads em Prospecção (LEAD)</option>
                  <option value="QUALIFIED">Qualificados (QUALIFIED)</option>
                  <option value="PROPOSAL">Com Proposta Enviada (PROPOSAL)</option>
                  <option value="NEGOTIATION">Em Negociação (NEGOTIATION)</option>
                  <option value="WON">Clientes Fechados (WON)</option>
                  <option value="LOST">Oportunidades Perdidas (LOST)</option>
                </select>
              </div>
            )}

            {/* D. Manual */}
            {audienceType === "MANUAL" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  Cole os números de telefone em formato internacional (separados por vírgula ou linha):
                </span>
                <textarea
                  rows={3}
                  value={manualPhones}
                  onChange={(e) => setManualPhones(e.target.value)}
                  placeholder="+554999999999, +5511988887777"
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--font-size-xs)",
                    resize: "vertical",
                  }}
                />
              </div>
            )}
          </div>

          {/* 4. Modelos e Variáveis: Modo Simples vs Modo Teste A/B */}
          {!isAbTest ? (
            /* Modo Disparo Simples */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                    Modelo de Mensagem (WhatsApp)
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCreateAiModalOpen(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(99, 102, 241, 0.1)",
                      border: "1px solid rgba(99, 102, 241, 0.25)",
                      color: "var(--color-ai, #6366f1)",
                      fontSize: "var(--font-size-xs)",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "3px 10px",
                      borderRadius: "var(--radius-md)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Criar Modelo com IA</span>
                  </button>
                </div>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={templates.length === 0}
                  style={{
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-canvas)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  {templates.length === 0 ? (
                    <option value="">Nenhum modelo cadastrado</option>
                  ) : (
                    templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {formatTemplateDisplayTitle(tpl)}
                      </option>
                    ))
                  )}
                </select>
                {selectedTemplate && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                    <Badge variant={selectedTemplate.category === "UTILITY" ? "operational" : "neutral"}>
                      {selectedTemplate.category === "UTILITY"
                        ? "⚡ Utilidade (~R$ 0,04 • Economia de 85% + Janela 24h Grátis)"
                        : "⭐ Marketing (~R$ 0,40 • Custo Padrão)"}
                    </Badge>
                  </div>
                )}
              </div>

              {templateVarKeys.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    padding: "14px",
                    backgroundColor: "var(--bg-canvas)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, color: "var(--text-primary)" }}>
                      Personalização da Mensagem ({templateVarKeys.length} {templateVarKeys.length === 1 ? "campo" : "campos"}):
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Campos dinâmicos do modelo
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {templateVarKeys.map((k) => {
                      const meta = getVariableMetadata(k);
                      if (meta.isName) {
                        return (
                          <div
                            key={k}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 14px",
                              backgroundColor: "rgba(16, 185, 129, 0.08)",
                              border: "1px solid rgba(16, 185, 129, 0.25)",
                              borderRadius: "var(--radius-md)",
                              gap: "10px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  backgroundColor: "rgba(16, 185, 129, 0.2)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#10b981",
                                  flexShrink: 0,
                                }}
                              >
                                <CheckCircle2 size={18} />
                              </div>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, color: "var(--text-primary)" }}>
                                  👤 {meta.label} (Automático)
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  Substituído automaticamente pelo primeiro nome de cada cliente da lista (ex: "Francisco").
                                </span>
                              </div>
                            </div>
                            <Badge variant="operational">Auto 100%</Badge>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={k}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            padding: "10px 12px",
                            backgroundColor: "var(--bg-surface)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <Input
                            label={meta.label}
                            placeholder={meta.placeholder}
                            value={variables[k] || ""}
                            onChange={(e) => setVariables({ ...variables, [k]: e.target.value })}
                          />
                          {meta.suggestions.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Sugestões rápidas:</span>
                              {meta.suggestions.map((sug) => (
                                <button
                                  key={sug}
                                  type="button"
                                  onClick={() => setVariables({ ...variables, [k]: sug })}
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 8px",
                                    borderRadius: "12px",
                                    border: "1px solid var(--border-default)",
                                    backgroundColor: "var(--bg-canvas)",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedTemplate && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                      Prévia Real da Mensagem (WhatsApp)
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Simulação real com lead de exemplo (Francisco)
                    </span>
                  </div>
                  <div
                    style={{
                      backgroundColor: "var(--bg-canvas)",
                      padding: "16px",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-default)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      background: "repeating-linear-gradient(45deg, var(--bg-canvas), var(--bg-canvas) 10px, rgba(0,0,0,0.015) 10px, rgba(0,0,0,0.015) 20px)",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "92%",
                        backgroundColor: "var(--bg-surface)",
                        padding: "12px 16px",
                        borderRadius: "8px 8px 8px 0px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        position: "relative",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {selectedTemplate.headerText && (
                        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                          {selectedTemplate.headerText}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: "var(--font-size-sm)",
                          color: "var(--text-primary)",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {renderWhatsappMarkdown(previewBody)}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          gap: "4px",
                          marginTop: "2px",
                        }}
                      >
                        {selectedTemplate.footerText && (
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", marginRight: "auto" }}>
                            {selectedTemplate.footerText}
                          </span>
                        )}
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>10:42</span>
                        <CheckCircle2 size={12} color="#53bdeb" />
                      </div>
                    </div>

                    {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                      <div
                        style={{
                          marginTop: "4px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          width: "92%",
                        }}
                      >
                        {selectedTemplate.buttons.map((btn, idx) => (
                          <div
                            key={idx}
                            style={{
                              backgroundColor: "var(--bg-surface)",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              border: "1px solid var(--border-subtle)",
                              textAlign: "center",
                              fontSize: "var(--font-size-xs)",
                              fontWeight: 600,
                              color: "var(--color-brand-primary, #10b981)",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                            }}
                          >
                            {btn.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Modo Teste A/B 50/50 */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  padding: "10px 14px",
                  backgroundColor: "var(--color-ai-subtle)",
                  border: "1px solid var(--color-ai-border)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <Sparkles size={18} color="var(--color-ai)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  <strong>Divisão 50/50 Automatizada:</strong> O sistema dividirá seu público igualmente. Você poderá comparar lado a lado a taxa de abertura, respostas e cliques no painel da campanha.
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: "16px" }}>
                {/* Coluna Variante A */}
                <div
                  style={{
                    padding: "14px",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)",
                    backgroundColor: "var(--bg-canvas)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    minWidth: 0,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Badge variant="action">Variante A (50%)</Badge>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Contatos ímpares</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                    <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Modelo A</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                        backgroundColor: "var(--bg-canvas)",
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-primary)",
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {formatTemplateDisplayTitle(tpl)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {templateVarKeys.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Variáveis A:</span>
                      {templateVarKeys.map((k) => {
                        const meta = getVariableMetadata(k);
                        if (meta.isName) {
                          return (
                            <div
                              key={k}
                              style={{
                                padding: "6px 10px",
                                backgroundColor: "rgba(16, 185, 129, 0.08)",
                                border: "1px solid rgba(16, 185, 129, 0.2)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "11px",
                                color: "#10b981",
                                fontWeight: 600,
                              }}
                            >
                              👤 {meta.label} (Automático)
                            </div>
                          );
                        }
                        return (
                          <Input
                            key={k}
                            label={meta.label}
                            placeholder={meta.placeholder}
                            value={variables[k] || ""}
                            onChange={(e) => setVariables({ ...variables, [k]: e.target.value })}
                          />
                        );
                      })}
                    </div>
                  )}

                  {selectedTemplate && (
                    <div
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                        maxHeight: "180px",
                        overflowY: "auto",
                      }}
                    >
                      {renderWhatsappMarkdown(previewBody)}
                    </div>
                  )}
                </div>

                {/* Coluna Variante B */}
                <div
                  style={{
                    padding: "14px",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)",
                    backgroundColor: "var(--bg-canvas)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    minWidth: 0,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Badge variant="warning">Variante B (50%)</Badge>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Contatos pares</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                    <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Modelo B</label>
                    <select
                      value={selectedTemplateBId}
                      onChange={(e) => setSelectedTemplateBId(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                        backgroundColor: "var(--bg-canvas)",
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-primary)",
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {formatTemplateDisplayTitle(tpl)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {templateVarKeysB.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Variáveis B:</span>
                      {templateVarKeysB.map((k) => {
                        const meta = getVariableMetadata(k);
                        if (meta.isName) {
                          return (
                            <div
                              key={k}
                              style={{
                                padding: "6px 10px",
                                backgroundColor: "rgba(16, 185, 129, 0.08)",
                                border: "1px solid rgba(16, 185, 129, 0.2)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "11px",
                                color: "#10b981",
                                fontWeight: 600,
                              }}
                            >
                              👤 {meta.label} (Automático)
                            </div>
                          );
                        }
                        return (
                          <Input
                            key={k}
                            label={meta.label}
                            placeholder={meta.placeholder}
                            value={variablesB[k] || ""}
                            onChange={(e) => setVariablesB({ ...variablesB, [k]: e.target.value })}
                          />
                        );
                      })}
                    </div>
                  )}

                  {selectedTemplateB && (
                    <div
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                        maxHeight: "180px",
                        overflowY: "auto",
                      }}
                    >
                      {renderWhatsappMarkdown(previewBodyB)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ações do Rodapé */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "8px",
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: "14px",
            }}
          >
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={!canSubmit}
              prefixIcon={isAbTest ? <Layers size={14} /> : <Send size={14} />}
              title={
                isBillingBlocked
                  ? "Disparo travado: Cadastre o cartão no Meta Business Manager e confirme nas configurações de canais"
                  : !isChannelConnected
                    ? "Canal selecionado está desconectado"
                    : isAbTest
                      ? "Iniciar Teste A/B 50/50"
                      : "Iniciar disparo ativo"
              }
            >
              {isBillingBlocked
                ? "Disparo Travado (Sem Cartão Meta)"
                : isAbTest
                  ? "Iniciar Teste A/B (50/50)"
                  : "Iniciar Disparo em Massa"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>

      {/* Modal Integrado de Criação de Modelo com IA & Redução de Custo */}
      {isCreateAiModalOpen && (
        <CreateTemplateDialog
          isOpen={isCreateAiModalOpen}
          onClose={() => setIsCreateAiModalOpen(false)}
          workspaceId={workspaceId}
          token={token}
          onCreated={handleTemplateCreated}
        />
      )}
    </>
  );
};
