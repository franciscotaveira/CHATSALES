/** Match the catalogue API integer-cent contract; absence is never a free product. */
export function isValidProductPrice(value:unknown):value is number{return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=2147483647;}
export function productPriceInput(value:unknown){return isValidProductPrice(value)?(value/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';}
export function productPriceLabel(value:unknown,currency:unknown){
 if(!isValidProductPrice(value)||typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))return 'Preço indisponível';
 try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value/100);}catch{return 'Preço indisponível';}
}
