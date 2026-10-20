import type {AiAgentConfig} from '../../services/api-client';

/** Readable review deliberately omits credential values. */
export function AiConfigReview({config}:{config:AiAgentConfig}){
  const rules=config.businessRules??{};
  const facts=[['Empresa',rules.companyName],['Papel',rules.agentRole],['Proposta de valor',rules.valueProposition],['Segmento',rules.niche],['Horários',rules.openingHours],['Endereço',rules.address],['Cancelamento',rules.cancellationPolicy],['Pagamentos',rules.paymentMethods],['Regras adicionais',rules.generalRules]];
  const objections=[['Preço e desconto',rules.objections?.priceDiscount],['Cliente quer pensar',rules.objections?.thinkAboutIt],['Garantia e confiança',rules.objections?.guaranteeTrust],['Prazos',rules.objections?.deliveryTimeline]];
  const skills={qualify_lead:'Qualificar contatos',catalog_offers:'Apresentar catálogo',pix_charges:'Apoiar cobrança Pix',appointments:'Agendamento',capi_tracking:'Conversões Meta'};
  return <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',minWidth:0}}>
    <p><strong>Atendente:</strong> {config.name}</p>
    <p><strong>Automático:</strong> {config.enabled?'Sim':'Não'}</p>
    <p><strong>Provedor e modelo:</strong> {config.provider} • {config.model}</p>
    <p><strong>Credencial própria:</strong> {config.hasCustomApiKey?'Configurada; valor protegido':'Sem credencial própria'}</p>
    <p><strong>Modo estrito:</strong> {config.strictMode?'Selecionado':'Desmarcado'} • Temperatura: {config.temperature}</p>
    <p><strong>Instruções:</strong> {config.systemPrompt||'Sem instruções personalizadas'}</p>
    <p><strong>Validade do resumo para cobrança:</strong> {rules.checkoutValidityMinutes??15} minutos</p>
    <p><strong>Funções selecionadas:</strong> {Object.entries(skills).filter(([key])=>config.skills[key]).map(([,label])=>label).join(', ')||'Nenhuma'}</p>
    {facts.map(([label,value])=><p key={label}><strong>{label}:</strong> {value||'Não preenchido'}</p>)}
    {objections.filter(([,value])=>value).map(([label,value])=><p key={label}><strong>{label}:</strong> {value}</p>)}
    <p><strong>Pergunta de continuidade:</strong> {rules.ctaRule?'Selecionada':'Desmarcada'} • Emojis: {rules.emojiDensity==='expressive'?'Expressivos':rules.emojiDensity==='sober'?'Sóbrio':'Moderados'}</p>
    {config.faq?.map((item,index)=><p key={item.id??index}><strong>Pergunta:</strong> {item.question}<br/><strong>Resposta:</strong> {item.answer}</p>)}
  </div>;
}
