import type {WabaTemplateComponent} from "./channel";
export interface ProviderTemplateComponent{type:string;format?:string;text?:string;buttons?:Array<{type:string;text?:string;url?:string;phone_number?:string}>;}
export interface TemplateLayoutSource{bodyText:string;headerText?:string|null;footerText?:string|null;buttons?:Array<{type:string;text?:string;url?:string;phone_number?:string}>;providerComponents?:ProviderTemplateComponent[];parameterFormat?:string;}
export interface TemplateField{key:string;label:string;kind:"text"|"media"|"filename"|"url_suffix"|"payload";required:boolean;maxLength:number;}
/** Body-only automatic first-name aliases. Scoped header/button keys are never inferred as a contact name. */
export function isRecipientNameVariable(key:string):boolean{
 return key==="1"||/^(nome|name|cliente|lead|primeiro_nome|cliente_nome|nome_do_cliente|primeiro_nome_cliente)$/i.test(key);
}
export function templateTokens(text:string):string[]{
 const keys=[...new Set([...text.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map(m=>m[1]!))];
 return keys.every(k=>/^\d+$/.test(k))?keys.sort((a,b)=>Number(a)-Number(b)):keys;
}
export function inspectTemplateLayout(source:TemplateLayoutSource){
 const raw=source.providerComponents??[];
 const header=raw.find(c=>c.type==="HEADER");
 const headerFormat=header?.format?.toUpperCase()||(source.headerText?"TEXT":"NONE");
 const headerText=header?.text??source.headerText??"";
 const buttons=raw.find(c=>c.type==="BUTTONS")?.buttons??source.buttons??[];
 const fields:TemplateField[]=[];const unsupported:string[]=[];
 for(const c of raw)if(!["HEADER","BODY","FOOTER","BUTTONS"].includes(c.type))unsupported.push(`Componente ${c.type} exige configuração específica.`);
 const addText=(text:string,prefix:string,label:string,max:number)=>{for(const key of templateTokens(text))fields.push({key:prefix+key,label:`${label} {{${key}}}`,kind:"text",required:true,maxLength:max});};
 if(headerFormat==="TEXT")addText(headerText,"header:","Cabeçalho",60);
 else if(["IMAGE","VIDEO","DOCUMENT"].includes(headerFormat)){
  fields.push({key:"header:media",label:`URL ${headerFormat==="IMAGE"?"da imagem":headerFormat==="VIDEO"?"do vídeo":"do documento"} do cabeçalho`,kind:"media",required:true,maxLength:2048});
  if(headerFormat==="DOCUMENT")fields.push({key:"header:filename",label:"Nome do documento (opcional)",kind:"filename",required:false,maxLength:128});
 }else if(headerFormat!=="NONE")unsupported.push(`Cabeçalho ${headerFormat} exige configuração específica.`);
 addText(source.bodyText,"","Variável",200);
 buttons.forEach((button,index)=>{
  if(button.type==="URL"){
   const keys=templateTokens(button.url??"");
   if(keys.length===1)fields.push({key:`button:${index}`,label:`Complemento do link do botão ${index+1}: ${button.text??""}`,kind:"url_suffix",required:true,maxLength:200});
   if(keys.length>1)unsupported.push(`O link do botão ${index+1} possui mais de um parâmetro.`);
  }else if(button.type==="QUICK_REPLY")fields.push({key:`button:${index}:payload`,label:`Identificador da resposta do botão ${index+1} (opcional)`,kind:"payload",required:false,maxLength:256});
  else if(button.type!=="PHONE_NUMBER")unsupported.push(`Botão ${button.type} exige configuração específica.`);
 });
 return {fields,unsupported,headerFormat,headerText,buttons};
}
export function assembleTemplate(source:TemplateLayoutSource,values:Record<string,string>){
 const layout=inspectTemplateLayout(source);const missing=layout.fields.filter(f=>f.required&&!values[f.key]?.trim()).map(f=>f.label);const errors:string[]=[];
 for(const field of layout.fields){const value=values[field.key]?.trim();if(!value)continue;if(value.length>field.maxLength)errors.push(`${field.label}: máximo de ${field.maxLength} caracteres.`);if(field.kind==="media"){try{const url=new URL(value);if(!["https:","http:"].includes(url.protocol)||url.username||url.password)throw new Error();}catch{errors.push(`${field.label}: informe uma URL HTTP(S) válida.`);}}}
 const substitute=(text:string,prefix="")=>text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g,(raw,key:string)=>values[prefix+key]?.trim()||raw);
 const components:WabaTemplateComponent[]=[];
 const parameterFormat=source.parameterFormat??(templateTokens(source.bodyText+layout.headerText).some(k=>!/^\d+$/.test(k))?"NAMED":"POSITIONAL");
 const textParameters=(text:string,prefix="")=>templateTokens(text).map(key=>({type:"text",text:values[prefix+key]?.trim()??"",...(parameterFormat==="NAMED"?{parameter_name:key}:{})}));
 if(layout.headerFormat==="TEXT"&&templateTokens(layout.headerText).length)components.push({type:"header",parameters:textParameters(layout.headerText,"header:")});
 if(["IMAGE","VIDEO","DOCUMENT"].includes(layout.headerFormat)){
  const type=layout.headerFormat.toLowerCase();components.push({type:"header",parameters:[{type,[type]:{link:values["header:media"]?.trim()??"",...(type==="document"&&values["header:filename"]?.trim()?{filename:values["header:filename"].trim()}:{})}}]});
 }
 if(templateTokens(source.bodyText).length)components.push({type:"body",parameters:textParameters(source.bodyText)});
 const buttons=layout.buttons.map((button,index)=>{
  const url=button.url?button.url.replace(/\{\{[a-zA-Z0-9_]+\}\}/g,()=>values[`button:${index}`]?.trim()||"[complemento não informado]"):undefined;
  if(button.type==="URL"&&templateTokens(button.url??"").length===1)components.push({type:"button",sub_type:"url",index,parameters:[{type:"text",text:values[`button:${index}`]?.trim()??""}]});
  if(button.type==="QUICK_REPLY"&&values[`button:${index}:payload`]?.trim())components.push({type:"button",sub_type:"quick_reply",index,parameters:[{type:"payload",payload:values[`button:${index}:payload`]!.trim()}]});
  return {...button,url};
 });
 const renderedHeader=substitute(layout.headerText,"header:"),renderedBody=substitute(source.bodyText),renderedFooter=source.footerText??"";
 const renderedText=[renderedHeader,renderedBody,renderedFooter,...buttons.map(button=>button.type==="URL"?`${button.text??"Link"}: ${button.url}`:button.type==="PHONE_NUMBER"?`${button.text??"Telefone"}: ${button.phone_number??""}`:button.text??"")].filter(Boolean).join("\n\n");
 if(renderedText.length>4096)errors.push("A mensagem preparada ultrapassa 4096 caracteres.");
 const mediaType=(["IMAGE","VIDEO","DOCUMENT"].includes(layout.headerFormat)?layout.headerFormat.toLowerCase():"text") as "text"|"image"|"video"|"document";
 return {...layout,missing,errors,components,renderedHeader,renderedBody,renderedFooter,renderedButtons:buttons,renderedText,mediaType,mediaUrl:mediaType!=="text"?values["header:media"]?.trim():undefined};
}
/** Validate an existing API payload against the retained provider layout without inventing parameters. */
export function validateTemplateComponents(source:TemplateLayoutSource,components:WabaTemplateComponent[]=[]):string[]{
 const layout=inspectTemplateLayout(source);const errors=[...layout.unsupported];
 const byType=(type:string)=>components.filter(c=>c.type===type);
 if(byType("header").length>1||byType("body").length>1)errors.push("Cabeçalho ou corpo duplicado.");
 const named=source.parameterFormat==="NAMED";
 const text=(text:string,part:WabaTemplateComponent|undefined,label:string,max:number)=>{
  const keys=templateTokens(text),parameters=part?.parameters??[];
  if(parameters.length!==keys.length){errors.push(`${label}: quantidade de variáveis diferente do modelo.`);return;}
  const names=new Set<string>();
  parameters.forEach((parameter)=>{if(parameter.type!=="text"||typeof parameter.text!=="string"||!parameter.text.trim()||parameter.text.length>max)errors.push(`${label}: valor de texto inválido.`);if(named){const name=String(parameter.parameter_name??"");if(!keys.includes(name)||names.has(name))errors.push(`${label}: nome de variável inválido.`);names.add(name);}else if(parameter.parameter_name)errors.push(`${label}: o modelo usa variáveis por posição.`);});
 };
 const header=byType("header")[0];
 if(layout.headerFormat==="TEXT")text(layout.headerText,header,"Cabeçalho",60);
 else if(["IMAGE","VIDEO","DOCUMENT"].includes(layout.headerFormat)){
  const parameters=header?.parameters??[],type=layout.headerFormat.toLowerCase();
  const value=parameters[0]?.[type] as Record<string,unknown>|undefined;
  if(parameters.length!==1||parameters[0]?.type!==type||!value||Boolean(value.link)===Boolean(value.id))errors.push("Informe a mídia exigida pelo cabeçalho.");
  else if(value.link){try{const url=new URL(String(value.link));if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error();}catch{errors.push("URL de mídia inválida.");}}
  else if(typeof value.id!=="string"||!value.id.trim())errors.push("Identificador de mídia inválido.");
 }else if(header)errors.push("Este modelo não recebe parâmetros de cabeçalho.");
 text(source.bodyText,byType("body")[0],"Corpo",200);
 const used=new Set<number>();
 for(const component of byType("button")){
  const index=Number(component.index),button=layout.buttons[index],parameters=component.parameters??[];
  if(!Number.isInteger(index)||index<0||!button||used.has(index)){errors.push("Índice de botão inválido ou repetido.");continue;}used.add(index);
  if(button.type==="URL"&&templateTokens(button.url??"").length===1){if(component.sub_type!=="url"||parameters.length!==1||parameters[0]?.type!=="text"||typeof parameters[0]?.text!=="string"||!parameters[0].text.trim()||parameters[0].text.length>200)errors.push(`Preencha o complemento do link do botão ${index+1}.`);}
  else if(button.type==="QUICK_REPLY"){if(component.sub_type!=="quick_reply"||parameters.length!==1||parameters[0]?.type!=="payload"||typeof parameters[0]?.payload!=="string"||!parameters[0].payload.trim()||parameters[0].payload.length>256)errors.push(`Resposta rápida do botão ${index+1} inválida.`);}
  else errors.push(`O botão ${index+1} não recebe este parâmetro.`);
 }
 layout.buttons.forEach((button,index)=>{if(button.type==="URL"&&templateTokens(button.url??"").length&&!used.has(index))errors.push(`Falta o complemento do link do botão ${index+1}.`);});
 return [...new Set(errors)];
}
export function templateLayoutSignature(source:TemplateLayoutSource):string{
 const sort=(value:unknown):unknown=>Array.isArray(value)?value.map(sort):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,sort(item)])):value;
 return JSON.stringify(sort({bodyText:source.bodyText,headerText:source.headerText??"",footerText:source.footerText??"",buttons:source.buttons??[],providerComponents:source.providerComponents??[],parameterFormat:source.parameterFormat??"POSITIONAL"}));
}
export function storedTemplateLayout(row:{body_text?:unknown;header_text?:unknown;footer_text?:unknown;buttons?:unknown;provider_components?:unknown;parameter_format?:unknown}):TemplateLayoutSource{
 return {bodyText:String(row.body_text??""),headerText:row.header_text?String(row.header_text):null,footerText:row.footer_text?String(row.footer_text):null,buttons:Array.isArray(row.buttons)?row.buttons:[],providerComponents:Array.isArray(row.provider_components)?row.provider_components:[],parameterFormat:String(row.parameter_format??"POSITIONAL")};
}
