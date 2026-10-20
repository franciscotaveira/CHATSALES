export const contactMetadataFields=['email','company','notes','tags'] as const;
export type ContactMetadataField=typeof contactMetadataFields[number];
/** Read untrusted legacy JSON without coercing objects or guessing a tag format. */
export function readContactMetadata(input:unknown){
 const record=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
 const invalidContainer=input!==undefined&&(input===null||typeof input!=='object'||Array.isArray(input));
 const invalid=new Set<ContactMetadataField>();
 const text=(key:'email'|'company'|'notes')=>{const value=record[key];if(value==null)return '';if(typeof value==='string')return value;invalid.add(key);return '';};
 const email=text('email'),company=text('company'),notes=text('notes');
 let tags:string[]=[];const rawTags=record.tags;
 if(rawTags!=null){if(Array.isArray(rawTags)&&rawTags.every(tag=>typeof tag==='string'))tags=rawTags;else invalid.add('tags');}
 if(invalidContainer)contactMetadataFields.forEach(key=>invalid.add(key));
 return {email,company,notes,tags,invalid,invalidContainer};
}
export function contactMetadataPatch(source:unknown,values:{email:string;company:string;notes:string;tags:string[]},edited:ReadonlySet<ContactMetadataField>){
 const {invalidContainer}=readContactMetadata(source);
 const patch:Partial<typeof values>={};
 if(invalidContainer)return patch;
 for(const key of contactMetadataFields){if(!edited.has(key))continue;if(key==='tags')patch.tags=values.tags;else patch[key]=values[key];}
 return patch;
}
