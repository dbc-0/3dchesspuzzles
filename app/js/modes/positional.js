import catalog from '../../data/positional/catalog.js';
import * as E from '../positional-engine.js';
import {LETTERS,COLORS,formatTime,lineFrames,sourceRatingText,selectionEvidenceText} from '../positional-core.js';

export const meta={id:'positional',title:'Positional',boardOptions:{board:'2d'}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration=ms=>`${(ms/1000).toFixed(1)}s`;
const label=v=>({timed:'5-minute Rush',survival:'Survival',fixed:'Fixed-cycle study',theme:'Theme practice'}[v]||v);
const themeOptions=()=>`<option value="all">All themes</option>${(catalog.practiceThemes||catalog.themes||[]).filter(t=>E.eligibleCases(catalog,t.id).length).map(t=>`<option value="${esc(t.id)}">${esc(t.label)} (${E.eligibleCases(catalog,t.id).length})</option>`).join('')}`;

export function createSetup(root,{persistence,go,board='2d',confirm,notify}) {
  let saved=null,error='',savedRaw;
  try{savedRaw=persistence.get();saved=E.parseStore(savedRaw);}catch(e){error=e.message;}
  root.innerHTML=`<header class="app-bar"><button class="btn" data-home>Home</button><h1>Positional</h1></header>
    <div class="screen-body u-scroll"><div class="screen-body__inner pos-setup">
    <p>Choose the inferior quiet move. Review the explanation after your run.</p>
    <p>${catalog.cases.length} approved three-choice positions available. Difficulty is provisional. Repeated passes reuse this finite pool.</p>
    <label>Mode<select name="variant"><option value="timed">5-minute Rush · 3 mistakes · 2 choices</option><option value="survival">Survival · 3 mistakes · 2 choices</option><option value="fixed">Fixed-cycle study · all positions</option><option value="theme">Continuous theme practice</option></select></label>
    <label data-choice-label>Study choices<select name="choices"><option value="3">3 moves · 1 bad + 2 good</option><option value="2">2 moves · 1 bad + 1 good</option></select></label>
    <label data-theme-label>Theme<select name="theme">${themeOptions()}</select><small data-theme-tags></small></label>
    <label data-size-label>Fixed set<select name="size"><option value="0">Starter set · ${catalog.cases.length} positions</option><option value="100" ${catalog.cases.length<100?'disabled':''}>100 unique positions${catalog.cases.length<100?' · not ready yet':''}</option></select></label>
    <label>Board<select name="board"><option value="2d">2D</option><option value="3d">3D</option></select></label>
    <button class="btn btn--primary" data-start ${error?'disabled':''}>Start</button>
    <p class="pos-small">Fixed cycles pin their corpus, move choices and board setting. Letters change each cycle. Times are active wall-clock time, excluding pauses, hidden tabs and review, not a measurement of pure thinking. Results stay on this device.</p>
    ${error?`<p role="alert">Saved training could not be read: ${esc(error)}. Original data was kept.</p>`:''}
    ${saved?.active?`<button class="btn" data-resume>Resume saved ${esc(label(saved.active.config.variant))} · ${saved.active.attempts.length} answered · ${saved.active.config.choiceCount} choices</button>`:''}
    ${saved?.active?.config.board==='3d'?'<button class="btn" data-recover>Continue saved run in 2D · keep progress</button>':''}
    ${saved?.history.length?`<h2>Previous runs</h2><div class="pos-history">${saved.history.map((r,i)=>`<button class="btn" data-history="${i}">${esc(label(r.config.variant))} · ${r.score}/${r.attempts.length} · ${r.config.choiceCount} choices · ${r.config.board.toUpperCase()} · ${formatTime(r.activeMs)}${r.config.variant==='fixed'?` · cycle ${r.cycleNumber}`:''}</button>`).reverse().join('')}</div>`:''}
    <details><summary>Content and sources</summary><p>${esc(catalog.limits?.join(' ')||'Teaching sample. No measured puzzle ratings.')}</p><p>Chess positions from Lichess games (CC0). Authored teaching commentary. Engine checks: Stockfish 17.1. Human-model illustrations: Maia3-79M where labeled; engine fallbacks are labeled separately. No engine or model runs in this app.</p></details>
    </div></div>`;
  root.querySelector('[name=board]').value=board;
  const sync=()=>{
    const v=root.querySelector('[name=variant]').value,rush=['timed','survival'].includes(v);
    root.querySelector('[data-choice-label]').hidden=rush;
    root.querySelector('[data-theme-label]').hidden=rush;
    root.querySelector('[data-size-label]').hidden=v!=='fixed';
    const theme=root.querySelector('[name=theme]').value;
    const group=catalog.practiceThemes?.find(g=>g.id===theme);
    root.querySelector('[data-theme-tags]').textContent=group?group.tags.map(t=>catalog.themes.find(x=>x.id===t)?.label||t).join(' · '):'';
    const count=E.eligibleCases(catalog,theme).length;
    root.querySelector('[name=size] option[value="0"]').textContent=`Starter set · ${count} positions`;
    root.querySelector('[name=size] option[value="100"]').disabled=count<100;
    if(count<100)root.querySelector('[name=size]').value='0';
  };
  root.addEventListener('change',sync);sync();
  root.onclick=async e=>{
    if(e.target.closest('[data-home]'))go('#/');
    if(e.target.closest('[data-start]')){
      if(saved?.active){
        if(!confirm||!await confirm({title:'Start a new run?',text:'The unfinished run will end. Its answered positions stay in review.',confirmLabel:'End old run and start',cancelLabel:'Keep saved run'}))return;
        try{const updated=E.endSavedRun(saved),next=JSON.stringify(updated);if(!persistence.compareAndSet(savedRaw,next))throw new Error('Saved progress changed or storage is full. Reopen Modes before starting.');saved=updated;savedRaw=next;}catch(e){notify?.(e.message,{kind:'error'});return;}
      }
      const p=new URLSearchParams({mode:'positional'});
      for(const k of ['variant','choices','theme','size','board'])p.set(k,root.querySelector(`[name=${k}]`).value);
      if(['timed','survival'].includes(p.get('variant')))p.set('choices','2');
      go(`#/play?${p}`);
    }
    if(e.target.closest('[data-recover]'))go('#/play?mode=positional&resume=1&recover2d=1&board=2d');
    if(e.target.closest('[data-resume]'))go(`#/play?mode=positional&resume=1&board=${saved.active.config.board}`);
    const h=e.target.closest('[data-history]');if(h)go(`#/play?mode=positional&history=${h.dataset.history}&board=${saved.history[Number(h.dataset.history)].config.board}`);
  };
}

export function createMode(ctx) {
  const {root,board,boardEl}=ctx;
  root.classList.add('screen--positional');
  let raw=ctx.persistence.get(),store=E.parseStore(raw),run,data=catalog;
  let selected=null,feedback='',feedbackTimer=0,stopped=false,storageError='',filter='all',reviewIndex=0,lineIndex=0,lineType='illustrative';
  let notified=false,readOnlyReview=false;
  const historyIndex=ctx.config.history;
  if(Number.isInteger(historyIndex)&&store.history[historyIndex]) {
    run=store.history[historyIndex];data=store.corpora[run.version];notified=true;readOnlyReview=true;
  }else if(store.active){
    run=store.active;data=store.corpora[run.version];run={...run,status:'paused',reason:'restored',runningSince:null};
  }else{
    if(store.active)throw new Error('A saved positional run exists. Resume it from Positional setup first.');
    run=E.newRun(catalog,{variant:ctx.config.variant,choiceCount:ctx.config.choices,theme:['timed','survival'].includes(ctx.config.variant)?'all':ctx.config.theme,size:ctx.config.size,board:ctx.settings.board});
  }
  if(ctx.config.recover2d&&run.status!=='complete')run=E.recoverIn2D(run);
  E.validateRun(run,data);
  board.setInteractive?.(false);
  function persist(){
    if(readOnlyReview)return true;
    if(storageError)return false;
    try{
      const updated=E.saveRun(store,run,data),next=JSON.stringify(updated);
      if(!ctx.persistence.compareAndSet(raw,next))throw new Error('Storage changed in another tab or is full. This run is paused; previous saved data is kept.');
      store=updated;raw=next;return true;
    }catch(e){run=E.pause(run,Date.now(),'storage');storageError=e.message;return false;}
  }
  function stop(reason='manual'){
    clearTimeout(feedbackTimer);feedbackTimer=0;
    run=E.pause(run,Date.now(),reason);if(run.status==='paused')run={...run,reason};persist();render();
  }
  function finish(reason){
    clearTimeout(feedbackTimer);run=E.finish(run,reason);persist();complete();render();
  }
  function complete(){
    if(notified||run.status!=='complete')return;notified=true;
    ctx.onFinish({score:run.score,history:run.attempts,inlineReview:true,choiceCount:run.config.choiceCount,corpusVersion:run.version,activeMs:run.activeMs,config:run.config,comparisonKey:E.comparisonKey(run),reviewIndex:store.history.findIndex(r=>r.version===run.version&&r.seed===run.seed&&r.startedAt===run.startedAt&&r.cycleNumber===run.cycleNumber)});
  }
  function boardAt(p,options=null){
    board.clearHighlights();board.clearArrows();
    board.setOrientation(p.sideToMove==='black'?'black':'white');board.setPosition(p.fen);
    if(options)options.forEach((uci,i)=>board.arrow(uci.slice(0,2),uci.slice(2,4),null,{label:LETTERS[i],color:COLORS[i],opacity:selected===null||selected===uci?1:0.25}));
  }
  function render(){
    if(stopped)return;
    const complete=run.status==='complete',item=run.deck[run.index],p=!complete&&data.cases.find(p=>p.id===item.id);
    root.innerHTML=`<header class="app-bar"><div class="app-bar__title" data-shell="header">Positional</div></header>
      <div class="pos-content u-scroll"><div class="pos-top"><strong>${esc(label(run.config.variant))}</strong><span>${run.config.choiceCount} choices${run.config.theme!=='all'?` · ${esc([...(data.practiceThemes||[]),...(data.themes||[])].find(t=>t.id===run.config.theme)?.label||run.config.theme)}`:''}${run.config.variant==='fixed'?` · cycle ${run.cycleNumber}`:''}</span></div>
      <div class="pos-status" aria-live="polite">${run.score}/${run.attempts.length} correct${['timed','survival'].includes(run.config.variant)?` · ${3-run.mistakes} lives`:''} <span data-clock>${run.config.variant==='timed'?formatTime(E.remaining(run)):formatTime(E.checkpoint(run).activeMs)}</span></div>
      ${complete?'':`<p class="pos-prompt">${p.sideToMove==='black'?'Black':'White'} to move · choose the inferior move${run.config.variant==='fixed'?` · ${run.index+1}/${run.deck.length}`:''}</p>`}
      <div class="pos-board"></div><section class="pos-controls"></section>
      ${storageError?`<p role="alert">${esc(storageError)} Keep this tab open to review the in-memory result.</p>`:''}
      </div>`;
    root.querySelector('.pos-board').appendChild(boardEl);
    const controls=root.querySelector('.pos-controls');
    if(complete){renderReview(controls);return;}
    boardAt(p,item.options);
    root.querySelector('.pos-board').hidden=run.status==='paused'&&run.reason!=='feedback';
    if(run.status==='paused'&&run.reason!=='feedback'){
      controls.innerHTML=`<p>${run.reason==='ready'?'Ready. The clock starts when you begin.':'Paused. Your progress is saved on this device.'}</p><button class="btn btn--primary" data-action="resume" ${storageError?'disabled':''}>${run.reason==='ready'?'Begin':'Resume'}</button><button class="btn" data-action="end">End and review</button>${run.reason!=='ready'?'<a class="btn" href="#/positional">Save &amp; return to modes</a>':''}`;
    }else{
      controls.innerHTML=`<div class="pos-choices" style="--choices:${item.options.length}">${item.options.map((uci,i)=>`<button class="btn pos-choice ${selected===uci?'is-selected':''}" data-choice="${uci}" aria-pressed="${selected===uci}" ${run.status!=='playing'?'disabled':''} style="--choice:${COLORS[i]}"><strong>${LETTERS[i]}</strong><span>${esc(p.options.find(o=>o.uci===uci).san)}</span></button>`).join('')}</div>
      <button class="btn btn--primary pos-submit" data-action="submit" ${!selected||run.status!=='playing'?'disabled':''}>Submit choice</button>
      <p class="pos-feedback" role="status">${esc(feedback||'Tap a move to preview, then submit.')}</p>
      <div class="pos-actions"><button class="btn" data-action="pause">Pause &amp; save</button><button class="btn" data-action="end">End and review</button></div>`;
    }
    requestAnimationFrame(()=>{if(!stopped)board.resize();});
  }
  function renderReview(el){
    const filtered=run.attempts.map((a,i)=>({a,i})).filter(({a})=>filter!=='misses'||!a.correct);
    if(!filtered.some(x=>x.i===reviewIndex))reviewIndex=filtered[0]?.i??0;
    const a=run.attempts[reviewIndex],p=a&&data.cases.find(p=>p.id===a.id);
    el.innerHTML=`<h2>Run review · ${run.attempts.length?Math.round(run.score/run.attempts.length*100):0}%</h2><p>${duration(run.activeMs)} active time · ${esc(run.version)} · ${run.config.choiceCount} choices</p>
      ${run.boardRecovery?`<p class="pos-small">Recovered from 3D to 2D after ${run.boardRecovery.afterAttempts} answers. This run is kept separate from unchanged-board comparisons.</p>`:''}
      <div class="pos-actions"><button class="btn" data-filter="all" aria-pressed="${filter==='all'}">All (${run.attempts.length})</button><button class="btn" data-filter="misses" aria-pressed="${filter==='misses'}">Misses (${run.mistakes})</button></div>
      <div class="pos-review-tabs">${filtered.map(({a,i})=>`<button class="btn" data-review="${i}" aria-pressed="${i===reviewIndex}">${i+1} ${a.correct?'✓':'×'}</button>`).join('')}</div>
      ${!filtered.length?`<p>${filter==='misses'?'No misses in this run.':'No positions answered.'}</p>`:''}
      <div class="pos-review-body"></div>
      <div class="pos-actions">${run.config.variant==='fixed'&&run.reason==='complete'?'<button class="btn btn--primary" data-action="repeat">Repeat this fixed set</button>':''}<a class="btn" href="#/positional">Modes &amp; history</a></div>
      ${run.config.variant==='fixed'&&run.version!==catalog.version?'<p>A newer catalog is available in Modes. This cycle and Repeat keep the pinned version.</p>':''}`;
    if(!filtered.length){board.clearArrows();board.clearHighlights();root.querySelector('.pos-board').hidden=true;return;}
    root.querySelector('.pos-board').hidden=false;
    const bad=p.options.find(o=>o.isBad),chosen=p.options.find(o=>o.uci===a.selectedUci);
    const body=el.querySelector('.pos-review-body');
    body.innerHTML=`<p><strong>${a.correct?'Correct':'Missed'}</strong> · ${duration(a.answerMs)} · you chose ${esc(chosen.san)}; inferior move: ${esc(bad.san)}</p>
      <p><strong>${esc(p.difficulty?.label||'Provisional difficulty')}</strong>${p.difficulty?.provisional&&!/provisional/i.test(p.difficulty.label||'')?' · provisional':''}</p>
      <p class="pos-small">Practice tags: ${(p.themeIds||[]).map(t=>esc(data.themes?.find(x=>x.id===t)?.label||t)).join(' · ')}</p>
      <p>${esc(p.explanation?.text||'')}</p>
      ${(p.explanation?.tags||[]).map(t=>`<section><h3>${esc(t.tag)}</h3><p>${esc(t.before)}</p><p>${esc(t.after)}</p><p>${esc(t.commentary)}</p></section>`).join('')}
      <h3>Why the other moves are okay</h3>${p.options.filter(o=>!o.isBad&&a.options.includes(o.uci)).map(o=>`<p><strong>${esc(o.san)}</strong>: ${esc(p.explanation?.alternatives?.[o.uci]||'See source checks below.')}</p>`).join('')}
      <div class="pos-line"><label>Line<select data-line-type><option value="illustrative">${p.illustrative?.sourceType==='engine'?'Stockfish illustration':'Maia illustration'}</option><option value="benchmark">Stockfish diagnostic</option></select></label><p data-line-note></p><div class="pos-actions"><button class="btn" data-action="root">Position</button><button class="btn" data-action="line-prev">Previous</button><button class="btn" data-action="line-next">Next</button><span data-line-counter></span></div></div>
      <details><summary>Source and control checks</summary><p>${esc(sourceRatingText(p.source))}</p><p>${esc(p.source?.verification||p.source?.note||'')}</p><p>Evidence version: ${esc(p.validation?.historicalSourceVersion||data.version)}. ${esc(p.validation?.projectionNote||'')}</p>${p.source?.url&&/^https:\/\/lichess\.org\//.test(p.source.url)?`<p><a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer">Original game</a></p>`:''}<p>${esc(p.validation?.notes?.join?.(' ')||p.validation?.notes||'')}</p>${p.options.map(o=>`<p><strong>${esc(o.san)}</strong> ${esc(selectionEvidenceText({...o.selectionEvidence,stockfishCpMover:o.selectionEvidence?.stockfishCpMover??o.validation?.stockfishCpMover})||`Stockfish: ${o.validation?.stockfishCpMover??'not recorded'} cp, moving side.`)} ${o.validation?.stockfishNodeBudget?`Recorded node budget: ${o.validation.stockfishNodeBudget.toLocaleString()}.`:''}</p>`).join('')}<p>Binary mode uses the highest recorded engine score among the two approved controls; measured Maia probability and UCI break ties. Legacy cards retain their original evidence and are not relabeled as passing the newer strict protocol. Source player ratings are not puzzle difficulty.</p></details>`;
    body.querySelector('[data-line-type]').value=lineType;
    showLine(p,a);
    requestAnimationFrame(()=>{if(!stopped)board.resize();});
  }
  function showLine(p,a){
    const line=p[lineType];
    const frames=lineFrames(p,line||{});
    board.clearHighlights();board.clearArrows();board.setOrientation(p.sideToMove==='black'?'black':'white');
    if(lineIndex<0){boardAt(p,a.options);}
    else{lineIndex=Math.min(lineIndex,frames.length-1);board.setPosition(frames[lineIndex]);}
    root.querySelector('[data-line-note]').textContent=`${line?.model||line?.engine||'Stockfish'}${line?.selfRating?` (${line.selfRating}/${line.opponentRating} conditioned)`:''}. ${line?.note||''} ${(line?.lineSan||[]).join(' ')}`;
    root.querySelector('[data-line-counter]').textContent=lineIndex<0?'Starting position':`${lineIndex}/${frames.length-1} plies after ${line?.startsAfterUci?p.options.find(o=>o.uci===line.startsAfterUci)?.san||'candidate':'line start'}`;
  }
  function submit(){
    if(!selected||run.status!=='playing'||storageError)return;
    run=E.answer(run,data,selected);selected=null;
    feedback=run.attempts.at(-1)?.correct?'Correct':'Incorrect';persist();complete();render();
    if(run.status==='paused'&&run.reason==='feedback')feedbackTimer=setTimeout(()=>{
      feedbackTimer=0;if(stopped||storageError||run.reason!=='feedback')return;
      run=E.resume(run);feedback='';persist();render();
    },450);
  }
  function click(e){
    const choice=e.target.closest('[data-choice]');
    if(choice&&run.status==='playing'){selected=choice.dataset.choice;render();return;}
    const tab=e.target.closest('[data-review]');if(tab){reviewIndex=Number(tab.dataset.review);lineIndex=-1;render();return;}
    const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;lineIndex=-1;render();return;}
    switch(e.target.closest('[data-action]')?.dataset.action){
      case 'resume':run=E.resume(run);feedback='';persist();render();break;
      case 'pause':stop();break;
      case 'submit':submit();break;
      case 'end':finish('ended');break;
      case 'repeat':
        if(store.active){storageError='Another run is saved. Resume it from Modes first.';render();break;}
        readOnlyReview=false;run=E.nextCycle(run,data);ctx.onCycleStart?.(run.config);selected=null;feedback='';filter='all';notified=false;persist();render();break;
      case 'root':lineIndex=-1;render();break;
      case 'line-prev':lineIndex=Math.max(-1,lineIndex-1);render();break;
      case 'line-next':lineIndex++;render();break;
    }
  }
  function key(e){
    if(e.target.closest?.('input,select,textarea')||e.target.isContentEditable)return;
    const i=LETTERS.indexOf(e.key.toUpperCase());
    if(run.status==='playing'&&i>=0&&i<run.config.choiceCount){selected=run.deck[run.index].options[i];render();e.preventDefault();}
    if(e.key==='Enter'&&run.status==='playing'&&(!e.target.closest?.('button,a')||e.target.matches?.('[data-choice]'))){submit();e.preventDefault();}
  }
  root.addEventListener('click',click);
  const change=e=>{if(e.target.matches('[data-line-type]')){lineType=e.target.value;lineIndex=0;render();}};
  root.addEventListener('change',change);
  window.addEventListener('keydown',key);
  const hide=()=>{if(run.status==='playing'||run.reason==='feedback')stop('hidden');};
  window.addEventListener('pagehide',hide);window.addEventListener('blur',hide);
  const ticker=setInterval(()=>{
    if(stopped||run.status!=='playing')return;
    if(E.remaining(run)<=0){finish('time');return;}
    const clock=root.querySelector('[data-clock]');if(clock)clock.textContent=formatTime(run.config.variant==='timed'?E.remaining(run):E.checkpoint(run).activeMs);
  },200);
  const saver=setInterval(()=>{if(run.status==='playing'){run=E.checkpoint(run);if(!persist())render();}},5000);
  function teardown(){clearTimeout(feedbackTimer);clearInterval(ticker);clearInterval(saver);stopped=true;window.removeEventListener('keydown',key);window.removeEventListener('pagehide',hide);window.removeEventListener('blur',hide);root.removeEventListener('click',click);root.removeEventListener('change',change);}
  try{persist();complete();lineIndex=-1;render();}catch(error){teardown();throw error;}
  return {
    destroy(){run=E.pause(run);persist();teardown();},
    hasProgress(){return run.status!=='complete'&&(run.attempts.length>0||E.checkpoint(run).activeMs>0);},
    quit(){if(run.status!=='complete')finish('ended');},
    pause(){hide();},resume(){/* Explicit resume prevents background time from accruing. */},
    restart(){if(run.status!=='complete')finish('ended');location.hash='#/positional';},
  };
}
