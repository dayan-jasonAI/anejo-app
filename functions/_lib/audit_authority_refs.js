// These references locate supplied source text. They do not establish that a
// source supports a claim, or grant publication approval.
export function auditAuthorityReferences({menuText='',brandText='',trainingText=''}={}) {
  const result=[];
  for(const [source,text] of [['menu',menuText],['brand',brandText],['training',trainingText]]) {
    if(typeof text!=='string')throw new TypeError('Authority text must be a string');
    let offset=0;
    // Retain whitespace and offsets: citation resolution never paraphrases text.
    for(const line of text.split(/(?<=\n)/)) {
      for(let start=0;start<line.length;start+=400) {
        const quote=line.slice(start,start+400);
        if(quote.trim())result.push({id:source+':'+(offset+start),source,offset:offset+start,quote});
      }
      offset+=line.length;
    }
  }
  return result;
}

export function resolveAuditAuthorityReferences(ids,context) {
  if(!Array.isArray(ids)||ids.length>8||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)
    return {ok:false,issue:'invalid_authority_refs'};
  const refs=new Map(auditAuthorityReferences(context).map(ref=>[ref.id,ref]));
  if(ids.some(id=>!refs.has(id)))return {ok:false,issue:'unknown_authority_ref'};
  return {ok:true,citations:ids.map(id=>({...refs.get(id)})),unresolved:ids.length===0};
}
