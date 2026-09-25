// Shared rendering for the existing Lead and planner. Review permits planning only.
export function renderCampaignDirection(brief) {
 const prefix=`- [brief_id: ${brief.id}] [${brief.status}] ${brief.title}`;
 let text=prefix+['objective','audience','angle','cadence','success_metric'].filter(k=>brief[k]).map(k=>`\n${k}: ${brief[k]}`).join('');
 if(brief.promotion_id){
  let proposal;try{proposal=JSON.parse(brief.promotion_proposal_json);}catch{return `${prefix}\nPROMOTION EVIDENCE UNAVAILABLE: do not use this brief as campaign direction.`;}
  if(brief.review_scope!=='team_planning_only'||!proposal||!['product_ids','assumptions','questions'].every(k=>Array.isArray(proposal[k])&&proposal[k].every(v=>typeof v==='string')))return `${prefix}\nPROMOTION EVIDENCE INVALID: do not use this brief as campaign direction.`;
  const matches=['title','objective','audience','angle','cadence','success_metric'].every(k=>brief[k]===proposal[k])&&brief.channels===JSON.stringify(proposal.channels)&&brief.assets_json===JSON.stringify(proposal.assets);
  if(!matches)return `${prefix}\nREVIEWED PROPOSAL CHANGED: do not use this brief as campaign direction until reviewed again.`;
  text+='\nOWNER REVIEW SCOPE: team planning only. No approval to publish, schedule, send, or treat assumptions as facts.';
  text+='\nSelected catalog IDs: '+JSON.stringify(proposal.product_ids);
  text+='\nUNVERIFIED ASSUMPTIONS (never business facts): '+JSON.stringify(proposal.assumptions);
  text+='\nOPEN QUESTIONS (must be resolved before relying on their answers): '+JSON.stringify(proposal.questions);
  text+='\nProposed channels: '+JSON.stringify(proposal.channels)+'\nProposed assets (not existing assets): '+JSON.stringify(proposal.assets);
 }
 return text;
}
