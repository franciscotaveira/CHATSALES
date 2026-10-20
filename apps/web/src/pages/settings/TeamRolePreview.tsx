import { hasWorkspacePermission, type Permission } from "@sos-sales/contracts";

const capabilities: ReadonlyArray<{permission:Permission;label:string}> = [
  {permission:"workspace:view",label:"Consultar configurações e equipe"},
  {permission:"workspace:manage",label:"Gerenciar configurações da empresa e acessos"},
  {permission:"workspace:invite",label:"Adicionar integrantes à empresa"},
  {permission:"cockpit:access",label:"Acessar atendimentos"},
  {permission:"cockpit:send_message",label:"Enviar mensagens de atendimento"},
  {permission:"cockpit:handoff",label:"Transferir atendimentos"},
  {permission:"journey:view",label:"Consultar oportunidades"},
  {permission:"journey:transition_stage",label:"Alterar etapas de oportunidades"},
  {permission:"outcome:register",label:"Registrar ganho ou perda"},
  {permission:"integration:view",label:"Consultar integrações"},
  {permission:"integration:manage",label:"Gerenciar integrações"},
  {permission:"integration:candidates:read",label:"Consultar candidatos de integração"},
  {permission:"integration:suggestions:create",label:"Criar sugestões de integração"},
  {permission:"integration:suggestions:manage",label:"Revisar sugestões de integração"},
  {permission:"capi:dispatch",label:"Despachar conversões"},
  {permission:"audit:view",label:"Consultar auditoria"},
];

export function TeamRolePreview({role,previousRole}:{role:string;previousRole?:string}) {
  const allowed=capabilities.filter(item=>hasWorkspacePermission(role,item.permission));
  const gained=previousRole?allowed.filter(item=>!hasWorkspacePermission(previousRole,item.permission)):[];
  const removed=previousRole?capabilities.filter(item=>hasWorkspacePermission(previousRole,item.permission)&&!hasWorkspacePermission(role,item.permission)):[];
  const list=(items:typeof allowed)=><ul style={{paddingLeft:20,margin:"6px 0"}}>{items.map(item=><li key={item.permission}>{item.label}</li>)}</ul>;
  return <section aria-label="Permissões do perfil selecionado" style={{padding:12,border:"1px solid var(--border-default)",borderRadius:8,fontSize:13,overflowWrap:"anywhere"}}>
    <p style={{marginTop:0}}>O perfil se aplica somente a esta empresa.</p>
    {previousRole&&<div aria-live="polite">
      {gained.length>0&&<div><strong>Será liberado ao salvar:</strong>{list(gained)}</div>}
      {removed.length>0&&<div><strong>Será retirado ao salvar:</strong>{list(removed)}</div>}
      {!gained.length&&!removed.length&&<p>Nenhuma mudança de permissões entre o perfil atual e o selecionado.</p>}
    </div>}
    <details><summary>Ver permissões do perfil selecionado ({allowed.length})</summary>{allowed.length?list(allowed):<p>Nenhuma permissão reconhecida para este perfil.</p>}</details>
  </section>;
}
