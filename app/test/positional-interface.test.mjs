import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSetup} from '../js/modes/positional.js';
import catalog from '../data/positional/catalog.js';
import * as E from '../js/positional-engine.js';
import {LETTERS,COLORS,formatTime} from '../js/positional-core.js';
const source=fs.readFileSync(new URL('../js/modes/positional.js',import.meta.url),'utf8');
const renderSource=source.slice(source.indexOf('  function render(){'),source.indexOf('  function renderReview('));
const esc=x=>String(x??'').replaceAll('<','&lt;');
function render(run){
  const nodes=new Map(),classes=new Set(['screen','screen--play','screen--positional']);
  let reviewed=false,arrows=0;
  const root={innerHTML:'',classList:{toggle(k,v){v?classes.add(k):classes.delete(k)}},querySelector(k){if(!nodes.has(k))nodes.set(k,{innerHTML:'',hidden:false,appendChild(){}});return nodes.get(k)}};
  Function('root','run','data','E','LETTERS','COLORS','formatTime','esc','renderReview','boardAt',`const stopped=false,selected=null,feedback='',storageError='',boardEl={},board={resize(){}},requestAnimationFrame=f=>f(),label=v=>v,icon=n=>'<svg></svg>';${renderSource}render();`)(root,run,catalog,E,LETTERS,COLORS,formatTime,esc,()=>{reviewed=true},()=>{arrows++});
  return {root,nodes,classes,reviewed,arrows};
}
for(const choiceCount of [2,3]){
  const r=E.resume(E.newRun(catalog,{variant:choiceCount===2?'timed':'fixed',choiceCount,board:'2d'},{seed:1,now:1000}),1000);
  const v=render(r),controls=v.nodes.get('.pos-controls').innerHTML;
  assert(v.root.innerHTML.includes('class="stage pos-stage"'));
  assert(v.root.innerHTML.includes('class="action-bar pos-action-bar"'));
  assert(v.root.innerHTML.includes('class="readouts pos-readouts"'));
  assert.equal((controls.match(/data-choice=/g)||[]).length,choiceCount);
  assert(controls.includes('Submit choice'));assert(controls.includes('disabled'));
  assert(!v.root.innerHTML.includes(catalog.cases[0].explanation.text));
  assert(!v.root.innerHTML.includes('Source and control checks'));
  assert(v.classes.has('screen--play'));assert(!v.classes.has('screen--positional-review'));
  const paused=render(E.pause(r,2000));
  assert.equal(paused.nodes.get('.pos-board-area').hidden,true);
  assert(paused.nodes.get('.pos-controls').innerHTML.includes('Save &amp; return to modes'));
  const review=render(E.finish(r,'ended',2000));
  assert(review.reviewed);assert(review.classes.has('screen--positional-review'));assert(!review.classes.has('screen--play'));
  assert(!review.root.innerHTML.includes('class="stage'));
}
for(const variant of ['timed','survival','fixed','theme']){
  const inputs=Object.fromEntries(Object.entries({variant,choices:'3',board:'2d',theme:'all',size:'0'}).map(([k,v])=>[k,{value:v}]));
  const nodes=new Map();let route;
  const root={innerHTML:'',addEventListener(){},querySelectorAll(){return []},querySelector(selector){const m=selector.match(/^\[name=(\w+)\](?::checked)?$/);if(m)return inputs[m[1]];if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector)}};
  createSetup(root,{persistence:{get:()=>null},go:p=>route=p});
  assert(root.innerHTML.includes('mode-list'));assert(root.innerHTML.includes('segmented segmented--block'));assert(root.innerHTML.includes('action-bar__inner'));
  await root.onclick({target:{closest:s=>s==='[data-start]'?{}:null}});
  const params=new URLSearchParams(route.split('?')[1]);assert.equal(params.get('variant'),variant);
  assert.equal(params.get('choices'),['timed','survival'].includes(variant)?'2':'3');assert.equal(params.get('board'),'2d');
}
console.log('Shared setup controls, fixed play layout, 2/3 choice rendering, paused board and separate review contracts passed');

const css=fs.readFileSync(new URL('../css/app.css',import.meta.url),'utf8');
assert.match(css,/@media \(max-width:360px\)[\s\S]*grid-template-columns:var\(--tap-min\) var\(--tap-min\) minmax\(0,1fr\) var\(--tap-min\)/);
assert.match(css,/screen--positional > \.pos-action-bar \{ overflow:auto; align-content:start/);
console.log('Small-header space and top-aligned short-landscape action guards present');
