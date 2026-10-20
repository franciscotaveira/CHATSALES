import {productPriceInput,isValidProductPrice} from './product-price';
import {isKnownProductStatus} from './product-status';
import { useEffect, useState, useRef, useId, type FC, type FormEvent, type ChangeEvent } from "react";
import { Button, Input, Dialog, SegmentedControl, useBreakpoint } from "@sos-sales/ui";
import { Upload } from "lucide-react";
import { apiClient, type ProductRecord } from "../../services/api-client";
import { userFacingError } from "../../utils/user-facing-error";
import { UnsavedChangesNotice,useDiscardChanges } from "../UnsavedChangesNotice";

const parsePriceToCents = (raw:string):number|null => {
  const val=raw.trim();if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(val))return null;
  const [units,fraction=""]=val.replace(/\./g,"").split(",");const cents=Number(units)*100+Number(fraction.padEnd(2,"0"));
  return Number.isSafeInteger(cents)&&cents<=2147483647?cents:null;
};

interface CreateProductDialogProps {
  canManageAvailability?:boolean;
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  onCreated: () => void|Promise<void>;
  product?: ProductRecord | null;
}

export const CreateProductDialog: FC<CreateProductDialogProps> = ({
  isOpen,canManageAvailability=false,
  onClose,
  workspaceId,
  token,
  onCreated,
  product,
}) => {
  const { isMobile } = useBreakpoint();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef=useRef<HTMLFormElement>(null),errorSummaryRef=useRef<HTMLDivElement>(null),serverErrorRef=useRef<HTMLDivElement>(null);
  const descriptionErrorId=useId(),statusErrorId=useId();
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [retailerId, setRetailerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceReal, setPriceReal] = useState("0,00");
  const [category, setCategory] = useState("Geral");
  const [imageUrl, setImageUrl] = useState("");
  const [stockPolicy,setStockPolicy]=useState<"review_required"|"not_required">("review_required");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "OUT_OF_STOCK">("ACTIVE");
  const isEditing = Boolean(product);
  const generation=useRef(0),busy=useRef<"save"|"upload"|null>(null),scope=useRef("");
  const scopeKey=`${isOpen}:${workspaceId}:${token}:${product?.id}:${product?.updatedAt}`;scope.current=scopeKey;
  const [saved,setSaved]=useState(false);
  const [imageFailed,setImageFailed]=useState(false);
  const resumeFieldRef=useRef<HTMLInputElement>(null);
  const initial=product?[product.retailerId,product.title,product.description,productPriceInput(product.priceCents),product.category,product.imageUrl,product.stockPolicy??"review_required",product.status]:["","","","0,00","Geral","","review_required","ACTIVE"];
  const fields=[retailerId,title,description,priceReal,category,imageUrl,stockPolicy,status];
  const normalized=(values:readonly string[])=>[values[0]?.trim().toUpperCase(),values[1]?.trim(),values[2]?.trim(),parsePriceToCents(values[3]??""),values[4]?.trim()||"Geral",values[5]?.trim(),values[6],values[7]];
  const effectiveChange=JSON.stringify(normalized(fields))!==JSON.stringify(normalized(initial));
  const changed=isOpen&&!saved&&(isEditing?effectiveChange:JSON.stringify(fields)!==JSON.stringify(initial));
  const discardGuard=useDiscardChanges(changed,scopeKey,()=>resumeFieldRef.current,isOpen);
  const locked=isSubmitting||isUploadingImage||saved||discardGuard.isPending;
  const requestClose=()=>{if(!busy.current)discardGuard.requestExit(onClose);};
  useEffect(()=>{setImageFailed(false);},[imageUrl]);
  useEffect(()=>{
    if(!Object.keys(formErrors).length)return;
    const invalid=Array.from(formRef.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]')??[]).find(element=>!element.matches(':disabled'));
    (invalid??errorSummaryRef.current)?.focus();
  },[formErrors]);
  useEffect(()=>{if(serverError)serverErrorRef.current?.focus();},[serverError]);

  useEffect(() => {
    generation.current++;busy.current=null;setIsSubmitting(false);setIsUploadingImage(false);setSaved(false);
    if (!isOpen) return;
    if (product) {
      setRetailerId(product.retailerId);
      setTitle(product.title);
      setDescription(product.description);
      setPriceReal(productPriceInput(product.priceCents));
      setCategory(product.category);
      setImageUrl(product.imageUrl);
      setStatus(product.status);setStockPolicy(product.stockPolicy??"review_required");
      setFormErrors({});
      setServerError(null);
    } else {
      resetForm();
    }
    return()=>{generation.current++;};
  }, [scopeKey]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0];e.target.value="";
    if(!file||busy.current||saved||discardGuard.isPending)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size===0||file.size>5*1024*1024){setServerError("Escolha uma imagem JPEG, PNG ou WebP de até 5 MB.");return;}
    const request=generation.current,requestedScope=scope.current;const valid=()=>request===generation.current&&requestedScope===scope.current;
    busy.current="upload";setIsUploadingImage(true);setServerError(null);
    try{const res=await apiClient.uploadMedia(workspaceId,file,{token,isPublic:true});if(valid())setImageUrl(res.mediaUrl);}
    catch(err){if(valid())setServerError(userFacingError(err,"Falha ao enviar a imagem. Tente novamente."));}
    finally{if(valid()){busy.current=null;setIsUploadingImage(false);}}
  };

  const resetForm = () => {
    setRetailerId("");
    setTitle("");
    setDescription("");
    setPriceReal("0,00");
    setCategory("Geral");
    setImageUrl("");
    setStatus("ACTIVE");setStockPolicy("review_required");
    setFormErrors({});
    setServerError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy.current||saved||discardGuard.isPending||!isOpen) return;
    setFormErrors({});
    setServerError(null);

    const errors: Record<string, string> = {};
    if(!isKnownProductStatus(status))errors.status="Escolha um status válido antes de salvar. O status recebido não foi reconhecido.";
    const cleanSku = retailerId.trim().toUpperCase();
    if(cleanSku.length>100){errors.retailerId="Use um SKU de até 100 caracteres";} else if (!cleanSku) {
      errors.retailerId = "SKU é obrigatório";
    } else if (!/^[A-Za-z0-9_-]+$/.test(cleanSku)) {
      errors.retailerId = "SKU deve ser alfanumérico com hífens ou underscores (ex: PLANO-PRO-01)";
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      errors.title = "Título é obrigatório";
    } else if (cleanTitle.length > 120) {
      errors.title = "Título deve ter no máximo 120 caracteres";
    }

    const cleanDesc = description.trim();
    if (!cleanDesc) {
      errors.description = "Descrição é obrigatória";
    } else if (cleanDesc.length > 1024) {
      errors.description = "Descrição deve ter no máximo 1024 caracteres";
    }

    const priceCents = parsePriceToCents(priceReal);
    if (priceCents===null) {
      errors.priceCents = "Informe um preço válido";
    }

    const cleanImage = imageUrl.trim();
    if (!cleanImage) {
      errors.imageUrl = "URL de imagem é obrigatória";
    } else {
      try {
        const image = new URL(cleanImage);
        if (!["https:", "http:"].includes(image.protocol)) throw new Error("protocol");
      } catch {
        errors.imageUrl = "URL de imagem inválida";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    if(isEditing&&!effectiveChange)return;
    const request=generation.current,requestedScope=scope.current;const valid=()=>request===generation.current&&requestedScope===scope.current;
    busy.current="save";setIsSubmitting(true);let committed=false;
    try {
      await apiClient.createProduct(
        workspaceId,
        {
          retailerId: cleanSku,
          ...(canManageAvailability?{stockPolicy}:{}),
          ...(product?{expectedProductId:product.id,expectedUpdatedAt:product.updatedAt,catalogId:product.catalogId,subtitle:product.subtitle,currency:product.currency,badge:product.badge,isFeatured:product.isFeatured}:{createOnly:true}),
          title: cleanTitle,
          description: cleanDesc,
          priceCents:priceCents!,
          category: category.trim() || "Geral",
          imageUrl: cleanImage,
          status,
        },
        { token }
      );

      committed=true;if(!valid())return;setSaved(true);
      await onCreated();if(valid())onClose();
    } catch (err: unknown) {
      if(valid())setServerError(committed?"Produto salvo. A lista não pôde ser atualizada; feche e atualize o catálogo, sem repetir o cadastro.":userFacingError(err, "Não foi possível confirmar o salvamento. Confira o catálogo antes de repetir; seus dados foram preservados."));
    } finally {
      if(valid()){busy.current=null;setIsSubmitting(false);}
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={requestClose}
      title={isEditing ? "Editar Produto" : "Cadastrar Novo Produto"}
      description={isEditing ? "Atualize preço, categoria, imagem e disponibilidade do item." : "Cadastre itens para geração de propostas comerciais e links Pix no Cockpit."}
    >
      {discardGuard.isPending&&<UnsavedChangesNotice onKeep={discardGuard.keepEditing} onDiscard={discardGuard.discard} disabled={Boolean(busy.current)}/>}
      <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {saved&&<p role="status">Produto salvo.</p>}
        {isEditing&&!effectiveChange&&!saved&&<p role="status">Não há alterações para salvar.</p>}
        {Object.keys(formErrors).length>0&&<div ref={errorSummaryRef} tabIndex={-1} role="alert">Revise os campos indicados antes de salvar. {Object.keys(formErrors).length} {Object.keys(formErrors).length===1?"campo precisa":"campos precisam"} de correção.</div>}
        {serverError && (
          <div
            ref={serverErrorRef}
            tabIndex={-1}
            role="alert"
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {serverError}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
          <Input
            label="Código SKU (Identificador Único)"
            placeholder="ex: MENSAL-VIP"
            value={retailerId}
            onChange={(e) => setRetailerId(e.target.value.toUpperCase())}
            disabled={isEditing||locked}
            error={formErrors.retailerId}
            helperText={isEditing ? "O SKU não pode ser alterado após o cadastro" : "Alfanumérico com hífen"}
          />

          <Input
            disabled={locked}
            label="Categoria"
            placeholder="ex: Assinaturas, Cursos"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={formErrors.category}
          />
        </div>

        <Input
          ref={resumeFieldRef}
          disabled={locked}
          label="Título do Produto"
          placeholder="ex: Acesso Anual Plataforma SOS"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={formErrors.title}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
            Descrição
          </label>
          <textarea
            disabled={locked}
            aria-label="Descrição do produto"
            aria-invalid={Boolean(formErrors.description)}
            aria-describedby={formErrors.description?descriptionErrorId:undefined}
            rows={3}
            placeholder="Descreva o escopo e benefícios do produto..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: formErrors.description ? "1px solid var(--color-danger)" : "1px solid var(--border-default)",
              fontSize: "var(--font-size-sm)",
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          {formErrors.description && (
            <span id={descriptionErrorId} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger)" }}>
              {formErrors.description}
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
          <Input
            disabled={locked}
            label={product?.currency&&product.currency!=="BRL"?`Preço (${product.currency})`:"Preço em Reais (BRL)"}
            inputMode="decimal"
            helperText={product&&!isValidProductPrice(product.priceCents)?"O preço recebido é inválido ou está ausente. Informe o valor correto antes de salvar; use zero apenas se o item for gratuito.":"Use vírgula para centavos. Ex.: 1.500,00"}
            placeholder="0,00"
            value={priceReal}
            onChange={(e) => setPriceReal(e.target.value)}
            error={formErrors.priceCents}
          />

          <div role="group" aria-label="Estado de disponibilidade do produto" tabIndex={-1} aria-invalid={Boolean(formErrors.status)} aria-describedby={formErrors.status?statusErrorId:undefined} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
              Status
            </label>
            {isMobile?<select aria-label="Disponibilidade do produto" disabled={locked} value={status} onChange={e=>setStatus(e.target.value as typeof status)} style={{width:"100%",minHeight:40,padding:"8px 12px",border:"1px solid var(--border-default)",borderRadius:8,background:"var(--bg-surface)",color:"var(--text-primary)",font:"inherit"}}>{!isKnownProductStatus(status)&&<option value={status} disabled>Status não reconhecido</option>}<option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="OUT_OF_STOCK">Sem estoque</option></select>:(
            <SegmentedControl aria-label="Disponibilidade do produto"
              value={status}
              onChange={(val) => {if(!busy.current&&!locked)setStatus(val as "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK");}}
              options={[
                { value: "ACTIVE", label: "Ativo", disabled:locked },
                { value: "INACTIVE", label: "Inativo", disabled:locked },
                { value: "OUT_OF_STOCK", label: "Sem estoque", disabled:locked },
              ]}
            />
            )}
            {!isKnownProductStatus(status)&&<p role="status">O status atual não foi reconhecido. Escolha Ativo, Inativo ou Sem estoque para corrigi-lo.</p>}
            {formErrors.status&&<p id={statusErrorId} role="alert">{formErrors.status}</p>}
          </div>
        </div>

        <div style={{display:'grid',gap:6}}>
          <label htmlFor="product-stock-policy">Disponibilidade antes da cobrança automática</label>
          <select id="product-stock-policy" aria-describedby="product-stock-help" value={stockPolicy} disabled={locked||!canManageAvailability} onChange={event=>setStockPolicy(event.target.value as typeof stockPolicy)} style={{width:'100%',minHeight:40,padding:8,border:'1px solid var(--border-default)',borderRadius:8,background:'var(--bg-surface)',color:'var(--text-primary)'}}>
            <option value="review_required">Confirmar com a equipe antes de cobrar</option>
            <option value="not_required">Este item não depende de estoque nem de vaga</option>
          </select>
          <p id="product-stock-help" style={{margin:0,fontSize:'var(--font-size-xs)',color:'var(--text-secondary)'}}>Ativo no catálogo não comprova disponibilidade. Use a segunda opção somente para itens que possam ser cobrados sem reserva, como um serviço digital sem limite de vagas. Produtos físicos e serviços com agenda exigem confirmação da equipe até a integração de disponibilidade ser validada.</p>
          {!canManageAvailability&&<p>Somente proprietário ou administrador pode alterar esta regra.</p>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
            Imagem do Produto
          </label>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            {imageUrl&&!imageFailed && (
              <img
                key={imageUrl}
                src={imageUrl}
                alt="Prévia da imagem do produto"
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "var(--radius-md, 8px)",
                  objectFit: "cover",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "var(--bg-canvas)",
                  flexShrink: 0,
                }}
                onError={() => setImageFailed(true)}
              />
            )}
            <div style={{ flex: 1,minWidth:0, display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center",flexWrap:"wrap" }}>
                <div style={{ flex:"1 1 160px",minWidth:0 }}>
                  <Input
                    disabled={locked}
                    aria-label="URL da imagem do produto"
                    placeholder="https://... ou faça upload do computador"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    error={formErrors.imageUrl}
                  />
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  prefixIcon={<Upload size={14} />}
                  onClick={() => fileInputRef.current?.click()}
                  loading={isUploadingImage}
                  disabled={locked}
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {isUploadingImage ? "Enviando..." : "Upload do PC"}
                </Button>
              </div>
            </div>
          </div>
          {imageFailed&&<p role="status">Não foi possível exibir a prévia. Confira a URL antes de salvar.</p>}
          <p style={{fontSize:12,color:"var(--text-secondary)"}}>JPEG, PNG ou WebP até 5 MB. A imagem do catálogo fica acessível por URL.</p>
        </div>

        <div style={{ display: "flex",flexWrap:"wrap", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
          <Button type="button" size="sm" variant="secondary" onClick={requestClose} disabled={isSubmitting || isUploadingImage || discardGuard.isPending}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" type="submit" loading={isSubmitting} disabled={locked||(isEditing&&!effectiveChange)}>
            {isEditing ? "Salvar Alterações" : "Salvar Produto"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
