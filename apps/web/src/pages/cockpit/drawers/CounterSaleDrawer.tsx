import { type FC, useState, useEffect } from "react";
import { Drawer, Button, Input, SegmentedControl, Badge } from "@sos-sales/ui";
import {
  Building2,
  ShoppingBag,
  CreditCard,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Search,
} from "lucide-react";
import {
  apiClient,
  type PosSalePayload,
  type PosSaleResult,
  type CnpjEnrichmentResult,
} from "../../../services/api-client";
import { userFacingError } from "../../../utils/user-facing-error";
import { parseProposalPrice } from "./ProposalDrawer";

export interface CounterSaleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  token?: string;
  onSaleCreated?: (result: PosSaleResult) => void | Promise<void>;
}

interface SaleLineItem {
  id: string;
  title: string;
  price: string;
  quantity: string;
}

// Formatters and Mask Helpers
function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function toE164(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export const CounterSaleDrawer: FC<CounterSaleDrawerProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onSaleCreated,
}) => {
  // Document state
  const [docType, setDocType] = useState<"CPF" | "CNPJ">("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Address state
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  // Sale items
  const [saleTitle, setSaleTitle] = useState("Venda de Balcão");
  const [items, setItems] = useState<SaleLineItem[]>([
    { id: "1", title: "", price: "", quantity: "1" },
  ]);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credito" | "debito" | "dinheiro" | "outros">("pix");

  // Automation & Fiscal toggles
  const [emitNfe, setEmitNfe] = useState(true);
  const [sendUtilityWhatsapp, setSendUtilityWhatsapp] = useState(true);
  const [bonusPercent, setBonusPercent] = useState(10);
  const [bonusCoupon, setBonusCoupon] = useState("CLIENTEVIP");

  // Status & Asynchronous state
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [enrichedData, setEnrichedData] = useState<CnpjEnrichmentResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<PosSaleResult | null>(null);

  // Lifecycle & Reset on Open
  useEffect(() => {
    if (isOpen) {
      setDocType("CPF");
      setDocNumber("");
      setCustomerName("");
      setTradeName("");
      setPhone("");
      setEmail("");
      setCep("");
      setStreet("");
      setNumber("");
      setComplement("");
      setNeighborhood("");
      setCity("");
      setState("");
      setSaleTitle("Venda de Balcão");
      setItems([{ id: "1", title: "", price: "", quantity: "1" }]);
      setPaymentMethod("pix");
      setEmitNfe(true);
      setSendUtilityWhatsapp(true);
      setBonusPercent(10);
      setBonusCoupon("CLIENTEVIP");
      setIsSearchingCnpj(false);
      setEnrichedData(null);
      setIsSubmitting(false);
      setErrorMessage(null);
      setSuccessResult(null);
    }
  }, [isOpen]);

  // Handle Document Input with Automatic Enrichment for CNPJ
  const handleDocChange = async (val: string) => {
    const raw = val.replace(/\D/g, "");
    if (docType === "CPF") {
      setDocNumber(maskCpf(raw));
    } else {
      const masked = maskCnpj(raw);
      setDocNumber(masked);

      // Trigger BrasilAPI enrichment if 14 digits reached
      if (raw.length === 14 && workspaceId && token) {
        setIsSearchingCnpj(true);
        setErrorMessage(null);
        try {
          const res = await apiClient.enrichCnpj(raw, { token });
          setEnrichedData(res);
          if (res.razaoSocial) setCustomerName(res.razaoSocial);
          if (res.nomeFantasia) setTradeName(res.nomeFantasia);
          if (res.email && !email) setEmail(res.email);
          if (res.telefone && !phone) setPhone(maskPhone(res.telefone));
          if (res.cep) setCep(maskCep(res.cep));
          if (res.logradouro) setStreet(res.logradouro);
          if (res.numero) setNumber(res.numero);
          if (res.complemento) setComplement(res.complemento);
          if (res.bairro) setNeighborhood(res.bairro);
          if (res.municipio) setCity(res.municipio);
          if (res.uf) setState(res.uf);
        } catch {
          // Silent fallback - user can fill manually
        } finally {
          setIsSearchingCnpj(false);
        }
      }
    }
  };

  // Handle CEP Search
  const handleCepChange = async (val: string) => {
    const raw = val.replace(/\D/g, "");
    setCep(maskCep(raw));
    if (raw.length === 8 && token) {
      try {
        const res = await apiClient.enrichCep(raw, { token });
        if (res.street) setStreet(res.street);
        if (res.neighborhood) setNeighborhood(res.neighborhood);
        if (res.city) setCity(res.city);
        if (res.state) setState(res.state);
      } catch {
        // Continue manually
      }
    }
  };

  // Line Item Management
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: "", price: "", quantity: "1" },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof SaleLineItem, val: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  // Calculations
  const normalizedItems = items.map((item) => {
    const unitPriceCents = parseProposalPrice(item.price) || 0;
    const qty = parseInt(item.quantity, 10);
    const quantity = isNaN(qty) || qty < 1 ? 1 : qty;
    return {
      title: item.title.trim(),
      unitPriceCents,
      quantity,
      subtotalCents: unitPriceCents * quantity,
    };
  });

  const totalCents = normalizedItems.reduce((acc, cur) => acc + cur.subtotalCents, 0);

  const phoneDigits = phone.replace(/\D/g, "");
  const isPhoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 11;
  const isCustomerValid = customerName.trim().length >= 2 && isPhoneValid;
  const isItemsValid =
    normalizedItems.length > 0 &&
    normalizedItems.every((it) => it.title.length > 0 && it.unitPriceCents > 0);
  const canSubmit = isCustomerValid && isItemsValid && totalCents > 0 && !isSubmitting;

  // Submit Handler
  const handleSubmitSale = async () => {
    if (!canSubmit || !workspaceId || !token) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: PosSalePayload = {
      customer: {
        name: customerName.trim(),
        phoneE164: toE164(phone),
        documentType: docType,
        documentNumber: docNumber.trim(),
        email: email.trim() || undefined,
        companyName: customerName.trim(),
        tradeName: tradeName.trim() || undefined,
        address: {
          zipCode: cep.replace(/\D/g, "") || undefined,
          street: complement.trim() ? `${street.trim()} - ${complement.trim()}` : street.trim() || undefined,
          number: number.trim() || undefined,
          neighborhood: neighborhood.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
        },
      },
      sale: {
        title: saleTitle.trim() || "Venda de Balcão",
        items: normalizedItems.map((it) => ({
          title: it.title,
          unitPriceCents: it.unitPriceCents,
          quantity: it.quantity,
        })),
        totalCents,
        paymentMethod,
      },
      fiscal: {
        emitNfe,
        naturezaOperacao: "Venda presencial no balcão",
      },
      postSale: {
        sendUtilityWhatsapp,
        bonusPercent,
        bonusCoupon: bonusCoupon.trim().toUpperCase() || "CLIENTEVIP",
        followUpFlow: "oferta_recompra",
      },
    };

    try {
      const result = await apiClient.createPosSale(workspaceId, payload, { token });
      setSuccessResult(result);
      if (onSaleCreated) {
        await onSaleCreated(result);
      }
    } catch (err) {
      setErrorMessage(
        userFacingError(
          err,
          "Não foi possível registrar a venda de balcão. Verifique os dados e tente novamente."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      width="min(680px, 95vw)"
      title="⚡ Nova Venda Balcão / POS"
      description="Registre vendas presenciais com enriquecimento fiscal automático e pós-venda inteligente no WhatsApp."
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", width: "100%", flexWrap: "wrap" }}>
          {successResult ? (
            <Button size="sm" variant="primary" onClick={onClose}>
              Concluir & Fechar
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" disabled={isSubmitting} onClick={onClose}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!canSubmit}
                onClick={handleSubmitSale}
              >
                {isSubmitting ? "Registrando Venda..." : `Fechar Venda (${formatCurrency(totalCents)})`}
              </Button>
            </>
          )}
        </div>
      }
    >
      {/* SUCCESS STATE */}
      {successResult ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "24px 16px",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              color: "#10B981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle2 size={32} />
          </div>

          <div>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Venda Registrada com Sucesso!
            </h3>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              O atendimento foi criado no Cockpit com os dados fiscais e o pós-venda ativado.
            </p>
          </div>

          <div
            style={{
              width: "100%",
              backgroundColor: "var(--bg-surface-elevated, #1E293B)",
              borderRadius: "8px",
              padding: "16px",
              border: "1px solid var(--border-default, rgba(255,255,255,0.08))",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Valor Total:</span>
              <strong style={{ fontSize: "1rem", color: "#10B981" }}>
                {formatCurrency(successResult.totalCents)}
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Emissão Fiscal:</span>
              <Badge variant={successResult.fiscalStatus === "solicitada" ? "action" : "neutral"}>
                {successResult.fiscalStatus === "solicitada" ? "Pronta para Emissão" : "Não Solicitada"}
              </Badge>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>WhatsApp Pós-Venda:</span>
              <Badge variant={successResult.whatsappDispatched ? "action" : "neutral"}>
                {successResult.whatsappDispatched ? "Notificação Enfileirada" : "Desativado"}
              </Badge>
            </div>

            {successResult.postSalePrompt && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "10px 12px",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  borderRadius: "6px",
                  borderLeft: "3px solid #3B82F6",
                  fontSize: "0.8125rem",
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {successResult.postSalePrompt}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", overflowX: "hidden", maxWidth: "100%", width: "100%", boxSizing: "border-box" }}>
          {errorMessage && (
            <div
              role="alert"
              style={{
                padding: "10px 14px",
                backgroundColor: "var(--color-danger-subtle, rgba(239, 68, 68, 0.1))",
                color: "var(--color-danger, #EF4444)",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.875rem",
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. SEÇÃO DO CLIENTE & FISCAL */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface-elevated, #1E293B)",
              borderRadius: "8px",
              border: "1px solid var(--border-default, rgba(255,255,255,0.08))",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxSizing: "border-box",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                <Building2 size={18} style={{ color: "var(--color-action, #3B82F6)", flexShrink: 0 }} />
                <h4 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  Identificação do Cliente & Fiscal
                </h4>
              </div>
              <div style={{ flexShrink: 0 }}>
                <SegmentedControl
                  options={[
                    { value: "CPF", label: "Pessoa Física (CPF)" },
                    { value: "CNPJ", label: "Pessoa Jurídica (CNPJ)" },
                  ]}
                  value={docType}
                  onChange={(val) => {
                    setDocType(val as "CPF" | "CNPJ");
                    setDocNumber("");
                    setEnrichedData(null);
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
              <div style={{ minWidth: 0 }}>
                <Input
                  label={docType === "CPF" ? "CPF do Cliente" : "CNPJ da Empresa"}
                  placeholder={docType === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                  value={docNumber}
                  onChange={(e) => handleDocChange(e.target.value)}
                  suffixIcon={
                    isSearchingCnpj ? (
                      <Search size={14} className="animate-spin" style={{ color: "#3B82F6" }} />
                    ) : enrichedData ? (
                      <CheckCircle2 size={14} style={{ color: "#10B981" }} />
                    ) : undefined
                  }
                  helperText={
                    docType === "CNPJ" && isSearchingCnpj
                      ? "Consultando dados na Receita Federal..."
                      : enrichedData
                      ? "Dados enriquecidos via BrasilAPI"
                      : undefined
                  }
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <Input
                  label={docType === "CPF" ? "Nome Completo" : "Razão Social"}
                  placeholder={docType === "CPF" ? "Nome do cliente" : "Razão Social da empresa"}
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
              <div style={{ minWidth: 0 }}>
                <Input
                  label="WhatsApp para Pós-Venda"
                  placeholder="(00) 00000-0000"
                  required
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  helperText="Receberá a nota fiscal e o bônus inteligente"
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <Input
                  label="E-mail (Opcional)"
                  placeholder="cliente@email.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Endereço Fiscal Resumido */}
            <div style={{ borderTop: "1px solid var(--border-default, rgba(255,255,255,0.06))", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 140px) 1fr", gap: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <Input
                    label="CEP"
                    placeholder="00000-000"
                    value={cep}
                    onChange={(e) => handleCepChange(e.target.value)}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Input
                    label="Logradouro"
                    placeholder="Rua / Avenida"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 110px) 1fr", gap: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <Input
                    label="Nº"
                    placeholder="123"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Input
                    label="Complemento"
                    placeholder="Sala / Apto (Opcional)"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr minmax(65px, 80px)", gap: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <Input
                    label="Bairro"
                    placeholder="Bairro"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Input
                    label="Cidade"
                    placeholder="Município"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Input
                    label="UF"
                    placeholder="SC"
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. ITENS DA VENDA & PAGAMENTO */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-surface-elevated, #1E293B)",
              borderRadius: "8px",
              border: "1px solid var(--border-default, rgba(255,255,255,0.08))",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxSizing: "border-box",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <ShoppingBag size={18} style={{ color: "#10B981" }} />
                <h4 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  Produtos / Serviços Vendidos
                </h4>
              </div>
              <Button size="sm" variant="secondary" onClick={handleAddItem}>
                <Plus size={14} style={{ marginRight: "4px" }} />
                Item
              </Button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map((item, index) => {
                const unitPriceCents = parseProposalPrice(item.price) || 0;
                const qty = parseInt(item.quantity, 10) || 1;
                const lineTotal = unitPriceCents * qty;

                return (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 1fr) 110px 70px 95px 36px",
                      gap: "8px",
                      alignItems: "end",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Input
                        label={index === 0 ? "Descrição do Item" : undefined}
                        placeholder="Ex: Película Solar G5, Serviço X..."
                        value={item.title}
                        onChange={(e) => handleItemChange(item.id, "title", e.target.value)}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Input
                        label={index === 0 ? "Preço Unit. (R$)" : undefined}
                        placeholder="0,00"
                        value={item.price}
                        onChange={(e) => handleItemChange(item.id, "price", e.target.value)}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Input
                        label={index === 0 ? "Qtd" : undefined}
                        placeholder="1"
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, "quantity", e.target.value)}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                      {index === 0 && (
                        <label style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                          Subtotal
                        </label>
                      )}
                      <div
                        style={{
                          height: "36px",
                          display: "flex",
                          alignItems: "center",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatCurrency(lineTotal)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {items.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveItem(item.id)}
                          style={{ color: "var(--color-danger, #EF4444)", height: "36px", width: "36px", padding: 0 }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Forma de Pagamento e Total */}
            <div
              style={{
                marginTop: "12px",
                paddingTop: "14px",
                borderTop: "1px solid var(--border-default, rgba(255,255,255,0.06))",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CreditCard size={16} style={{ color: "var(--text-secondary)" }} />
                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Forma de Pagamento:</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="pix">PIX Instantâneo</option>
                  <option value="credito">Cartão de Crédito</option>
                  <option value="debito">Cartão de Débito</option>
                  <option value="dinheiro">Dinheiro Físico</option>
                  <option value="outros">Outros / Convênio</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Total da Venda:</span>
                <span style={{ fontSize: "1.375rem", fontWeight: 700, color: "#10B981" }}>
                  {formatCurrency(totalCents)}
                </span>
              </div>
            </div>
          </div>

          {/* 3. AUTOMAÇÕES PÓS-VENDA & FISCAL */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "rgba(59, 130, 246, 0.04)",
              borderRadius: "8px",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={18} style={{ color: "#3B82F6" }} />
              <h4 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Pós-Venda Inteligente & Disparo Fiscal (Meta WABA)
              </h4>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={emitNfe}
                  onChange={(e) => setEmitNfe(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "#3B82F6" }}
                />
                <span style={{ fontWeight: 500 }}>Emitir e vincular Nota Fiscal (NFS-e / NFC-e)</span>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={sendUtilityWhatsapp}
                  onChange={(e) => setSendUtilityWhatsapp(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "#10B981" }}
                />
                <span style={{ fontWeight: 500 }}>
                  Disparar WhatsApp com comprovante fiscal e bônus na próxima compra
                </span>
              </label>
            </div>

            {sendUtilityWhatsapp && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "12px",
                  backgroundColor: "var(--bg-surface-elevated, #1E293B)",
                  borderRadius: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  border: "1px solid var(--border-default, rgba(255,255,255,0.06))",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <Input
                    label="Bônus na Recompra (%)"
                    type="number"
                    value={String(bonusPercent)}
                    onChange={(e) => setBonusPercent(parseInt(e.target.value, 10) || 10)}
                  />
                  <Input
                    label="Código do Cupom"
                    value={bonusCoupon}
                    onChange={(e) => setBonusCoupon(e.target.value.toUpperCase())}
                  />
                </div>

                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  💡 <strong>Engenharia de Conversão (WABA Utility):</strong> Envia uma mensagem oficial
                  perguntando se o cliente deseja a via fiscal no WhatsApp. Ao responder, a janela gratuita de 24h
                  se abre e o Agente de IA assume o diálogo entregando o cupom e agendando novas compras.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
};
