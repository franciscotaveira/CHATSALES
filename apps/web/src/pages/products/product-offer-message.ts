import {type ProductRecord,type SendOutboundMessagePayload} from "../../services/api-client";
import {productOfferIssue} from "./product-offer";
import {productPriceLabel} from "./product-price";
export function buildProductOfferMessage(products:ProductRecord[],provider?:string|null):{message:Omit<SendOutboundMessagePayload,"recipientPhoneE164"|"idempotencyKey">;formatLabel:string}{
 if(!products.length)throw new Error("Selecione ao menos um produto para revisar a oferta.");
 const issue=products.map(productOfferIssue).find(Boolean);if(issue)throw new Error(issue);
 const product=products[0]!;
 if(products.length===1){
  const formattedPrice=productPriceLabel(product.priceCents,product.currency);
  if(provider==="meta_waba"&&product.catalogId&&product.retailerId)return {formatLabel:"Produto do catálogo Meta",message:{contentType:"interactive",body:`🛍️ *${product.title}*\n${product.description ? `\n${product.description}\n` : ""}\n💰 *Valor:* ${formattedPrice}`,interactive:{type:"product",body:{text:`🛍️ *${product.title}*\n${product.description ? `\n${product.description}\n` : ""}\n💰 *Valor:* ${formattedPrice}\n\n_Toque abaixo para ver no catálogo e finalizar pedido:_`},footer:{text:"SOS Vendas"},action:{catalog_id:product.catalogId,product_retailer_id:product.retailerId}}}};
  return {formatLabel:product.imageUrl?"Imagem com texto":"Mensagem de texto",message:{contentType:product.imageUrl?"image":"text",mediaUrl:product.imageUrl||undefined,body:`🛍️ *${product.title}*\n\n${product.description ? `${product.description}\n\n` : ""}💰 *Valor:* ${formattedPrice}\n\n_Deseja agendar ou adquirir este item? Basta responder aqui!_`}};
 }
 const catalogId=product.catalogId;
 if(provider==="meta_waba"&&catalogId&&products.every(item=>item.retailerId&&item.catalogId===catalogId))return {formatLabel:"Lista do catálogo Meta",message:{contentType:"interactive",body:`✨ *Catálogo de Destaques Selecionados* (${products.length} itens)`,interactive:{type:"product_list",header:{type:"text",text:"Ofertas Selecionadas"},body:{text:"Separamos essas opções especialmente para você. Toque no botão abaixo para explorar o catálogo e escolher:"},footer:{text:"SOS Vendas • Atendimento Comercial"},action:{catalog_id:catalogId,sections:[{title:"Destaques Disponíveis",product_items:products.map(item=>({product_retailer_id:item.retailerId!}))}]}}}};
 const lines=products.map((item,index)=>`*${index+1}. ${item.title}* — ${productPriceLabel(item.priceCents,item.currency)}${item.description?`\n   _${item.description}_`:""}`);
 return {formatLabel:"Mensagem de texto com produtos",message:{contentType:"text",body:`✨ *Catálogo de Destaques Selecionados:*\n\n${lines.join("\n\n")}\n\n_Qual das opções você gostaria de agendar ou adquirir?_`}};
}
