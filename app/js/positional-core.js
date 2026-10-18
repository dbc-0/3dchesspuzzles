import * as ChessModule from '../vendor/chess.min.js';
const Chess = ChessModule.Chess || ChessModule.default || globalThis.Chess;
function normalizedFen(fen){const c=new Chess(fen);const parts=c.fen().split(' ');if(!c.moves({verbose:true}).some(m=>m.flags.includes('e')))parts[3]='-';return parts.join(' ');}
export const positionKey=fen=>normalizedFen(fen).split(' ').slice(0,4).join(' ');
export const LETTERS=['A','B','C','D'];
export const COLORS=['#2e6ca9','#9b5fa7','#95611f','#277f86'];
export function uciMove(uci){if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw new Error('Invalid UCI move');return {from:uci.slice(0,2),to:uci.slice(2,4),...(uci[4]?{promotion:uci[4]}:{})};}
export function seededRandom(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function shuffle(items,rng){let a=items.slice();for(let i=a.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function validateDataset(data){
 if(!data||data.validated!==true||!Array.isArray(data.cases)||!data.cases.length)throw new Error('The position set is not ready.');
 const seen=new Set();
 for(const p of data.cases){
  if(!p.id||seen.has(p.id))throw new Error('Missing or repeated position ID');seen.add(p.id);
  const c=new Chess(p.fen);if(c.validate_fen&&!c.validate_fen(p.fen).valid)throw new Error('Invalid FEN');if(p.sideToMove&&c.turn()!==p.sideToMove[0])throw new Error(`${p.id}: side to move differs`);
  if(!Array.isArray(p.options)||![3,4].includes(p.options.length)||p.options.filter(o=>o.isBad).length!==1||new Set(p.options.map(o=>o.uci)).size!==p.options.length)throw new Error(`${p.id}: invalid options`);
  for(const o of p.options){const t=new Chess(p.fen);let m=t.move(uciMove(o.uci));if(!m||m.captured||/[+#]/.test(m.san)||m.promotion)throw new Error(`${p.id}: option is not quiet`);if(o.san!==m.san)throw new Error(`${p.id}: SAN differs: ${o.san}/${m.san}`);}
  for(const line of [p.illustrative,p.benchmark]){if(!line?.lineUci?.length)continue;if(line.startsAfterUci){if(!p.options.some(o=>o.uci===line.startsAfterUci))throw new Error(`${p.id}: illustration candidate differs`);const expected=new Chess(p.fen);expected.move(uciMove(line.startsAfterUci));if(line.startFen&&normalizedFen(line.startFen)!==normalizedFen(expected.fen()))throw new Error(`${p.id}: illustration start position differs`);}let t=new Chess(line.startFen||p.fen);if(line.startsAfterUci&&!line.startFen)t.move(uciMove(line.startsAfterUci));for(let i=0;i<line.lineUci.length;i++){const m=t.move(uciMove(line.lineUci[i]));if(line.lineSan?.[i]&&line.lineSan[i]!==m.san)throw new Error(`${p.id}: line SAN differs`);}}
 }
 return true;
}
export function newRun(data,{seed=Date.now()>>>0,mode='rush',now=Date.now(),durationMs=180000}={}){
 validateDataset(data);const rng=seededRandom(seed);
 return {version:data.version,seed,mode,durationMs,startedAt:now,endedAt:null,status:'playing',endReason:null,lives:3,score:0,index:0,attempts:[],positions:data.cases.map(p=>({id:p.id,options:shuffle(p.options,rng).map(o=>o.uci)}))};
}
export function remainingMs(run,now=Date.now()){return run.mode==='practice'?Infinity:Math.max(0,run.durationMs-(now-run.startedAt));}
export function finishRun(run,reason,now=Date.now()){if(run.status!=='playing')return run;return {...run,status:'review',endReason:reason,endedAt:now};}
export function answerRun(run,data,uci,now=Date.now()){
 if(run.status!=='playing')return run;
 if(remainingMs(run,now)<=0)return finishRun(run,'time',now);
 const active=run.positions[run.index];if(!active?.options.includes(uci))throw new Error('Unknown option');
 const puzzle=data.cases.find(p=>p.id===active.id),choice=puzzle.options.find(o=>o.uci===uci),correct=choice.isBad;
 let out={...run,lives:run.lives-(correct?0:1),score:run.score+(correct?1:0),index:run.index+1,attempts:[...run.attempts,{id:puzzle.id,options:active.options,selectedUci:uci,correct,elapsedMs:now-run.startedAt,answerMs:now-(run.attempts.length?run.startedAt+run.attempts.at(-1).elapsedMs:run.startedAt)}]};
 if(out.lives<=0)return finishRun(out,'lives',now);
 if(out.index>=out.positions.length)return finishRun(out,'complete',now);
 return out;
}
export function optionLabel(options,uci){return LETTERS[options.indexOf(uci)]||'—';}
export function lineFrames(p,line){let c=new Chess(line.startFen||p.fen);if(line.startsAfterUci&&!line.startFen)c.move(uciMove(line.startsAfterUci));const frames=[c.fen()];for(const move of line.lineUci||[]){c.move(uciMove(move));frames.push(c.fen());}return frames;}
export function squareXY(square,orientation='w'){const f=square.charCodeAt(0)-97,r=Number(square[1])-1;return orientation==='w'?{x:f*60+30,y:(7-r)*60+30}:{x:(7-f)*60+30,y:r*60+30};}
export function formatTime(ms){if(!Number.isFinite(ms))return '∞';const n=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}

export function validChoiceIndex(index,count){return Number.isInteger(index)&&index>=0&&index<count;}

export function sourceRatingText(source){if(!source||![source.whiteRating,source.blackRating].every(n=>Number.isInteger(n)&&n>0)||typeof source.ratingType!=='string'||!source.ratingType.trim())return '';return `Source ratings: White ${source.whiteRating} · Black ${source.blackRating} (${source.ratingType.trim()}). These are the players’ game ratings, not this puzzle’s difficulty.`;}

export function selectionEvidenceText(e){
 if(!e||e.model!=='Maia3-79M'||![e.selfRating,e.opponentRating,e.maiaPolicyRank,e.maiaQuietRank].every(n=>Number.isInteger(n)&&n>0)||!Number.isFinite(e.maiaPolicyProbability)||e.maiaPolicyProbability<0||e.maiaPolicyProbability>1||!Number.isFinite(e.stockfishCpMover)||typeof e.selectedBy!=='string'||!e.selectedBy.trim()||typeof e.pedagogicalOverride!=='boolean')return '';
 return `${e.model} ${e.selfRating}/${e.opponentRating}: policy rank #${e.maiaPolicyRank} among all legal moves, #${e.maiaQuietRank} among quiet moves; ${(e.maiaPolicyProbability*100).toFixed(1)}% of legal-move probability. Stockfish ${(e.stockfishCpMover/100).toFixed(2)} from the moving side’s perspective. Selected by: ${e.selectedBy.trim()}. Teaching override: ${e.pedagogicalOverride?'yes':'no'}.${typeof e.note==='string'&&e.note.trim()?' '+e.note.trim():''}`;
}
