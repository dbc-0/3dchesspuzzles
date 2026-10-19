import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/positional-engine.js';
import {lichessGameLink} from '../js/positional-review.js';
import catalog from '../data/positional/catalog.js';
for(const variant of ['survival','fixed','theme']) {
 let r=E.newRun(catalog,{variant,choiceCount:3,board:'2d'},{seed:31,now:1000});
 assert.equal(E.canReviewLast(r),false);assert.equal(E.reviewLast(r,2000),r);
 r=E.resume(r,2000);const p=catalog.cases.find(p=>p.id===r.deck[0].id);
 r=E.answer(r,catalog,p.options.find(o=>o.isBad).uci,3000);
 // Review during feedback must cancel transition without accruing time.
 const fromFeedback=E.reviewLast(r,4000);assert.equal(fromFeedback.activeMs,1000);
 r=E.resume(r,4000);const expected=structuredClone(r.deck[r.index]);
 const reviewed=E.reviewLast(r,4500);assert.equal(reviewed.reason,'review-last');assert.equal(reviewed.status,'paused');assert.equal(reviewed.activeMs,1500);
 assert.deepEqual(reviewed.attempts,r.attempts);assert.deepEqual(reviewed.deck[r.index],expected);assert.equal(reviewed.score,r.score);assert.equal(reviewed.mistakes,r.mistakes);
 const saved=E.saveRun(E.emptyStore(),reviewed,catalog);assert.equal(saved.history.length,0);const parsed=E.parseStore(JSON.stringify(saved));assert.equal(parsed.active.reason,'review-last');
 let resumed=E.resume(parsed.active,90000);assert.equal(resumed.activeMs,1500);assert.deepEqual(resumed.deck[resumed.index],expected);
 resumed=E.answer(resumed,catalog,resumed.deck[resumed.index].options[0],91000);assert.equal(resumed.attempts.length,2);assert.equal(resumed.attempts[1].answerMs,1500);assert.equal(resumed.activeMs,2500);
 assert.equal(E.canReviewLast(E.finish(resumed,'ended',92000)),false);
}
let timed=E.resume(E.newRun(catalog,{variant:'timed'},{seed:1,now:0}),1000);timed=E.answer(timed,catalog,timed.deck[0].options[0],2000);assert.equal(E.canReviewLast(timed),false);assert.equal(E.reviewLast(timed,3000),timed);
for(const p of catalog.cases){const u=new URL(lichessGameLink(p));assert.equal(u.hostname,'lichess.org');assert.equal(u.hash,'#'+p.history.movesUci.length);assert.equal(u.pathname.split('/')[1],new URL(p.source.url).pathname.split('/')[1]);}
for(const url of ['javascript:alert(1)','https://lichess.org.evil.test/abcdefgh','https://evil@lichess.org/abcdefgh','http://lichess.org/abcdefgh','https://lichess.org/study/abcdefgh'])assert.equal(lichessGameLink({...catalog.cases[0],source:{url}}),null);
const s=fs.readFileSync(new URL('../js/modes/positional.js',import.meta.url),'utf8');
assert(s.includes("reason:run.reason==='review-last'&&E.canReviewLast(run)?'review-last':'restored'"));
assert(s.includes(".filter(({a,i})=>midReview?i===run.attempts.length-1"));
assert(s.includes("clearTimeout(feedbackTimer);feedbackTimer=0;run=E.reviewLast(run)"));
assert(s.includes('target="_blank" rel="noopener noreferrer">Open game in Lichess'));
console.log('Mid-run review: 3 untimed modes, feedback/reload timing, exact deck/score/lives preservation, timed exclusion and 50 anchored safe Lichess links pass');
