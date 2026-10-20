import {productPriceLabel} from './product-price';
import {productStatusLabel,isKnownProductStatus} from './product-status';
import {useState,type FC} from "react";
import {Badge,useBreakpoint} from "@sos-sales/ui";
import {Package,Pencil} from "lucide-react";
import type {ProductRecord} from "../../services/api-client";
interface ProductsTableProps{products:ProductRecord[];onEdit:(product:ProductRecord)=>void;}
const statusBadge=(status:string)=><Badge variant={status==='ACTIVE'?'action':status==='OUT_OF_STOCK'||!isKnownProductStatus(status)?'warning':'neutral'}>{productStatusLabel(status)}</Badge>;
const Thumbnail:FC<{product:ProductRecord;size:number}>=({product,size})=>{
 const [failed,setFailed]=useState(false);
 const style={width:size,height:size,borderRadius:"var(--radius-md)",flexShrink:0,background:"var(--bg-canvas)"};
 return product.imageUrl&&!failed?<img src={product.imageUrl} alt="" loading="lazy" style={{...style,objectFit:"cover"}} onError={()=>setFailed(true)}/>:<span aria-label="Sem imagem disponível" style={{...style,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}}><Package size={20}/></span>;
};
export const ProductsTable:FC<ProductsTableProps>=({products,onEdit})=>{
 const {isMobile}=useBreakpoint();
 if(isMobile)return <div style={{display:"grid",gap:12}}>{products.map(p=><button type="button" key={p.id} aria-label={`Editar ${p.title}`} onClick={()=>onEdit(p)} style={{display:"flex",flexDirection:"column",gap:12,width:"100%",padding:16,border:"1px solid var(--border-default)",borderRadius:12,background:"var(--bg-surface)",color:"var(--text-primary)",font:"inherit",textAlign:"left",cursor:"pointer"}}>
   <span style={{display:"flex",gap:12,alignItems:"flex-start"}}><Thumbnail key={p.imageUrl} product={p} size={40}/><span style={{minWidth:0,overflowWrap:"anywhere"}}><strong style={{display:"block"}}>{p.title}</strong><span style={{display:"block",fontSize:12,color:"var(--text-secondary)"}}>{p.retailerId} · {p.category}</span></span></span>
   <span style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}><strong style={{fontVariantNumeric:"tabular-nums"}}>{productPriceLabel(p.priceCents,p.currency)}</strong>{statusBadge(p.status)}<span style={{display:"inline-flex",gap:4,alignItems:"center",fontSize:12,color:"var(--color-operational)"}}><Pencil size={14}/>Editar</span></span>
  </button>)}</div>;
 const cell={padding:"12px 16px",borderBottom:"1px solid var(--border-subtle)"};
 return <div role="region" aria-label="Tabela de produtos" tabIndex={0} style={{background:"var(--bg-surface)",border:"1px solid var(--border-default)",borderRadius:12,overflowX:"auto"}}>
  <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:14}}>
   <thead><tr style={{background:"var(--bg-canvas)"}}>{["Produto","SKU","Categoria","Preço","Status","Ações"].map(h=><th scope="col" key={h} style={{...cell,fontSize:12,color:"var(--text-secondary)"}}>{h}</th>)}</tr></thead>
   <tbody>{products.map(p=><tr key={p.id}>
    <td style={cell}><span style={{display:"flex",alignItems:"center",gap:12}}><Thumbnail key={p.imageUrl} product={p} size={32}/><strong style={{overflowWrap:"anywhere"}}>{p.title}</strong></span></td>
    <td style={{...cell,fontFamily:"var(--font-mono)",fontSize:12,overflowWrap:"anywhere"}}>{p.retailerId}</td><td style={cell}>{p.category}</td>
    <td style={{...cell,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{productPriceLabel(p.priceCents,p.currency)}</td><td style={cell}>{statusBadge(p.status)}</td>
    <td style={cell}><button type="button" aria-label={`Editar ${p.title}`} onClick={()=>onEdit(p)} style={{width:36,height:36,border:"1px solid var(--border-default)",borderRadius:6,background:"var(--bg-surface)",color:"var(--text-secondary)",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"}}><Pencil size={15}/></button></td>
   </tr>)}</tbody>
  </table>
 </div>;
};
