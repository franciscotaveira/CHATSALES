import {productMatchesSearch} from './product-status';
import { useState, useEffect, useCallback, useRef, type FC } from "react";
import {
  PageHeader,
  Button,
  Input,
  EmptyState,
  LoadingState,
  SegmentedControl,
  useBreakpoint,
} from "@sos-sales/ui";
import { Plus, Package, Search } from "lucide-react";
import { apiClient, type ProductRecord } from "../../services/api-client";
import type { UseSessionReturn } from "../../hooks/useSession";
import { CreateProductDialog } from "./CreateProductDialog";
import { ProductsTable } from "./ProductsTable";
import { userFacingError } from "../../utils/user-facing-error";

interface ProductsPageProps {
  createRequest?: number;
  createRequestScope?: string;
  session: UseSessionReturn;
}
function readProducts(value:unknown):ProductRecord[]{
 if(!Array.isArray(value))throw new Error("A consulta não confirmou uma lista válida de produtos. Tente consultar novamente.");
 const ids=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.id!=="string"||!row.id.trim()||ids.has(row.id)||["title","retailerId","category","status"].some(key=>typeof row[key]!=="string")||["description","imageUrl","subtitle","badge"].some(key=>row[key]!=null&&typeof row[key]!=="string"))throw new Error("A consulta retornou produtos incompletos ou com identificadores repetidos. Consulte novamente; o catálogo anterior foi preservado.");
  ids.add(row.id);
 }
 return value as ProductRecord[];
}

export const ProductsPage:FC<ProductsPageProps> = props => <ProductCatalog key={JSON.stringify([props.session.activeWorkspace?.id,props.session.token,props.session.activeWorkspace?.role])} {...props}/>;
const ProductCatalog: FC<ProductsPageProps> = ({ session,createRequest=0,createRequestScope }) => {
  const { isMobile } = useBreakpoint();
  const workspaceId = session.activeWorkspace?.id;
  const token = session.token;
  const sessionLoading=Boolean(session.isLoadingMe||session.isLoadingWorkspace);

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded,setHasLoaded]=useState(false);
  const [lastCheckedAt,setLastCheckedAt]=useState<string|null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const scope = useRef("");scope.current=`${workspaceId ?? ""}:${token ?? ""}:${sessionLoading}`;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);

  const fetchProducts = useCallback(async (propagateError=false) => {
    if (sessionLoading || !workspaceId || !token) {setIsLoading(false);return;}
    const sequence=++requestSequence.current, requestedScope=scope.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.getProducts(workspaceId, {}, { token });
      if(sequence===requestSequence.current&&requestedScope===scope.current){const rows=readProducts(res?.products);setProducts(rows);setHasLoaded(true);setLastCheckedAt(new Date().toISOString());}
    } catch (err) {
      if(sequence===requestSequence.current&&requestedScope===scope.current){setError(userFacingError(err,"Não foi possível carregar o catálogo."));if(propagateError)throw err;}
    } finally {
      if(sequence===requestSequence.current&&requestedScope===scope.current)setIsLoading(false);
    }
  }, [workspaceId, token, sessionLoading]);

  useEffect(() => {
    setProducts([]);setHasLoaded(false);setLastCheckedAt(null);setEditingProduct(null);setIsCreateOpen(false);setError(null);
    void fetchProducts();
    return()=>{requestSequence.current++;};
  }, [fetchProducts]);
  useEffect(()=>{if(sessionLoading)return;if(createRequest===0){setIsCreateOpen(false);return;}if(createRequestScope!==undefined&&createRequestScope!==`${workspaceId}:${token}:${session.activeWorkspace?.role}`)return;if(createRequest>0)setIsCreateOpen(true);},[createRequest,createRequestScope,workspaceId,token,session.activeWorkspace?.role,sessionLoading]);

  const countLabel=(label:string,count:number)=>!workspaceId||!token?label:hasLoaded?`${label} (${count})`:`${label} (${isLoading?"consultando…":"consulta pendente"})`;

  const filteredProducts = products.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    return productMatchesSearch(p,search);
  });

  if(sessionLoading)return <div><p role="status">Conferindo acesso ao catálogo…</p><LoadingState variant="skeleton" lines={4}/></div>;
  if(!workspaceId||!token)return <EmptyState title={!workspaceId?"Selecione uma empresa":"Acesso não confirmado"} description={!workspaceId?"Escolha uma empresa para consultar e editar o catálogo.":"Entre novamente para consultar o catálogo desta empresa."}/>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: "var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "1080px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <PageHeader
          title="Produtos & Catálogo"
          description="Catálogo de produtos e serviços para geração ágil de cobranças Pix e propostas comerciais no Cockpit."
          actions={
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Button size="sm" variant="secondary" disabled={!workspaceId||!token||isLoading||session.isLoadingMe||session.isLoadingWorkspace} onClick={()=>void fetchProducts()}>Atualizar catálogo</Button>
            <Button
              size="sm"
              variant="primary"
              prefixIcon={<Plus size={14} />}
              disabled={!workspaceId||!token||session.isLoadingMe||session.isLoadingWorkspace}
              onClick={() => {
                setEditingProduct(null);
                setIsCreateOpen(true);
              }}
            >
              Novo Produto
            </Button>
            </div>
          }
        />

        {hasLoaded&&isLoading&&<p role="status">Atualizando catálogo… Os produtos e contagens exibidos são da última consulta concluída.</p>}
        {hasLoaded&&error&&<p role="status">Não foi possível atualizar o catálogo. Os produtos e contagens exibidos podem estar desatualizados.</p>}
        {lastCheckedAt&&<p style={{fontSize:12,color:"var(--text-secondary)",margin:0}}>Última consulta concluída: <time dateTime={lastCheckedAt}>{new Date(lastCheckedAt).toLocaleString("pt-BR")}</time>.</p>}
        {/* Search & Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ maxWidth: "340px", width: "100%" }}>
            <Input
              aria-label="Buscar produtos por título, SKU ou categoria"
              placeholder="Buscar por título, SKU ou categoria..."
              prefixIcon={<Search size={16} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isMobile ? <label style={{display:"flex",flexDirection:"column",gap:6,width:"100%",fontSize:13}}>Status dos produtos
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{width:"100%",minHeight:40,padding:"8px 12px",border:"1px solid var(--border-default)",borderRadius:8,background:"var(--bg-surface)",color:"var(--text-primary)",font:"inherit"}}>
              <option value="ALL">{countLabel("Todos",products.length)}</option>
              <option value="ACTIVE">{countLabel("Ativos",products.filter(p=>p.status==="ACTIVE").length)}</option>
              <option value="INACTIVE">{countLabel("Inativos",products.filter(p=>p.status==="INACTIVE").length)}</option>
              <option value="OUT_OF_STOCK">{countLabel("Sem estoque",products.filter(p=>p.status==="OUT_OF_STOCK").length)}</option>
            </select>
          </label> : <SegmentedControl
            aria-label="Status dos produtos"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "ALL", label: countLabel("Todos",products.length) },
              { value: "ACTIVE", label: countLabel("Ativos",products.filter(p=>p.status==="ACTIVE").length) },
              { value: "INACTIVE", label: countLabel("Inativos",products.filter(p=>p.status==="INACTIVE").length) },
              { value: "OUT_OF_STOCK", label: countLabel("Sem estoque",products.filter(p=>p.status==="OUT_OF_STOCK").length) },
            ]}
          />}
        </div>

        {/* Content Section */}
        {error && <div role="alert">{error} <Button size="sm" onClick={()=>void fetchProducts()} disabled={isLoading}>Tentar novamente</Button></div>}
        {(session.isLoadingMe||session.isLoadingWorkspace||isLoading) && products.length === 0 ? (
          <div style={{ padding: "32px 0" }}>
            <LoadingState variant="skeleton" lines={4} text="Carregando catálogo de produtos..." />
          </div>
        ) : !workspaceId||!token ? <EmptyState title="Selecione uma empresa" description="Escolha uma empresa no menu superior para consultar e editar seu catálogo."/> : error && products.length === 0 ? null : filteredProducts.length === 0 ? (
          <EmptyState
            icon={<Package size={48} />}
            title={products.length ? "Nenhum produto neste filtro" : "Nenhum produto cadastrado"}
            description={products.length ? "Altere a busca ou o status para ver outros itens do catálogo." : "Cadastre produtos com SKU e preço para integrá-los às cobranças Pix do Cockpit."}
            action={products.length ? <Button size="sm" onClick={()=>{setSearch("");setStatusFilter("ALL");}}>Limpar filtros</Button> :
              <Button
                variant="primary"
                size="sm"
                prefixIcon={<Plus size={14} />}
                onClick={() => {
                  setEditingProduct(null);
                  setIsCreateOpen(true);
                }}
              >
                Cadastrar Primeiro Produto
              </Button>
            }
          />
        ) : (
          <ProductsTable
            products={filteredProducts}
            onEdit={(product) => {
              setEditingProduct(product);
              setIsCreateOpen(true);
            }}
          />
        )}
      </div>

      {workspaceId && token && (
        <CreateProductDialog
          canManageAvailability={["owner","admin"].includes(session.activeWorkspace?.role??"")}
          isOpen={isCreateOpen}
          onClose={() => {
            setIsCreateOpen(false);
            setEditingProduct(null);
          }}
          workspaceId={workspaceId}
          token={token}
          onCreated={()=>fetchProducts(true)}
          product={editingProduct}
        />
      )}
    </div>
  );
};
