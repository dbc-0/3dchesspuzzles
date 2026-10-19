import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import catalog from '../data/positional/catalog.js';
import estimates from '../data/positional/win-estimates.js';
import {binaryControl} from '../js/positional-engine.js';
import {estimateBinding,winComparison} from '../js/positional-review.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const raw=fs.readFileSync(new URL('../data/positional/win-estimates.js',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(raw.slice('export default '.length,-2)).digest('hex'),'1a225fe2b12e078b13747261e3ee4572d3e2147d778c3813ee3611046aed3af9');
assert.equal(estimates.status,'approved','Only independently approved numeric overlays may ship');
assert.equal(estimates.corpusPublicSha256,'a45c2167493b1733fac44bca5eab8b687606c4383190495195941af437b8a257');
assert.equal(Object.keys(estimates.cases).length,50);
let rows=0,disagreements=[];
for(const p of catalog.cases){
 const ref=binaryControl(p).uci;
 assert.equal(createHash('sha256').update(estimateBinding(p,ref)).digest('hex'),estimates.cases[p.id].positionOptionsSha256,p.id);
 const result=await winComparison(p,estimates,ref);assert(result,p.id);
 for(const row of result.rows){assert(!row.unavailable,p.id);rows++;if(row.disagrees)disagreements.push(`${p.id}/${row.rating}`);}
}
assert.equal(rows,100);assert.deepEqual(disagreements.sort(),['g04229_p042/1500','low_g00143_p020/2600'].sort());
const p=catalog.cases[0],ref=binaryControl(p).uci,clone=v=>JSON.parse(JSON.stringify(v));
assert.equal(await winComparison(p,{...estimates,status:'pending'},ref),null);
assert.equal(await winComparison(p,{...estimates,metric:'expected_score'},ref),null);
assert.equal(await winComparison(p,estimates,p.options.find(o=>o.isBad).uci),null);
let changed=clone(p);changed.history.movesUci.pop();assert.equal(await winComparison(changed,estimates,ref),null);
changed=clone(p);changed.options[0].san+='?';assert.equal(await winComparison(changed,estimates,ref),null);
changed=clone(p);changed.themeIds=['new-metadata'];assert(await winComparison(changed,estimates,ref));
let missing=clone(estimates);delete missing.cases[p.id].estimates['2600'];assert((await winComparison(p,missing,ref)).rows.find(r=>r.rating===2600).unavailable);
missing=clone(estimates);missing.cases[p.id].estimates['2600'].selfRating=2200;assert((await winComparison(p,missing,ref)).rows.find(r=>r.rating===2600).unavailable);
missing=clone(estimates);missing.cases[p.id].estimates['1500'].mistakeMinusGoodWinPercentagePoints=999;assert((await winComparison(p,missing,ref)).rows[0].unavailable);
missing=clone(estimates);missing.cases[p.id].estimates['1500'].options[ref].winProbability=1.2;assert((await winComparison(p,missing,ref)).rows[0].unavailable);
console.log('50 exact history/position/option bindings, 100 truthful WDL comparisons, both signed disagreements, approval/missing/wrong-rating/malformed gates passed');
