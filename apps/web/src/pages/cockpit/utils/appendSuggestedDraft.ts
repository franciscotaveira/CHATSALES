/** Preserve the exact text already written; add the suggestion without sending. */
export function appendSuggestedDraft(current:string,suggested:string):string{
 if(!suggested.trim())return current;
 return current.trim()?`${current}\n\n${suggested}`:suggested;
}
