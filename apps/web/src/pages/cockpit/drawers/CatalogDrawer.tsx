import {UnsavedChangesNotice,useDiscardChanges} from "../../UnsavedChangesNotice";
import { type FC, useState, useEffect, useMemo, useRef } from "react";
import { Drawer, Button, Input } from "@sos-sales/ui";
import { Send, Layers, Search, Package } from "lucide-react";
import { userFacingError } from "../../../utils/user-facing-error";
import { apiClient, type ProductRecord, type CommercialThreadSummary } from "../../../services/api-client";

import {buildProductOfferMessage} from "../../products/product-offer-message";
import {productPriceLabel} from "../../products/product-price";
import {productOfferIssue} from "../../products/product-offer";
import {productMatchesSearch,productStatusLabel} from "../../products/product-status";

interface CatalogDrawerProps {
  sendBlockedReason?:string;
  onRefreshChannel?:()=>void;
  isCheckingChannel?:boolean;
  isOpen: boolean;
  onClose: () => void;
  thread?: CommercialThreadSummary | null;
  workspaceId?: string;
  token?: string;
  onSendProduct?: (product: ProductRecord, idempotencyKey?:string) => void | Promise<void>;
  onSendProducts?: (products: ProductRecord[], idempotencyKey?:string) => void | Promise<void>;
}

const readCatalogProducts=(value:unknown):ProductRecord[]=>{
 const invalid=()=>new Error("A consulta não confirmou uma lista válida de produtos. Consulte o catálogo novamente antes de preparar o envio.");
 if(!value||typeof value!=="object"||!Array.isArray((value as {products?:unknown}).products))throw invalid();
 const products=(value as {products:unknown[]}).products,seen=new Set<string>();
 for(const product of products){
  if(!product||typeof product!=="object"||Array.isArray(product))throw invalid();
  const row=product as Record<string,unknown>;
  if(typeof row.id!=="string"||!row.id.trim()||seen.has(row.id)||typeof row.title!=="string"||[row.description,row.imageUrl].some(field=>field!=null&&typeof field!=="string"))throw invalid();
  seen.add(row.id);
 }
 return products as ProductRecord[];
};

export const CatalogDrawer: FC<CatalogDrawerProps> = ({
  sendBlockedReason,onRefreshChannel,isCheckingChannel,
  isOpen,
  onClose,
  thread,
  workspaceId,
  token,
  onSendProduct,
  onSendProducts,
}) => {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [error,setError]=useState("");
  const [reload,setReload]=useState(0);
  const [sending,setSending]=useState(false);
  const [review,setReview]=useState<ProductRecord[]|null>(null),[queued,setQueued]=useState(false);
  const sendingRef=useRef(false);
  const generation=useRef(0);
  const keys=useRef(new Map<string,string>());
  const scope=useRef("");scope.current=`${workspaceId}:${token}:${thread?.id}:${thread?.channelInstanceId}:${thread?.channelProvider}:${thread?.contactPhone}:${isOpen}`;
  useEffect(() => {
    let cancelled=false;generation.current++;sendingRef.current=false;setSending(false);setReview(null);setQueued(false);
    setProducts([]);setError("");setSelectedIds(new Set());setSearchTerm("");setLoading(false);
    if (!isOpen || !workspaceId || !token) return;
    setLoading(true);
    apiClient.getProducts(workspaceId, {}, { token })
      .then(res=>{if(!cancelled)setProducts(readCatalogProducts(res));})
      .catch(error=>{if(!cancelled)setError(userFacingError(error,"Não foi possível carregar o catálogo."));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;generation.current++;};
  }, [isOpen, workspaceId, token,thread?.id,thread?.channelInstanceId,thread?.channelProvider,thread?.contactPhone,reload]);

  const searchRef=useRef<HTMLInputElement>(null),reviewRef=useRef<HTMLElement>(null),queuedRef=useRef<HTMLParagraphElement>(null),hadReview=useRef(false);
  useEffect(()=>{if(review){hadReview.current=true;reviewRef.current?.focus();}else if(hadReview.current){hadReview.current=false;if(queued)queuedRef.current?.focus();else searchRef.current?.focus();}},[review,queued]);
  const sendBlock=useRef(sendBlockedReason);sendBlock.current=sendBlockedReason;
  const discard=useDiscardChanges(isOpen&&!queued&&(selectedIds.size>0||Boolean(review)),scope.current,()=>searchRef.current,isOpen);
  const requestClose=()=>{if(!sendingRef.current)discard.requestExit(onClose);};
  const filteredProducts = useMemo(() => {
    return products.filter(product=>productMatchesSearch(product,searchTerm));
  }, [products, searchTerm]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (products.some(product=>product.id===id&&!productOfferIssue(product))) {
        next.add(id);
      }
      return next;
    });
  };

  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.has(p.id));
  }, [products, selectedIds]);

  const prepareReview=(items:ProductRecord[])=>{
    if(sendingRef.current||discard.isPending||queued||!items.length||items.some(product=>productOfferIssue(product)))return;
    setReview(items);setError("");
  };
  let preview:ReturnType<typeof buildProductOfferMessage>|null=null,reviewIssue="";
  if(review){try{preview=buildProductOfferMessage(review,thread?.channelProvider);}catch(error){reviewIssue=userFacingError(error,"Revise os produtos antes de enviar.");}}
  const send=async(items:ProductRecord[])=>{
    if(!review||items!==review||queued||sendBlock.current||discard.isPending||sendingRef.current||!thread||!workspaceId||!token||!items.length)return;
    if(items.some(product=>productOfferIssue(product))){setError("Revise os produtos indisponíveis antes de preparar a oferta.");return;}
    const callback=items.length===1?onSendProduct:onSendProducts;
    if(!callback)return;
    const requestedScope=scope.current,request=generation.current;
    const valid=()=>requestedScope===scope.current&&request===generation.current;
    const fingerprint=JSON.stringify([requestedScope,items]);
    const key=keys.current.get(fingerprint)||crypto.randomUUID();keys.current.set(fingerprint,key);
    sendingRef.current=true;setSending(true);setError("");
    try{
      const response=await apiClient.getProducts(workspaceId,{},{token});if(!valid())return;
      const fresh=readCatalogProducts(response);setProducts(fresh);
      const latest=items.map(item=>fresh.find(product=>product.id===item.id));
      if(latest.some(item=>!item)){setReview(null);setSelectedIds(current=>new Set([...current].filter(id=>fresh.some(product=>product.id===id))));throw new Error("Um produto não foi encontrado na consulta atual. Revise o catálogo antes de enviar.");}
      const signature=(product:ProductRecord)=>JSON.stringify([product.id,product.title,product.description,product.priceCents,product.currency,product.status,product.catalogId,product.retailerId,product.imageUrl]);
      if(latest.some((product,index)=>signature(product!)!==signature(items[index]!))){setReview(latest as ProductRecord[]);throw new Error("Os dados dos produtos mudaram. O catálogo foi atualizado; revise preço, situação e seleção antes de enviar novamente.");}
      const currentIssue=latest.map(product=>productOfferIssue(product!)).find(Boolean);if(currentIssue)throw new Error(currentIssue);
      if(sendBlock.current)throw new Error(sendBlock.current);
      if(items.length===1)await onSendProduct!(items[0]!,key);else await onSendProducts!(items,key);
      keys.current.delete(fingerprint);if(valid()){discard.keepEditing();setSelectedIds(new Set());setReview(null);setQueued(true);}
    }catch(error){if(valid())setError(userFacingError(error,"Não foi possível preparar o envio. Confira a conversa antes de tentar novamente."));}
    finally{if(valid()){sendingRef.current=false;setSending(false);}}
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={requestClose}
      title="Catálogo & Ofertas"
      description="Selecione produtos para compartilhar nesta conversa. O formato depende do canal e do catálogo vinculado. O status do cadastro não reserva nem confirma estoque externo."
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", flexWrap:"wrap", gap:8 }}>
          <Button size="sm" variant="secondary" disabled={sending||discard.isPending} onClick={requestClose}>
            Fechar
          </Button>

          {!review&&!queued&&selectedProducts.length > 0 && (
            <Button
              size="sm"
              variant="primary"
              prefixIcon={<Layers size={14} />}
              disabled={sending||discard.isPending||!thread}
              onClick={()=>prepareReview(selectedProducts)}
            >
              {sending?"Preparando envio...":`Revisar ${selectedProducts.length} ${selectedProducts.length>1?"produtos":"produto"}`}
            </Button>
          )}
        </div>
      }
    >
      {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard} disabled={sending}/>}
      <fieldset disabled={sending||queued||discard.isPending} style={{border:0,margin:0,padding:0,minWidth:0,display: "flex", flexDirection: "column", gap: "12px" }}>
        {sendBlockedReason&&<div role="status"><p>{sendBlockedReason}</p>{onRefreshChannel&&<Button size="sm" variant="secondary" disabled={sending||isCheckingChannel} onClick={onRefreshChannel}>Atualizar disponibilidade</Button>}</div>}
        {error&&<div role="alert"><p>{error}</p>{!products.length&&<Button size="sm" onClick={()=>setReload(value=>value+1)}>Tentar novamente</Button>}</div>}
        {!thread&&<p>Selecione uma conversa para enviar produtos.</p>}
        {queued&&<p ref={queuedRef} tabIndex={-1} role="status">Oferta colocada na fila. Acompanhe envio e entrega na conversa; entrar na fila não comprova recebimento pelo cliente.</p>}
        {review&&<section ref={reviewRef} tabIndex={-1} aria-label="Revisão da oferta" style={{border:"1px solid var(--border-default)",borderRadius:8,padding:12,display:"grid",gap:10,overflowWrap:"anywhere"}}>
          <strong>Revise antes de compartilhar</strong>
          <div>Destinatário: {thread?.contactName||"Contato da conversa"} · {thread?.contactPhone}</div>
          <div>{review.length} {review.length===1?"produto":"produtos"} nesta oferta</div>
          {review.map(product=><div key={product.id}><strong>{product.title}</strong> · {productPriceLabel(product.priceCents,product.currency)}{productOfferIssue(product)&&<p role="alert">{productOfferIssue(product)}</p>}</div>)}
          {preview&&<><div>Formato: {preview.formatLabel}</div>{preview.message.interactive?.header?.text&&<strong>{preview.message.interactive.header.text}</strong>}<p style={{whiteSpace:"pre-wrap",margin:0}}>{preview.message.interactive?.body?.text||preview.message.body}</p>{preview.message.interactive?.footer?.text&&<small>{preview.message.interactive.footer.text}</small>}{preview.message.mediaUrl&&<p>Mídia: {preview.message.mediaUrl}</p>}{preview.message.contentType==="interactive"&&<p>O catálogo e a apresentação interativa dependem da disponibilidade e dos dados na Meta.</p>}</>}
          {reviewIssue&&<p role="alert">{reviewIssue}</p>}
          <small>Compartilhar a oferta não reserva estoque, cria pedido nem confirma pagamento.</small>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}><Button size="sm" variant="secondary" disabled={sending} onClick={()=>{setReview(null);setError("");}}>Voltar à seleção</Button><Button size="sm" disabled={sending||Boolean(sendBlockedReason)||Boolean(reviewIssue)||!thread||(review.length===1?!onSendProduct:!onSendProducts)} onClick={()=>void send(review)}>{sending?"Preparando envio...":"Confirmar envio da oferta"}</Button></div>
        </section>}
        <fieldset disabled={Boolean(review)} style={{border:0,padding:0,margin:0,minWidth:0,display:review||queued?"none":"grid",gap:12}}>
        {/* Search */}
        <Input
          ref={searchRef}
          label="Buscar produtos"
          disabled={sending||loading}
          placeholder="Buscar por nome, categoria ou SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          prefixIcon={<Search size={14} color="var(--text-secondary)" />}
        />

        {selectedProducts.length > 0 && (
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))",
              border: "1px solid var(--color-primary, #10b981)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              color: "var(--text-primary)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              <strong>{selectedProducts.length}</strong> {selectedProducts.length > 1 ? "produtos selecionados" : "item selecionado"}
            </span>
            <button
              type="button"
              disabled={sending}
              onClick={() => setSelectedIds(new Set())}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "var(--font-size-xs, 0.75rem)",
                textDecoration: "underline",
              }}
            >
              Limpar seleção
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-secondary)" }}>
            Carregando catálogo...
          </div>
        ) : error&&!products.length ? null : filteredProducts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-secondary)" }}>
            {searchTerm ? "Nenhum produto encontrado com este termo." : "Nenhum produto cadastrado nesta empresa."}
          </div>
        ) : (
          filteredProducts.map((p) => {
            const formattedPrice = productPriceLabel(p.priceCents,p.currency);
            const issue=productOfferIssue(p);
            const isSelected = selectedIds.has(p.id);

            return (
              <div
                key={p.id}
                style={{
                  padding: "10px 12px",
                  backgroundColor: isSelected ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
                  border: isSelected ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md, 8px)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Selection checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(p.id)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--color-primary, #10b981)" }}
                  aria-label={`Selecionar ${p.title}`}
                  disabled={sending||Boolean(issue)}
                  title={issue||"Selecionar produto"}
                />

                {/* Product thumbnail */}
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.title}
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "6px",
                      objectFit: "cover",
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "6px",
                      backgroundColor: "var(--bg-surface-elevated, #f3f4f6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-secondary)",
                      flexShrink: 0,
                    }}
                  >
                    <Package size={20} />
                  </div>
                )}

                {/* Details */}
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div
                    style={{
                      fontSize: "var(--font-size-sm, 0.875rem)",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {p.title}
                  </div>
                  {p.description && (
                    <div
                      style={{
                        fontSize: "var(--font-size-xs, 0.75rem)",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginTop: "1px",
                      }}
                    >
                      {p.description}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "var(--font-size-xs, 0.75rem)",
                      color: "var(--color-action, #059669)",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      marginTop: "2px",
                    }}
                  >
                    {formattedPrice}
                  </div>
                  <small style={{display:"block",color:issue?"var(--text-secondary)":"var(--color-action)"}}>{productStatusLabel(p.status)}</small>
                  {issue&&<small style={{display:"block",color:"var(--text-secondary)"}}>{issue}</small>}
                </div>

                {/* Action button */}
                {onSendProduct && (
                  <Button
                    size="xs"
                    variant="primary"
                    prefixIcon={<Send size={12} />}
                    disabled={sending||discard.isPending||!thread||Boolean(issue)||Boolean(review)}
                    title={issue||"Preparar oferta"}
                    aria-label={`Revisar ${p.title}`}
                    onClick={() => prepareReview([p])}
                  >
                    Revisar oferta
                  </Button>
                )}
              </div>
            );
          })
        )}
        </fieldset>
      </fieldset>
    </Drawer>
  );
};
