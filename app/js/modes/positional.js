import catalog from '../../data/positional/catalog.js';
import * as E from '../positional-engine.js';
import estimates from '../../data/positional/win-estimates.js';
import {winComparison,lichessGameLink} from '../positional-review.js';
import {LETTERS,COLORS,formatTime,lineFrames,sourceRatingText,selectionEvidenceText} from '../positional-core.js';

export const meta={id:'positional',title:'Positional',boardOptions:{board:'2d'}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration=ms=>`${(ms/1000).toFixed(1)}s`;
const label=v=>({timed:'5-minute Rush',survival:'Survival',fixed:'Fixed-cycle study',theme:'Theme practice'}[v]||v);
const icon=name=>`<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
const themeOptions=()=>`<option value="all">All themes</option>${(catalog.practiceThemes||catalog.themes||[]).filter(t=>E.eligibleCases(catalog,t.id).length).map(t=>`<option value="${esc(t.id)}">${esc(t.label)} (${E.eligibleCases(catalog,t.id).length})</option>`).join('')}`;

export function createSetup(root,{persistence,go,board='2d',confirm,notify}) {
  let saved=null,error='',savedRaw;
  try{savedRaw=persistence.get();saved=E.parseStore(savedRaw);}catch(e){error=e.message;}
  const variants=[
    ['timed','rush','i-timer','Timed','Beat the clock, as many as you can','5 min · 3 mistakes · 2 choices'],
    ['survival','survival','i-heart','Survival','No clock. Three mistakes and out','Untimed · 2 choices'],
    ['fixed','classic','i-puzzle','Fixed-cycle study','Work through a set, then repeat it','No lives limit · 2 or 3 choices'],
    ['theme','rated','i-target','Theme practice','Focus on one area of your game','Continuous · 2 or 3 choices'],
  ];
  const segmented=(name,options,value)=>`<div class="segmented segmented--block" role="group" aria-label="${name==='board'?'Board':'Study choices'}">${options.map(([v,text])=>`<label class="segmented__option"><input type="radio" name="${name}" value="${v}" ${v===value?'checked':''}><span>${text}</span></label>`).join('')}</div>`;
  const value=name=>(root.querySelector(`[name=${name}]:checked`)||root.querySelector(`[name=${name}]`)).value;
  root.innerHTML=`<header class="app-bar"><button class="icon-btn" data-home aria-label="Home">${icon('i-back')}</button><div class="app-bar__title">Positional</div><span></span></header>
    <div class="screen-body u-scroll"><div class="screen-body__inner pos-setup">
      <div class="hero"><h1 class="hero__title">Positional</h1><p class="hero__subtitle">Which move is the mistake? Tap it once. Learn why after your run.</p><p class="pos-small">${catalog.cases.length} positions · difficulty provisional</p></div>
      ${error?`<p role="alert">Saved training could not be read: ${esc(error)}. Original data was kept.</p>`:''}
      ${saved?.active?`<section class="section pos-saved"><span class="section__title">Saved run</span><button class="btn btn--block" data-resume>Resume ${esc(label(saved.active.config.variant))} · ${saved.active.attempts.length} answered</button>${saved.active.config.board==='3d'?'<button class="btn btn--block" data-recover>Continue saved run in 2D · keep progress</button>':''}</section>`:''}
      <section class="section"><span class="section__title">How do you want to play?</span><div class="mode-list" role="radiogroup" aria-label="Mode">${variants.map(([v,style,glyph,title,desc,meta])=>`<label class="mode-card mode-card--${style}"><input class="u-visually-hidden" type="radio" name="variant" value="${v}" ${v==='timed'?'checked':''}><span class="mode-card__icon">${icon(glyph)}</span><span class="mode-card__body"><span class="mode-card__title">${title}</span><span class="mode-card__desc">${desc}</span><span class="mode-card__meta">${meta}</span></span><span class="mode-card__chevron">${icon('i-chevron')}</span></label>`).join('')}</div></section>
      <section class="section" data-choice-label><span class="section__title">Move choices</span>${segmented('choices',[['3','3 moves'],['2','2 moves']],'3')}<small class="pos-small">One mistake. The other moves are good choices.</small></section>
      <section class="section" data-theme-label><label class="pos-field"><span class="section__title">Theme</span><select name="theme">${themeOptions()}</select></label><small class="pos-small" data-theme-tags></small></section>
      <section class="section" data-size-label><label class="pos-field"><span class="section__title">Fixed set</span><select name="size"><option value="0">Starter set · ${catalog.cases.length} positions</option><option value="100" ${catalog.cases.length<100?'disabled':''}>100 unique positions${catalog.cases.length<100?' · not ready yet':''}</option></select></label></section>
      <section class="section"><span class="section__title">Board</span>${segmented('board',[['2d','2D'],['3d','3D']],board==='3d'?'3d':'2d')}</section>
      ${saved?.history.length?`<details class="pos-details"><summary>Previous runs (${saved.history.length})</summary><div class="pos-history">${saved.history.map((r,i)=>`<button class="btn" data-history="${i}">${esc(label(r.config.variant))} · ${r.score}/${r.attempts.length} · ${r.config.choiceCount} choices · ${r.config.board.toUpperCase()} · ${formatTime(r.activeMs)}${r.config.variant==='fixed'?` · cycle ${r.cycleNumber}`:''}</button>`).reverse().join('')}</div></details>`:''}
      <details class="pos-details"><summary>How practice works &amp; sources</summary><p>Fixed cycles pin their corpus, move choices and board setting. Letters change each cycle. Times are active wall-clock time, excluding pauses, hidden tabs and review, not a measurement of pure thinking. Results stay on this device. Repeated passes reuse this finite pool.</p><p>${esc(catalog.limits?.join(' ')||'Teaching sample. No measured puzzle ratings.')}</p><p>Chess positions from Lichess games (CC0). Authored teaching commentary. Engine checks: Stockfish 17.1. Human-model illustrations: Maia3-79M where labeled; engine fallbacks are labeled separately. No engine or model runs in this app.</p></details>
    </div></div>
    <div class="action-bar"><div class="action-bar__inner"><button class="btn btn--primary btn--lg btn--block" data-start ${error?'disabled':''}>${icon('i-bolt')} Start</button></div></div>`;
  const sync=()=>{
    const v=value('variant'),rush=['timed','survival'].includes(v);
    for(const input of root.querySelectorAll('[name=variant]'))input.closest('.mode-card').classList.toggle('is-selected',input.checked);
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
      for(const k of ['variant','choices','theme','size','board'])p.set(k,value(k));
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
    run=store.active;data=store.corpora[run.version];run={...run,status:'paused',reason:run.reason==='review-last'&&E.canReviewLast(run)?'review-last':'restored',runningSince:null};
  }else{
    if(store.active)throw new Error('A saved positional run exists. Resume it from Positional setup first.');
    run=E.newRun(catalog,{variant:ctx.config.variant,choiceCount:ctx.config.choices,theme:['timed','survival'].includes(ctx.config.variant)?'all':ctx.config.theme,size:ctx.config.size,board:ctx.settings.board});
  }
  if(ctx.config.recover2d&&run.status!=='complete')run=E.recoverIn2D(run);
  if(run.status!=='complete')run=E.useSingleTap(run);
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
    const openDetails=[...(root.querySelectorAll?.('details[data-detail][open]')||[])].map(el=>el.dataset.detail);
    const midReview=run.status==='paused'&&run.reason==='review-last'&&E.canReviewLast(run),complete=run.status==='complete'||midReview,showingFeedback=run.status==='paused'&&run.reason==='feedback',item=showingFeedback?run.attempts.at(-1):run.deck[run.index],p=!complete&&data.cases.find(p=>p.id===item.id);
    const rush=['timed','survival'].includes(run.config.variant);
    const modeText=`${label(run.config.variant)} · ${run.config.choiceCount} choices${run.config.variant==='fixed'?` · cycle ${run.cycleNumber}`:''}`;
    const header=`<header class="app-bar"><div class="readouts pos-readouts" data-shell="header" aria-label="Positional progress">
      <div class="readout readout--score"><span class="readout__label">Correct</span><span class="readout__value">${run.score}/${run.attempts.length}</span></div>
      ${rush?`<div class="readout"><span class="readout__label">Lives</span><span class="strikes" aria-label="${3-run.mistakes} lives remaining">${[0,1,2].map(i=>`<i class="strikes__pip ${i<run.mistakes?'is-spent':''}" aria-hidden="true"></i>`).join('')}</span></div>`:''}
      <div class="readout readout--timer"><span class="readout__label">${run.config.variant==='timed'?'Time':'Elapsed'}</span><span class="readout__value" data-clock>${run.config.variant==='timed'?formatTime(E.remaining(run)):formatTime(E.checkpoint(run).activeMs)}</span></div>
      </div></header>`;
    root.classList.toggle('screen--play',!complete);
    root.classList.toggle('screen--positional-review',complete);
    root.innerHTML=header+(complete?`<div class="pos-content u-scroll"><div class="pos-top"><strong>${esc(modeText)}</strong></div><div class="pos-board"></div><section class="pos-controls"></section>${storageError?`<p role="alert" class="pos-small">${esc(storageError)} Keep this tab open to review the in-memory result.</p>`:''}</div>`:
      `<div class="stage pos-stage"><div class="pos-prompt"><span class="pos-mode-label">${esc(modeText)}${run.config.theme!=='all'?` · ${esc([...(data.practiceThemes||[]),...(data.themes||[])].find(t=>t.id===run.config.theme)?.label||run.config.theme)}`:''}</span><div class="prompt"><span class="prompt__side" data-side="${p.sideToMove}"></span><span>${p.sideToMove==='black'?'Black':'White'} to move</span>${run.config.variant==='fixed'?`<strong class="pos-progress">${showingFeedback?run.index:run.index+1}/${run.deck.length}</strong>`:''}</div><h2 class="pos-question">Which move is the mistake?</h2></div><div class="board-area pos-board-area"><div class="board-frame pos-board"><div class="board-slot"></div></div></div><div class="pos-pause" hidden></div></div><div class="action-bar pos-action-bar"><div class="action-bar__inner"><section class="pos-controls"></section>${storageError?`<p role="alert" class="pos-small">${esc(storageError)} Keep this tab open to review the in-memory result.</p>`:''}</div></div>`);
    root.querySelector(complete?'.pos-board':'.board-slot').appendChild(boardEl);
    const controls=root.querySelector('.pos-controls');
    if(complete){renderReview(controls);for(const key of openDetails){const node=root.querySelector(`[data-detail=${key}]`);if(node)node.open=true;}return;}
    boardAt(p,item.options);
    const paused=run.status==='paused'&&run.reason!=='feedback';
    root.querySelector('.pos-board-area').hidden=paused;
    root.querySelector('.pos-pause').hidden=!paused;
    if(run.status==='paused'&&run.reason!=='feedback'){
      root.querySelector('.pos-pause').innerHTML=`${icon(run.reason==='ready'?'i-puzzle':'i-timer')}<h2>${run.reason==='ready'?'Ready when you are':'Paused'}</h2><p>${run.reason==='ready'?'The clock starts when you begin.':'Your progress is saved on this device.'}</p>`;
      controls.innerHTML=`<div class="pos-pause-actions">${E.canReviewLast(run)?'<button class="btn" data-action="review-last">Review last position</button>':''}<button class="btn btn--primary btn--lg btn--block" data-action="resume" ${storageError?'disabled':''}>${run.reason==='ready'?'Begin':'Resume'}</button><button class="btn" data-action="end">End and review</button>${run.reason!=='ready'?'<a class="btn" href="#/positional">Save &amp; return to modes</a>':''}</div>`;
    }else{
      controls.innerHTML=`<p class="pos-answer-instruction" id="pos-answer-instruction">Tap the mistake</p><div class="pos-choices" role="group" aria-describedby="pos-answer-instruction" style="--choices:${item.options.length}">${item.options.map((uci,i)=>`<button class="answer pos-choice" data-choice="${uci}" aria-label="${LETTERS[i]}: ${esc(p.options.find(o=>o.uci===uci).san)}. Choose as the mistake" ${run.status!=='playing'?'disabled':''} style="--choice:${COLORS[i]}"><strong>${LETTERS[i]}</strong><span>${esc(p.options.find(o=>o.uci===uci).san)}</span></button>`).join('')}</div>
      <p class="pos-feedback" role="status">${esc(feedback||'One tap answers · or press '+LETTERS.slice(0,item.options.length).join(', '))}</p>
      <div class="pos-actions pos-play-actions">${E.canReviewLast(run)?'<button class="btn" data-action="review-last">Review last</button>':''}<button class="btn" data-action="pause">Pause &amp; save</button><button class="btn" data-action="end">End and review</button></div>`;
    }
    requestAnimationFrame(()=>{if(!stopped)board.resize();});
  }
  function renderReview(el){
    const midReview=run.status!=='complete';
    const filtered=run.attempts.map((a,i)=>({a,i})).filter(({a,i})=>midReview?i===run.attempts.length-1:filter!=='misses'||!a.correct);
    if(!filtered.some(x=>x.i===reviewIndex))reviewIndex=filtered[0]?.i??0;
    const a=run.attempts[reviewIndex],p=a&&data.cases.find(p=>p.id===a.id);
    el.innerHTML=`${midReview?'<div class="pos-return-bar"><button class="btn btn--primary btn--block" data-action="return-play">Return to game</button><p class="pos-small">Your run is paused. The next position is unchanged.</p></div>':''}<h2>${midReview?'Last position':'Run review'} · ${run.attempts.length?Math.round(run.score/run.attempts.length*100):0}%</h2><p class="pos-small">${run.score} of ${run.attempts.length} correct · ${duration(run.activeMs)} playing · ${run.config.choiceCount} choices</p>
      ${run.boardRecovery?`<p class="pos-small">Recovered from 3D to 2D after ${run.boardRecovery.afterAttempts} answers. This run is kept separate from unchanged-board comparisons.</p>`:''}
      <div class="pos-actions" ${midReview?'hidden':''}><button class="btn" data-filter="all" aria-pressed="${filter==='all'}">All (${run.attempts.length})</button><button class="btn" data-filter="misses" aria-pressed="${filter==='misses'}">Misses (${run.mistakes})</button></div>
      <div class="pos-review-tabs">${filtered.map(({a,i})=>`<button class="btn" data-review="${i}" aria-pressed="${i===reviewIndex}">${i+1} ${a.correct?'✓':'×'}</button>`).join('')}</div>
      ${!filtered.length?`<p>${filter==='misses'?'No misses in this run.':'No positions answered.'}</p>`:''}
      <div class="pos-review-body"></div>
      <div class="pos-actions">${midReview?'<button class="btn btn--primary" data-action="return-play">Return to game</button>':''}${run.config.variant==='fixed'&&run.reason==='complete'?'<button class="btn btn--primary" data-action="repeat">Repeat this fixed set</button>':''}<a class="btn" href="#/positional">Modes &amp; history</a></div>
      ${run.config.variant==='fixed'&&run.version!==catalog.version?'<p>A newer catalog is available in Modes. This cycle and Repeat keep the pinned version.</p>':''}`;
    if(!filtered.length){board.clearArrows();board.clearHighlights();root.querySelector('.pos-board').hidden=true;return;}
    root.querySelector('.pos-board').hidden=false;
    const bad=p.options.find(o=>o.isBad),chosen=p.options.find(o=>o.uci===a.selectedUci),gameLink=lichessGameLink(p);
    const body=el.querySelector('.pos-review-body');
    body.innerHTML=`<div class="pos-result"><strong>${a.correct?'✓ Correct':'Missed this one'}</strong><span>${duration(a.answerMs)}</span></div><div class="pos-review-moves"><div><span>You chose</span><strong>${esc(chosen.san)}</strong></div><div><span>The mistake</span><strong>${esc(bad.san)}</strong></div></div>
      <div class="pos-review-board-slot"></div>${gameLink?`<a class="btn btn--secondary btn--block pos-lichess-link" href="${esc(gameLink)}" target="_blank" rel="noopener noreferrer">Open game in Lichess ↗</a>`:''}
      <p class="pos-reason">${esc(p.explanation?.text||'')}</p>
      <div class="pos-tags" aria-label="Themes">${(p.themeIds||[]).map(t=>`<span>${esc(data.themes?.find(x=>x.id===t)?.label||t)}</span>`).join('')}</div>
      <div class="pos-win-estimates" data-win-estimates></div>
      <details class="pos-details" data-detail="explanation"><summary>Why it matters &amp; the good moves</summary>
      <p><strong>${esc(p.difficulty?.label||'Provisional difficulty')}</strong>${p.difficulty?.provisional&&!/provisional/i.test(p.difficulty.label||'')?' · provisional':''}</p>

      ${(p.explanation?.tags||[]).map(t=>`<section><h3>${esc(t.tag)}</h3><p>${esc(t.before)}</p><p>${esc(t.after)}</p><p>${esc(t.commentary)}</p></section>`).join('')}
      <h3>Why the other moves are okay</h3>${p.options.filter(o=>!o.isBad&&a.options.includes(o.uci)).map(o=>`<p><strong>${esc(o.san)}</strong>: ${esc(p.explanation?.alternatives?.[o.uci]||'See source checks below.')}</p>`).join('')}
      </details><details class="pos-details" data-detail="continuation"><summary>See a possible continuation</summary><div class="pos-line"><label>Line<select data-line-type><option value="illustrative">Example continuation</option><option value="benchmark">Longer engine line</option></select></label><p data-line-note></p><div class="pos-actions"><button class="btn" data-action="root">Position</button><button class="btn" data-action="line-prev">Previous</button><button class="btn" data-action="line-next">Next</button><span data-line-counter></span></div></div></details>
      <details data-detail="sources"><summary>Sources &amp; analysis details</summary><p>${esc(estimates.disclaimer||'')}</p><p>Set: ${esc(run.version)}. Answering: ${run.answerStyle==='mixed'?'changed from preview-and-submit to one tap during this run':run.answerStyle==='single-tap'?'one tap':'preview and submit'}. Times are active wall-clock time, not pure thinking time.</p><p>${esc(sourceRatingText(p.source))}</p><p>${esc(p.source?.verification||p.source?.note||'')}</p><p>Evidence version: ${esc(p.validation?.historicalSourceVersion||data.version)}. ${esc(p.validation?.projectionNote||'')}</p>${p.source?.url&&/^https:\/\/lichess\.org\//.test(p.source.url)?`<p><a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer">Original game</a></p>`:''}<p>${esc(p.validation?.notes?.join?.(' ')||p.validation?.notes||'')}</p>${p.options.map(o=>`<p><strong>${esc(o.san)}</strong> ${esc(selectionEvidenceText({...o.selectionEvidence,stockfishCpMover:o.selectionEvidence?.stockfishCpMover??o.validation?.stockfishCpMover})||`Stockfish: ${o.validation?.stockfishCpMover??'not recorded'} cp, moving side.`)} ${o.validation?.stockfishNodeBudget?`Recorded node budget: ${o.validation.stockfishNodeBudget.toLocaleString()}.`:''}</p>`).join('')}<p>Binary mode uses the highest recorded engine score among the two approved controls; measured Maia probability and UCI break ties. Legacy cards retain their original evidence and are not relabeled as passing the newer strict protocol. Source player ratings are not puzzle difficulty.</p></details>`;
    showWinEstimates(p,body.querySelector('[data-win-estimates]'));
    body.querySelector('.pos-review-board-slot').appendChild(root.querySelector('.pos-board'));
    body.querySelector('[data-line-type]').value=lineType;
    showLine(p,a);
    requestAnimationFrame(()=>{if(!stopped)board.resize();});
  }
  async function showWinEstimates(p,node){
    const result=await winComparison(p,estimates,E.binaryControl(p).uci);
    if(stopped||!node.isConnected)return;
    if(!result){node.innerHTML='<p class="pos-small">Win-chance estimates are unavailable for this position.</p>';return;}
    const good=p.options.find(o=>o.uci===result.referenceGoodUci),bad=p.options.find(o=>o.uci===result.badUci);
    const percent=n=>(100*n).toFixed(1)+'%';
    node.innerHTML=`<h3>Estimated win chance</h3><p class="pos-small">${p.sideToMove==='black'?'Black':'White'}’s chances after <strong>${esc(good.san)}</strong> (good move) → <strong>${esc(bad.san)}</strong> (mistake)</p>
      <div class="pos-win-rows">${result.rows.map(r=>`<div class="pos-win-row"><strong>${r.rating} players</strong>${r.unavailable?'<span>Unavailable</span>':`<span>${percent(r.good)} → ${percent(r.mistake)}</span><span class="pos-win-change">${r.change>0?'+':r.change<0?'−':''}${Math.abs(r.change).toFixed(1)} pts</span>${r.disagrees?'<small>Model estimate disagrees with the engine here.</small>':''}`}</div>`).join('')}</div>
      <p class="pos-small">Maia human-model estimates, not measured odds. Both players are set to the shown rating.</p>`;
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
  function submit(uci){
    if(!uci||run.status!=='playing'||storageError||stopped)return;
    selected=uci;
    run=E.answer(run,data,selected);selected=null;
    feedback=run.attempts.at(-1)?.correct?'Correct':'Incorrect';persist();complete();render();
    if(run.status==='paused'&&run.reason==='feedback')feedbackTimer=setTimeout(()=>{
      feedbackTimer=0;if(stopped||storageError||run.reason!=='feedback')return;
      run=E.resume(run);feedback='';persist();render();
    },700);
  }
  function click(e){
    const choice=e.target.closest('[data-choice]');
    if(choice){if(e.detail>1)return;submit(choice.dataset.choice);return;}
    const tab=e.target.closest('[data-review]');if(tab){reviewIndex=Number(tab.dataset.review);lineIndex=-1;render();return;}
    const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;lineIndex=-1;render();return;}
    switch(e.target.closest('[data-action]')?.dataset.action){
      case 'review-last':
        if(!E.canReviewLast(run)||storageError)return;
        clearTimeout(feedbackTimer);feedbackTimer=0;run=E.reviewLast(run);feedback='';selected=null;filter='all';reviewIndex=run.attempts.length-1;lineIndex=-1;persist();render();break;
      case 'return-play':
        if(run.status!=='paused'||run.reason!=='review-last'||storageError)return;
        lineIndex=-1;feedback='';selected=null;run=E.resume(run);persist();render();break;
      case 'resume':run=E.resume(run);feedback='';persist();render();break;
      case 'pause':stop();break;
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
    if(e.repeat){if(e.target.closest?.('[data-choice]'))e.preventDefault();return;}
    if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,select,textarea')||e.target.isContentEditable)return;
    const i=LETTERS.indexOf(e.key.toUpperCase());
    if(run.status==='playing'&&i>=0&&i<run.config.choiceCount){e.preventDefault();submit(run.deck[run.index].options[i]);}
    // Enter/Space on a focused answer button use its native click, once.
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
