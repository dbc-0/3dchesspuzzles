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
