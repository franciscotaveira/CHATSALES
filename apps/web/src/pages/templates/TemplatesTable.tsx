import type {FC} from "react";
import {Badge,Button,useBreakpoint} from "@sos-sales/ui";
import type {MessageTemplateSummary} from "../../services/api-client";
import {templateStatus,templateCategory} from "./template-presentation";
interface Props{templates:MessageTemplateSummary[];onSelectPreview:(template:MessageTemplateSummary)=>void;onSelectBroadcast?:(template:MessageTemplateSummary)=>void;}
export const TemplatesTable:FC<Props>=({templates,onSelectPreview,onSelectBroadcast})=>{
 const {isMobile}=useBreakpoint();
 const status=(t:MessageTemplateSummary)=>{const state=templateStatus(t);return <Badge variant={state.variant}>{state.label}</Badge>;};
 const actions=(t:MessageTemplateSummary)=><div style={{display:"flex",flexWrap:"wrap",gap:8}}><Button size="sm" variant="secondary" onClick={()=>onSelectPreview(t)} aria-label={`Visualizar ${t.name}`}>Visualizar</Button>{onSelectBroadcast&&<Button size="sm" onClick={()=>onSelectBroadcast(t)} aria-label={`Preparar campanha com ${t.name}`}>Preparar campanha</Button>}</div>;
 if(isMobile)return <div style={{display:"grid",gap:12}}>{templates.map(t=><article key={t.id} style={{display:"grid",gap:12,padding:16,border:"1px solid var(--border-default)",borderRadius:12,background:"var(--bg-surface)",overflowWrap:"anywhere"}}><strong>{t.name}</strong><p style={{fontSize:12,color:"var(--text-secondary)"}}>{templateCategory(t.category)} · {t.language}</p><div>{status(t)}</div>{actions(t)}</article>)}</div>;
 return <div role="region" aria-label="Tabela de modelos" tabIndex={0} style={{overflowX:"auto",border:"1px solid var(--border-default)",borderRadius:12,background:"var(--bg-surface)"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:14}}><thead><tr>{["Nome do modelo","Categoria","Idioma","Estado","Ações"].map(title=><th scope="col" key={title} style={{padding:12,fontSize:12,color:"var(--text-secondary)"}}>{title}</th>)}</tr></thead><tbody>{templates.map(t=><tr key={t.id} style={{borderTop:"1px solid var(--border-default)"}}><td style={{padding:12,overflowWrap:"anywhere"}}><strong>{t.name}</strong></td><td style={{padding:12}}>{templateCategory(t.category)}</td><td style={{padding:12}}>{t.language}</td><td style={{padding:12}}>{status(t)}</td><td style={{padding:12}}>{actions(t)}</td></tr>)}</tbody></table></div>;
};
