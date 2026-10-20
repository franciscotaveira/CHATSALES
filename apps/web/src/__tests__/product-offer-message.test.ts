import {it,expect} from "vitest";
import {buildProductOfferMessage} from "../pages/products/product-offer-message";
import {type ProductRecord} from "../services/api-client";
const product={id:"SIM-a",title:"SIM Primeiro",description:"SIM descrição",priceCents:1234,currency:"BRL",status:"ACTIVE",catalogId:"SIM-catalog",retailerId:"SIM-item"} as ProductRecord;
it('uses text for a cross-catalogue selection rather than pairing retailers with the wrong catalogue',()=>{
 const {message,formatLabel}=buildProductOfferMessage([product,{...product,id:"SIM-b",title:"SIM Segundo",catalogId:"SIM-other"}],"meta_waba");expect(message.contentType).toBe("text");expect(message.interactive).toBeUndefined();expect(message.body).toContain("SIM Primeiro");expect(message.body).toContain("SIM Segundo");expect(message.body).toContain("12,34");expect(formatLabel).toBe("Mensagem de texto com produtos");
});
it('keeps Meta retailer identifiers paired with their common catalogue',()=>{
 const {message}=buildProductOfferMessage([product,{...product,id:"SIM-b",retailerId:"SIM-item-b"}],"meta_waba");expect(message.interactive?.action).toMatchObject({catalog_id:"SIM-catalog",sections:[{product_items:[{product_retailer_id:"SIM-item"},{product_retailer_id:"SIM-item-b"}]}]});
});
it('shows the actual image-and-text fallback outside Meta without offering native buttons',()=>{
 const {message,formatLabel}=buildProductOfferMessage([{...product,imageUrl:"https://example.test/SIM-image.png"}],"waha");expect(message.contentType).toBe("image");expect(message.mediaUrl).toBe("https://example.test/SIM-image.png");expect(message.body).toContain("12,34");expect(message.interactive).toBeUndefined();expect(formatLabel).toBe("Imagem com texto");
});
it('refuses unavailable products and empty offers before previewing or building an outbound message',()=>{
 expect(()=>buildProductOfferMessage([],"waha")).toThrow("Selecione ao menos um produto");expect(()=>buildProductOfferMessage([{...product,status:"INACTIVE"}],"meta_waba")).toThrow();
});
