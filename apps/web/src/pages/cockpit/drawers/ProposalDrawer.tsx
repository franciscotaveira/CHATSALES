import {UnsavedChangesNotice,useDiscardChanges} from "../../UnsavedChangesNotice";
import { type FC, useState, useEffect, useRef } from "react";
import { Drawer, Button, Input } from "@sos-sales/ui";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { apiClient, type CommercialThreadSummary } from "../../../services/api-client";

import {userFacingError} from "../../../utils/user-facing-error";
export function parseProposalPrice(value:string):number|null{
 const raw=value.trim();if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw))return null;
 const [whole,decimals=""]=raw.replace(/\./g,"").split(",");const cents=Number(whole)*100+Number(decimals.padEnd(2,"0"));return Number.isSafeInteger(cents)&&cents<=2147483647?cents:null;
}
export function proposalValidityEndOfDay(value:string):string|null|undefined{
 if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;
 const [year,month,day]=value.split("-").map(Number);const date=new Date(year!,month!-1,day!,23,59,59,999);
 if(date.getFullYear()!==year||date.getMonth()!==month!-1||date.getDate()!==day||date.getTime()<=Date.now())return undefined;return date.toISOString();
}
interface ProposalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  thread: CommercialThreadSummary | null;
  workspaceId?: string;
  token?: string;
  onProposalCreated?: () => void|Promise<void>;
}

interface ProposalItemInput {
  title: string;
  price: string;
  quantity: string;
}

export const ProposalDrawer: FC<ProposalDrawerProps> = ({
  isOpen,
  onClose,
  thread,
  workspaceId,
  token,
  onProposalCreated,
}) => {
  const [title, setTitle] = useState("Proposta Comercial");
  const [conditions,setConditions]=useState("");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<ProposalItemInput[]>([
    { title: "", price: "", quantity: "1" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved,setSaved]=useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope=useRef("");scope.current=`${workspaceId}:${token}:${thread?.id}:${isOpen}`;
  const generation=useRef(0),busy=useRef(false),keys=useRef(new Map<string,string>());
  useEffect(()=>{generation.current++;busy.current=false;setIsSubmitting(false);setSaved(false);setError(null);setTitle("Proposta Comercial");setConditions("");setValidUntil("");setItems([{title:"",price:"",quantity:"1"}]);return()=>{generation.current++;};},[isOpen,workspaceId,token,thread?.id]);
  const handleAddItem = () => {
    setItems((prev) => [...prev, { title: "", price: "", quantity: "1" }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ProposalItemInput, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const titleRef=useRef<HTMLInputElement>(null);
  const draftChanged=title.trim()!=="Proposta Comercial"||Boolean(conditions.trim()||validUntil)||items.length!==1||items.some(item=>Boolean(item.title.trim()||item.price.trim())||item.quantity!=="1");
  const discard=useDiscardChanges(isOpen&&!saved&&draftChanged,scope.current,()=>titleRef.current,isOpen);
  const requestClose=()=>{if(!busy.current&&!isSubmitting)discard.requestExit(onClose);};
  const normalizedItems=items.map(item=>({title:item.title.trim(),unitPriceCents:parseProposalPrice(item.price),quantity:/^\d+$/.test(item.quantity)?Number(item.quantity):0}));
  const validItems=normalizedItems.length>0&&normalizedItems.every(item=>item.title.length>0&&item.title.length<=200&&item.unitPriceCents!==null&&Number.isSafeInteger(item.quantity)&&item.quantity>0);
  const totalCents=validItems?normalizedItems.reduce((total,item)=>total+item.unitPriceCents!*item.quantity,0):null;
  const validTotal=totalCents!==null&&Number.isSafeInteger(totalCents)&&totalCents<=2147483647;
  const validity=proposalValidityEndOfDay(validUntil);
  const canSubmit=Boolean(thread&&workspaceId&&token&&title.trim()&&title.trim().length<=200&&conditions.trim().length<=1000&&validItems&&validTotal&&validity!==undefined&&!isSubmitting&&!saved&&!discard.isPending);
  const handleSubmit=async()=>{
    if(!canSubmit||busy.current||!thread||!workspaceId||!token)return;
    const requestedScope=scope.current,request=generation.current;const valid=()=>requestedScope===scope.current&&request===generation.current;
    const payload={contactId:thread.contactId,title:title.trim(),conditions:conditions.trim()||null,currency:"BRL" as const,validUntil:validity!,items:normalizedItems.map(item=>({...item,unitPriceCents:item.unitPriceCents!}))};
    const fingerprint=JSON.stringify([requestedScope,payload]);const requestKey=keys.current.get(fingerprint)||crypto.randomUUID();keys.current.set(fingerprint,requestKey);
    busy.current=true;setIsSubmitting(true);setError(null);
    let committed=false;
    try{await apiClient.createThreadProposal(workspaceId,thread.id,{...payload,requestKey},{token});committed=true;keys.current.delete(fingerprint);if(valid()){setSaved(true);await onProposalCreated?.();if(valid())onClose();}}
    catch(error){if(valid())setError(committed?"Proposta criada. Não foi possível atualizar a lista; feche e consulte as propostas novamente, sem repetir a criação.":userFacingError(error,"Não foi possível confirmar a criação. Confira a lista; repetir os mesmos dados reutiliza a solicitação."));}
    finally{if(valid()){busy.current=false;setIsSubmitting(false);}}
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={requestClose}
      title="Nova Proposta Comercial"
      description="Salve um rascunho para esta conversa. Criar a proposta não a envia ao cliente."
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", width: "100%",flexWrap:"wrap" }}>
          <Button size="sm" variant="secondary" disabled={isSubmitting||discard.isPending} onClick={requestClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isSubmitting?"Criando proposta...":"Criar Proposta"}
          </Button>
        </div>
      }
    >
      {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard}/>}
      <fieldset disabled={isSubmitting||saved||discard.isPending} style={{border:0,margin:0,padding:0,minWidth:0,display: "flex", flexDirection: "column", gap: "16px" }}>
        {saved&&<p role="status">Proposta criada.</p>}
        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {thread&&<p style={{margin:0,overflowWrap:"anywhere"}}>Conversa: {thread.contactName||"Contato"} · {thread.contactPhone}</p>}
        <Input ref={titleRef}
          label="Título da Proposta"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Consultoria de Vendas + Licença"
        />

        <Input
          label="Validade até o fim do dia (opcional)"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
              Itens da Proposta
            </span>
            <Button size="xs" variant="secondary" prefixIcon={<Plus size={12} />} onClick={handleAddItem}>
              Adicionar Item
            </Button>
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "8px",
                alignItems: "end",
                padding: "8px",
                backgroundColor: "var(--bg-canvas)",
                borderRadius: "var(--radius-md, 8px)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div style={{gridColumn:"1 / -1",minWidth:0}}><Input
                label={`Item ${idx+1}`}
                value={item.title}
                onChange={(e) => handleItemChange(idx, "title", e.target.value)}
                placeholder="Descrição"
              /></div>
              <Input
                label={`Preço do item ${idx+1} (R$)`}
                inputMode="decimal"
                value={item.price}
                onChange={(e) => handleItemChange(idx, "price", e.target.value)}
                placeholder="0,00"
              />
              <Input
                label={`Quantidade do item ${idx+1}`}
                type="number"
                min={1}
                value={String(item.quantity)}
                onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
              />
              {items.length > 1 && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleRemoveItem(idx)}
                  style={{
                    height: "32px",
                    width: "32px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-danger)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label={`Remover item ${idx+1}`}
                  title="Remover Item"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>

        <label style={{display:"grid",gap:6}}>Condições comerciais (opcional)
          <textarea aria-label="Condições comerciais (opcional)" maxLength={1000} rows={4} value={conditions} onChange={event=>setConditions(event.target.value)} placeholder="Ex.: forma de pagamento, prazo e o que está incluído." style={{boxSizing:"border-box",width:"100%",minWidth:0,resize:"vertical",font:"inherit",padding:8,border:"1px solid var(--border-default)",borderRadius:6}}/>
          <small>{conditions.length}/1000 caracteres. Estas condições serão salvas na proposta.</small>
        </label>
        {!thread&&<p>Selecione uma conversa para criar a proposta.</p>}
        {!validItems&&<p>Informe a descrição, o preço em reais e uma quantidade inteira maior que zero para cada item.</p>}
        {validity===undefined&&<p role="alert">Escolha uma data de validade atual ou futura. A proposta valerá até o fim desse dia no horário deste dispositivo.</p>}
        {validItems&&!validTotal&&<p role="alert">O valor total excede o limite aceito. Revise preços e quantidades.</p>}
        {/* Total Summary */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px",
            backgroundColor: "var(--color-action-subtle)",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid rgba(0, 128, 105, 0.2)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
            Valor Total da Proposta:
          </span>
          <span
            style={{
              fontSize: "var(--font-size-lg, 1.125rem)",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "var(--color-action)",
            }}
          >
            {validTotal?(totalCents! / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }):"Preencha os itens"}
          </span>
        </div>
      </fieldset>
    </Drawer>
  );
};
