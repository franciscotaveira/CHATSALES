
// Brazilian Phone Sanitizer & E.164 Validator
export function sanitizeBrazilianPhoneE164(raw: string): { phoneE164: string } | { error: string } {
  if (!raw) return { error: "Vazio" };
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { error: "Sem dígitos" };

  let clean = digits.startsWith("0") ? digits.slice(1) : digits;

  if(raw.trim().startsWith("+")&&(!clean.startsWith("55")||![12,13].includes(clean.length)))return {error:"Formato internacional inválido para o modo Brasil"};
  if (clean.startsWith("55") && [12,13].includes(clean.length)) {
    clean = clean.slice(2);
  }

  if (clean.length < 10) {
    return { error: "Menos de 10 dígitos (DDD ausente)" };
  }

  const ddd = clean.slice(0, 2);
  const rest = clean.slice(2);

  // Landlines discard (starting with 2, 3, 4, 5 and 8 digits)
  if (rest.length === 8 && /^[2-5]/.test(rest)) {
    return { error: "Telefone fixo descartado" };
  }

  let finalNumber = rest;
  if (rest.length === 8 && /^[6-9]/.test(rest)) {
    finalNumber = `9${rest}`;
  } else if (rest.length === 9 && rest.startsWith("9")) {
    finalNumber = rest;
  } else if (rest.length !== 9) {
    return { error: "Formato de telefone móvel inválido" };
  }

  const e164 = `+55${ddd}${finalNumber}`;
  if (!/^\+55[1-9]{2}9[0-9]{8}$/.test(e164)) {
    return { error: "Dígitos inválidos" };
  }

  return { phoneE164: e164 };
}

export type ImportRow=Record<string,unknown>;
export type ImportPhoneFormat="BR"|"E164";
export function suggestImportColumns(rows:ImportRow[]){
  const columns=Array.from(new Set(rows.flatMap(row=>Object.keys(row))));
  const normalized=(key:string)=>key.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[_-]+/g," ").trim();
  const phones=columns.filter(key=>/^(telefone|celular|whatsapp|phone|fone|mobile|tel)(?:\s|\d|$)/.test(normalized(key)));
  const names=columns.filter(key=>/^(nome|name|full name|first name|cliente)(?:\s|$)/.test(normalized(key)));
  return {columns,phoneColumn:phones.length===1?phones[0]!:"",nameColumn:names.length===1?names[0]!:""};
}

export function mapImportRows(rows:ImportRow[],phoneColumn:string,nameColumn:string,format:ImportPhoneFormat){
  const contacts:Array<{phoneE164:string;name?:string}>=[];
  const issues:Array<{row:number;reason:string}>=[];
  const stats={totalRows:rows.length,validCount:0,duplicateCount:0,invalidCount:0};
  if(!phoneColumn)return {contacts,issues,stats,error:rows.length?"Escolha a coluna que contém os telefones do WhatsApp.":null};
  if(phoneColumn===nameColumn)return {contacts,issues,stats,error:"Escolha colunas diferentes para telefone e nome, ou deixe o nome sem mapeamento."};
  const seen=new Set<string>();
  rows.forEach((row,index)=>{
    const raw=String(row[phoneColumn]??"").trim();
    const clean=raw.replace(/[\s().-]/g,"");
    const sanitized=format==="BR"?sanitizeBrazilianPhoneE164(raw):/^\+[1-9][0-9]{8,14}$/.test(clean)?{phoneE164:clean}:{error:"Use +, código do país e telefone no formato internacional"};
    const name=nameColumn?String(row[nameColumn]??"").trim():"";
    if("error" in sanitized||name.length>150){stats.invalidCount++;issues.push({row:index+2,reason:"error" in sanitized?sanitized.error:"Nome excede 150 caracteres"});return;}
    if(seen.has(sanitized.phoneE164)){stats.duplicateCount++;issues.push({row:index+2,reason:"Telefone repetido; a primeira ocorrência foi mantida"});return;}
    seen.add(sanitized.phoneE164);contacts.push({phoneE164:sanitized.phoneE164,name:name||undefined});
  });
  stats.validCount=contacts.length;
  const error=contacts.length>1000?`Há ${contacts.length} contatos válidos. O limite por campanha é 1.000; divida o arquivo antes de continuar.`:contacts.length===0?"Nenhum telefone válido nesta coluna. Confira o mapeamento e o formato escolhido.":null;
  return {contacts,issues,stats,error};
}

export async function parseCsvText(text: string): Promise<Array<Record<string, string>>> {
  if (!text.trim()) return [];
  const XLSX = await loadSpreadsheetLibrary();
  const workbook = XLSX.read(text, { type: "string", raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });
}


export async function loadSpreadsheetLibrary(){
  try{return await import("xlsx");}
  catch{throw new Error("Não foi possível carregar o leitor de planilhas. Verifique a conexão e selecione o arquivo novamente. Nenhum público foi importado.");}
}
