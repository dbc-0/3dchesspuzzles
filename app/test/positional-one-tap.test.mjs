import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/positional-engine.js';
import catalog from '../data/positional/catalog.js';
import {LETTERS} from '../js/positional-core.js';
const source=fs.readFileSync(new URL('../js/modes/positional.js',import.meta.url),'utf8');
const handlers=source.slice(source.indexOf('  function submit('),source.indexOf("  root.addEventListener('click'"));
function harness(choiceCount){
 const initial=E.resume(E.newRun(catalog,{variant:'fixed',choiceCount,board:'2d'},{seed:42}),Date.now());
 return Function('E','data','LETTERS','initial',`let run=initial,selected=null,feedback='',feedbackTimer=0,stopped=false,storageError='',filter='all',reviewIndex=0,lineIndex=0,notified=false,readOnlyReview=false;const store={},ctx={},persist=()=>true,complete=()=>{},render=()=>{},stop=()=>{run=E.pause(run)},finish=()=>{run=E.finish(run)};let timer;const setTimeout=fn=>(timer=fn,1);${handlers}return {click,key,get run(){return run},advance(){timer?.()},stop(){stopped=true},storageFail(){storageError='full'}}`)(E,catalog,LETTERS,initial);
}
const choiceEvent=(uci,detail=1)=>({detail,target:{closest:s=>s==='[data-choice]'?{dataset:{choice:uci}}:null}});
const keyEvent=(key,extra={})=>({key,target:{closest:()=>null},preventDefault(){this.prevented=true},...extra});
for(const count of [2,3]){
 const h=harness(count),first=h.run.deck[0];
 h.click(choiceEvent(first.options[0]));assert.equal(h.run.attempts.length,1);assert.equal(h.run.attempts[0].selectedUci,first.options[0]);
 h.click(choiceEvent(first.options[0],2));h.key(keyEvent('B'));assert.equal(h.run.attempts.length,1,'feedback blocks any extra answer');
 h.advance();h.click(choiceEvent(h.run.deck[1].options[0],2));assert.equal(h.run.attempts.length,1,'second click in double-click is ignored even after feedback');
 h.key(keyEvent('B',{repeat:true}));h.key(keyEvent('A',{ctrlKey:true}));h.key(keyEvent('A',{metaKey:true}));h.key(keyEvent('A',{target:{closest:()=>({})}}));assert.equal(h.run.attempts.length,1);
 if(count===2){h.key(keyEvent('C'));assert.equal(h.run.attempts.length,1);}
 const e=keyEvent('B');h.key(e);assert(e.prevented);assert.equal(h.run.attempts.length,2);assert.equal(h.run.attempts[1].selectedUci,h.run.deck[1].options[1]);
 h.advance();h.storageFail();h.key(keyEvent('A'));assert.equal(h.run.attempts.length,2);
 const stopped=harness(count);stopped.stop();stopped.click(choiceEvent(stopped.run.deck[0].options[0]));assert.equal(stopped.run.attempts.length,0);
}
let old=E.newRun(catalog,{variant:'fixed',choiceCount:3,board:'2d'},{seed:9,now:1000});delete old.answerStyle;
const legacyKey=E.comparisonKey(old),fresh=E.useSingleTap(old);assert.notEqual(E.comparisonKey(fresh),legacyKey);assert.equal(fresh.answerStyle,'single-tap');
old=E.answer(E.resume(old,2000),catalog,old.deck[0].options[0],3000);
const oldBytes=JSON.stringify(old),mixed=E.useSingleTap(old);assert.equal(JSON.stringify(old),oldBytes);assert.equal(mixed.answerStyle,'mixed');assert.equal(mixed.singleTapAfterAttempts,1);assert.deepEqual(mixed.attempts,old.attempts);E.validateRun(mixed,catalog);
assert.notEqual(E.comparisonKey(mixed),E.comparisonKey(fresh));
const completed=E.finish(old,'ended',4000);assert.strictEqual(E.useSingleTap(completed),completed);
assert.throws(()=>E.validateRun({...mixed,singleTapAfterAttempts:99},catalog));
const next=E.nextCycle(E.finish(mixed,'ended',4000),catalog);assert.equal(next.answerStyle,'single-tap');assert.equal(next.singleTapAfterAttempts,undefined);
console.log('One-tap 2/3 choice scoring, keyboard, double-click/held-key guards, paused/storage/stopped guards, and historical timing separation passed');
