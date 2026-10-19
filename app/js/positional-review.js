// Review-only model estimates. Never use these to score or select an answer.
export function canonicalJson(value) {
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function estimateBinding(p,referenceGoodUci) {
  return canonicalJson({caseId:p.id,fen:p.fen,initialFen:p.history?.initialFen,movesUci:p.history?.movesUci,
    options:p.options.map(({uci,san,isBad})=>({uci,san,isBad})).sort((a,b)=>a.uci.localeCompare(b.uci)),referenceGoodUci});
}
const validWdl=x=>x&&['winProbability','drawProbability','lossProbability'].every(k=>Number.isFinite(x[k])&&x[k]>=0&&x[k]<=1)&&Math.abs(x.winProbability+x.drawProbability+x.lossProbability-1)<0.00001;
export async function winComparison(p,overlay,referenceGoodUci) {
  try {
    if(overlay?.status!=='approved'||overlay.model!=='Maia3-79M'||overlay.metric!=='outright_win_probability'||overlay.pov!=='original_mover_after_selected_move')return null;
    const entry=overlay.cases?.[p.id],bad=p.options.find(o=>o.isBad);
    if(!entry||entry.caseId!==p.id||entry.fen!==p.fen||entry.badUci!==bad?.uci||entry.referenceGoodUci!==referenceGoodUci||!p.history?.initialFen||!Array.isArray(p.history.movesUci))return null;
    if(!p.options.some(o=>o.uci===referenceGoodUci&&!o.isBad))return null;
    const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(estimateBinding(p,referenceGoodUci)));
    if(Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('')!==entry.positionOptionsSha256)return null;
    const rows=[1500,2600].map(rating=>{
      const e=entry.estimates?.[rating],good=e?.options?.[referenceGoodUci],mistake=e?.options?.[bad.uci];
      if(e?.selfRating!==rating||e?.opponentRating!==rating||!validWdl(good)||!validWdl(mistake))return {rating,unavailable:true};
      const change=100*(mistake.winProbability-good.winProbability);
      if(!Number.isFinite(e.mistakeMinusGoodWinPercentagePoints)||!Number.isFinite(e.goodMinusBadWinPercentagePoints)||Math.abs(change-e.mistakeMinusGoodWinPercentagePoints)>0.000001||Math.abs(change+e.goodMinusBadWinPercentagePoints)>0.000001)return {rating,unavailable:true};
      return {rating,good:good.winProbability,mistake:mistake.winProbability,change,disagrees:change>0};
    });
    return {referenceGoodUci,badUci:bad.uci,rows};
  }catch{return null;}
}
