import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import data from '../data/positional/catalog.js';
const text=fs.readFileSync(new URL('../data/positional/catalog.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../data/positional/manifest.json',import.meta.url),'utf8'));
const embedded=text.match(/const source = ([\s\S]*?);\nconst themes/)[1];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
assert.equal(hash(embedded+'\n'),manifest.publicProjectionSha256);
const original=JSON.parse(embedded);assert.equal(data.version,original.version);assert.equal(data.cases.length,manifest.uniquePositions);
for(let i=0;i<data.cases.length;i++){const {themeIds,primaryTheme,...p}=data.cases[i];assert.deepEqual(p,original.cases[i]);assert(themeIds.includes(primaryTheme));assert(themeIds.every(id=>data.themes.some(t=>t.id===id)));}
assert(!/\/workspace\/|\/home\/|rawPolicy|rawSourcePath/.test(text));
assert(!data.cases.some(p=>p.source.whiteName||p.source.blackName));
assert(data.practiceThemes.every(g=>g.tags.every(t=>data.themes.some(x=>x.id===t))));
const {binaryControl}=await import('../js/positional-engine.js');
for(const b of manifest.binaryControls)assert.equal(binaryControl(data.cases.find(p=>p.id===b.id)).uci,b.goodUci);
console.log('Public projection hash, exact original case values, theme references and privacy checks passed');
assert.deepEqual(manifest.binaryControls.map(x=>x.id).sort(),data.cases.map(x=>x.id).sort());
assert.deepEqual(manifest.observedBestConsistency.map(x=>x.id).sort(),data.cases.map(x=>x.id).sort());
for(const receipt of manifest.observedBestConsistency){
  const p=data.cases.find(p=>p.id===receipt.id),good=p.options.filter(o=>!o.isBad),bad=p.options.find(o=>o.isBad);
  assert.deepEqual(Object.keys(receipt.budgets).sort(),['10M','3M']);
  for(const [budget,r] of Object.entries(receipt.budgets)){
    const observed=Math.max(r.unrestrictedReferenceCp,...Object.values(r.scoresCpMover));
    assert.equal(r.observedBestCp,observed);assert.equal(r.passed,true);
    assert.deepEqual(Object.keys(r.scoresCpMover).sort(),good.map(o=>o.uci).sort());
    for(const o of good){assert.equal(r.belowObservedBestCp[o.uci],observed-r.scoresCpMover[o.uci]);assert(r.belowObservedBestCp[o.uci]<=40);assert.equal(r.aboveBadCp[o.uci],r.scoresCpMover[o.uci]-r.actualScoreCpMover);assert(r.aboveBadCp[o.uci]>=60);if(budget==='10M')assert.equal(r.scoresCpMover[o.uci],o.validation.stockfishCpMover);}
    if(budget==='10M')assert.equal(r.actualScoreCpMover,bad.validation.stockfishCpMover);
  }
}
assert.equal(hash(JSON.stringify(manifest.exclusions,null,2)+'\n'),manifest.approvedExclusionsSha256);
for(const held of manifest.exclusions.cases)assert(!data.cases.some(p=>p.id===held.id));
console.log('Both engine-budget consistency receipts, full binary coverage and exact public exclusions pass');
