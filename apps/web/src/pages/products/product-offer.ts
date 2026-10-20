import type {ProductRecord} from "../../services/api-client";
import {productPriceLabel,isValidProductPrice} from "./product-price";
import {productStatusLabel} from "./product-status";
export function productOfferIssue(product:ProductRecord){
 if(product.status!=="ACTIVE")return `${productStatusLabel(product.status)}: revise o cadastro antes de oferecer.`;
 if(!isValidProductPrice(product.priceCents)||productPriceLabel(product.priceCents,product.currency)==="Preço indisponível")return "Preço indisponível: revise o cadastro antes de oferecer.";
 return null;
}

