const MB=1024*1024;
// Mirrors the upload API allowlist; content signature and final validation remain server-side.
export const attachmentLimits:Readonly<Record<string,number>>={'image/jpeg':5*MB,'image/png':5*MB,'image/webp':5*MB,'application/pdf':16*MB,'video/mp4':16*MB,'audio/ogg':16*MB,'audio/mpeg':16*MB};
export const attachmentAccept=Object.keys(attachmentLimits).join(',');
export function attachmentFileError(file:File):string|null{
 const limit=attachmentLimits[file.type.toLowerCase()];
 if(!limit)return 'Formato não aceito. Use JPG, PNG, WebP, PDF, MP4, OGG ou MP3.';
 if(file.size===0)return 'O arquivo está vazio. Escolha um arquivo com conteúdo.';
 if(file.size>limit)return `Este arquivo excede o limite de ${limit/MB} MB para esse formato. Escolha um arquivo menor.`;
 return null;
}
export function attachmentSizeLabel(bytes:number):string{return bytes<1024?`${bytes} B`:bytes<MB?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/MB).toFixed(1)} MB`;}
