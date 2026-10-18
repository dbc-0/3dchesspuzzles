import {validateDataset, seededRandom, shuffle, positionKey} from './positional-core.js';

// Pure state machine. The shell owns storage; the mode owns presentation.
export const STORAGE_KEY = 'tt.positional.v1';
export const VARIANTS = ['timed', 'survival', 'fixed', 'theme'];
const copy = value => JSON.parse(JSON.stringify(value));
const assert = (ok, message) => { if (!ok) throw new Error(`Positional: ${message}`); };
const finite = n => Number.isFinite(n) && n >= 0;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function validateCatalog(catalog) {
  validateDataset(catalog);
  assert(typeof catalog.version === 'string' && catalog.version, 'missing version');
  assert(catalog.cases.every(p => p.options.length === 3 && p.options.every(o=>typeof o.isBad==='boolean')), 'master cards require three choices');
  assert(new Set(catalog.cases.map(p=>positionKey(p.fen))).size===catalog.cases.length,'duplicate board positions');
  catalog.cases.forEach(binaryControl);
  return true;
}

// Compare only measured, mover-POV engine values. These are not puzzle ratings.
export function binaryControl(p) {
  const controls=p.options.filter(o=>!o.isBad);
  assert(controls.every(o=>Number.isFinite(o.validation?.stockfishCpMover) && (o.validation.stockfishNodeBudget??o.validation.stockfishNodes)>=10000000),'binary controls need recorded 10M-budget scores');
  const cp = o => o.validation.stockfishCpMover;
  const probability = o => Number.isFinite(o.selectionEvidence?.maiaPolicyProbability) ? o.selectionEvidence.maiaPolicyProbability : -1;
  return p.options.filter(o => !o.isBad).slice().sort((a,b) => cp(b)-cp(a) || probability(b)-probability(a) || a.uci.localeCompare(b.uci))[0];
}
export function eligibleCases(catalog, theme = 'all') {
  const group=catalog.practiceThemes?.find(g=>g.id===theme);
  return catalog.cases.filter(p => theme === 'all' || (p.themeIds || []).includes(theme) || group?.tags.some(t=>(p.themeIds||[]).includes(t)));
}
export function comparisonKey(run) {
  return [run.version, run.config.variant, run.config.theme, run.config.choiceCount, run.config.size, run.config.board].join(':');
}
function makeDeck(catalog, config, seed, previous = null) {
  const rng = seededRandom(seed);
  let cases = eligibleCases(catalog, config.theme);
  assert(cases.length, 'no approved cards for this theme');
  if (config.size === 100) assert(cases.length >= 100, '100 unique approved cards are not ready');
  // Fixed membership/order persists across cycles; random modes reshuffle per pass.
  cases = config.variant === 'fixed' ? cases.slice(0, config.size === 100 ? 100 : cases.length) : shuffle(cases, rng);
  return cases.map(p => {
    const controls = config.choiceCount === 2 ? [binaryControl(p)] : p.options.filter(o => !o.isBad);
    const moves = [p.options.find(o => o.isBad), ...controls].map(o => o.uci);
    let options = shuffle(moves, rng);
    const old = previous?.find(d => d.id === p.id)?.options;
    if (old?.length === moves.length && old.every(m => moves.includes(m)) && options.some((m,i) => m === old[i])) {
      const shift = 1 + Math.floor(rng() * (moves.length - 1));
      options = old.map((_,i) => old[(i+shift)%old.length]);
    }
    return {id:p.id, options};
  });
}
export function newRun(catalog, config = {}, {seed = Date.now()>>>0, now = Date.now(), cycleNumber = 1, previous = null} = {}) {
  validateCatalog(catalog);
  assert(VARIANTS.includes(config.variant), 'unknown mode');
  assert(finite(now) && Number.isInteger(seed), 'invalid clock/seed');
  const rush = ['timed','survival'].includes(config.variant);
  config = {variant:config.variant, choiceCount:rush ? 2 : config.choiceCount === 2 ? 2 : 3,
    theme:config.theme || 'all', size:config.size === 100 ? 100 : 0, board:config.board === '3d' ? '3d' : '2d'};
  return {schema:1, version:catalog.version, config, seed:seed>>>0, cycleNumber,
    status:'paused', reason:'ready', startedAt:now, endedAt:null, runningSince:null,
    activeMs:0, questionMs:0, score:0, mistakes:0, index:0, round:0,
    deck:makeDeck(catalog,config,seed,previous), attempts:[]};
}
export function checkpoint(run, now = Date.now()) {
  if (run.status !== 'playing') return run;
  assert(finite(now), 'invalid clock');
  const through = Math.max(now,run.runningSince), delta = through-run.runningSince;
  return {...run, activeMs:run.activeMs+delta, questionMs:run.questionMs+delta, runningSince:through};
}
export function pause(run, now = Date.now(), reason = 'manual') {
  if (run.status !== 'playing') return run;
  return {...checkpoint(run,now), status:'paused', runningSince:null, reason};
}
export function resume(run, now = Date.now()) {
  if (run.status !== 'paused') return run;
  return {...run,status:'playing',runningSince:now,reason:null};
}
export function remaining(run, now = Date.now()) {
  return run.config.variant === 'timed' ? Math.max(0,300000-checkpoint(run,now).activeMs) : Infinity;
}
export function finish(run, reason = 'ended', now = Date.now()) {
  if (run.status === 'complete') return run;
  return {...checkpoint(run,now),status:'complete',runningSince:null,reason,endedAt:now};
}
export function answer(run,catalog,uci,now = Date.now()) {
  if (run.status !== 'playing') return run;
  if (remaining(run,now) <= 0) return finish(run,'time',now);
  run = checkpoint(run,now);
  const item=run.deck[run.index], p=catalog.cases.find(p=>p.id===item.id);
  assert(item.options.includes(uci),'unknown choice');
  const correct = p.options.find(o=>o.uci===uci).isBad;
  let out = {...run, status:'paused',reason:'feedback',runningSince:null,questionMs:0,
    score:run.score+Number(correct),mistakes:run.mistakes+Number(!correct),index:run.index+1,
    attempts:[...run.attempts,{id:p.id,options:item.options.slice(),selectedUci:uci,correct,answerMs:run.questionMs,elapsedMs:run.activeMs}]};
  if (['timed','survival'].includes(run.config.variant) && out.mistakes >= 3) return finish(out,'mistakes',now);
  if (out.index === out.deck.length) {
    if (run.config.variant === 'fixed') return finish(out,'complete',now);
    const round=run.round+1, deck=makeDeck(catalog,run.config,(run.seed+round*2654435761)>>>0,run.deck);
    // No immediate repeated card across two shuffled passes, when possible.
    if (deck.length>1 && deck[0].id===item.id) [deck[0],deck[1]]=[deck[1],deck[0]];
    out={...out,index:0,round,deck};
  }
  return out;
}
export function nextCycle(run,catalog,{seed=Date.now()>>>0,now=Date.now()}={}) {
  assert(run.status==='complete','finish this cycle first');
  assert(run.config.variant==='fixed','only fixed sets have cycles');
  return newRun(catalog,run.config,{seed,now,cycleNumber:run.cycleNumber+1,previous:run.deck});
}
export function validateRun(run,catalog) {
  assert(run && run.schema===1 && run.version===catalog.version,'saved version mismatch');
  assert(VARIANTS.includes(run.config?.variant) && [2,3].includes(run.config.choiceCount),'invalid saved mode');
  assert(['2d','3d'].includes(run.config.board) && [0,100].includes(run.config.size),'invalid saved configuration');
  if(['timed','survival'].includes(run.config.variant))assert(run.config.choiceCount===2 && run.config.theme==='all','invalid rush choices');
  assert(['playing','paused','complete'].includes(run.status),'invalid saved status');
  if(run.status==='complete')assert(finite(run.endedAt)&&['time','mistakes','complete','ended'].includes(run.reason),'invalid completed state');
  else assert(run.endedAt===null,'unfinished state has end time');
  if(run.status==='playing')assert(run.reason===null,'invalid playing state');
  if(run.status==='paused')assert(typeof run.reason==='string' && run.reason,'paused state needs reason');
  assert([run.activeMs,run.questionMs,run.startedAt].every(finite),'invalid saved time');
  assert(run.status==='playing' ? finite(run.runningSince) : run.runningSince===null,'invalid saved clock');
  assert(Number.isInteger(run.seed)&&run.seed>=0&&run.seed<=0xffffffff,'invalid saved seed');
  assert(Number.isInteger(run.cycleNumber)&&run.cycleNumber>0 && Number.isInteger(run.round)&&run.round>=0,'invalid cycle');
  assert(Array.isArray(run.deck)&&run.deck.length && new Set(run.deck.map(d=>d.id)).size===run.deck.length,'invalid deck');
  const checkItem = item => {
    const p=catalog.cases.find(p=>p.id===item.id);
    assert(p && Array.isArray(item.options) && new Set(item.options).size===run.config.choiceCount && item.options.length===run.config.choiceCount,'invalid saved options');
    assert(item.options.every(m=>p.options.some(o=>o.uci===m)) && item.options.includes(p.options.find(o=>o.isBad).uci),'invalid saved choices');
    if(run.config.choiceCount===2) assert(item.options.includes(binaryControl(p).uci),'saved binary control differs');
    return p;
  };
  run.deck.forEach(checkItem);
  let expected=eligibleCases(catalog,run.config.theme);
  if(run.config.variant==='fixed' && run.config.size===100){assert(expected.length>=100,'saved fixed100 is incomplete');expected=expected.slice(0,100);}
  assert(expected.length===run.deck.length && expected.every(p=>run.deck.some(d=>d.id===p.id)),'saved deck membership differs');
  assert(Number.isInteger(run.index)&&run.index>=0&&run.index<=run.deck.length,'invalid index');
  assert(run.index<run.deck.length || run.status==='complete','missing current card');
  assert(Array.isArray(run.attempts),'missing attempts');
  let score=0,elapsed=0,answerTime=0;
  for (const a of run.attempts) {
    const p=checkItem(a); assert(a.options.includes(a.selectedUci),'invalid saved answer');
    assert(a.correct===p.options.find(o=>o.uci===a.selectedUci).isBad,'saved scoring differs');
    assert(finite(a.answerMs)&&finite(a.elapsedMs)&&a.elapsedMs>=elapsed,'invalid answer time');
    assert(Math.abs(a.elapsedMs-elapsed-a.answerMs)<0.01,'answer duration differs');
    elapsed=a.elapsedMs; answerTime+=a.answerMs; score+=Number(a.correct);
  }
  assert(score===run.score&&run.mistakes===run.attempts.length-score,'invalid totals');
  assert(run.activeMs>=elapsed && run.questionMs<=run.activeMs,'invalid elapsed total');
  assert(Math.abs(run.activeMs-answerTime-run.questionMs)<0.01,'saved total time differs');
  if(run.config.variant==='fixed') {
    assert(run.round===0&&run.index===run.attempts.length,'fixed progress differs');
    assert(run.attempts.every((a,i)=>a.id===run.deck[i].id&&same(a.options,run.deck[i].options)),'fixed answer order differs');
  } else assert(run.round*run.deck.length+run.index===run.attempts.length,'random progress differs');
  if(run.reason==='complete')assert(run.config.variant==='fixed'&&run.index===run.deck.length,'incomplete fixed finish');
  if(run.reason==='mistakes')assert(['timed','survival'].includes(run.config.variant)&&run.mistakes===3,'invalid mistake finish');
  if(run.reason==='time')assert(run.config.variant==='timed'&&run.activeMs>=300000,'invalid timed finish');
  return true;
}
export const emptyStore = () => ({schema:1,corpora:{},active:null,history:[]});
export function parseStore(raw) {
  if(raw===null) return emptyStore();
  const s=JSON.parse(raw);
  assert(s?.schema===1&&s.corpora&&Array.isArray(s.history),'invalid saved data; original bytes kept');
  assert(!s.active || s.active.status!=='complete','completed active run');
  assert(s.history.every(r=>r?.status==='complete'),'unfinished history');
  for(const c of Object.values(s.corpora)) validateCatalog(c);
  for(const r of [...s.history,...(s.active?[s.active]:[])]) {
    assert(s.corpora[r.version],'saved corpus missing'); validateRun(r,s.corpora[r.version]);
  }
  return s;
}
export function saveRun(store,run,catalog) {
  validateRun(run,catalog);
  assert(!store.corpora[catalog.version] || same(store.corpora[catalog.version],catalog),'same version has changed content');
  const out={...store,corpora:{...store.corpora,[catalog.version]:copy(catalog)},active:copy(run),history:store.history.slice()};
  if(run.status==='complete') {
    const key=r=>[r.version,r.startedAt,r.seed,r.cycleNumber].join(':');
    if(!out.history.some(r=>key(r)===key(run)))out.history.push(copy(run));
    if(!store.active || key(store.active)===key(run))out.active=null;
    else out.active=store.active;
  }
  return out;
}
