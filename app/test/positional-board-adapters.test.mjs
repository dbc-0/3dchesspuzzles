// Execute the actual optional candidate-arrow functions with tiny rendering stubs.
// This tests backward compatibility and resource ownership, not WebGL pixels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Color} from '../vendor/three/three.module.min.js';
let checks=0;const test=(name,f)=>{f();checks++;console.log('ok',name)};
const node=(tag,attrs={})=>({tag,attrs,children:[],textContent:'',appendChild(n){this.children.push(n)}});
const source2=fs.readFileSync(new URL('../js/board2d.js',import.meta.url),'utf8');
const labels=node('g'),arrows=node('g');
const c2={svgEl:node,parseSquare:s=>/^[a-h][1-8]$/.test(s)?{}:null,squareToXY:s=>({x:s.charCodeAt(0)-97,y:8-Number(s[1])}),orientation:'white',HIGHLIGHT_KINDS:['hint'],tok:()=> '#777',layerArrows:arrows,layerCandidateLabels:labels};
vm.createContext(c2);vm.runInContext(source2.slice(source2.indexOf('  let lastArrows = []'),source2.indexOf('  // ---- flash')),c2);
test('2D legacy arrow has no candidate badge',()=>{c2.arrow('c2','c4','hint');assert.equal(labels.children.length,0);assert.equal(arrows.children.length,1)});
test('2D same-square candidates have distinct final-layer badges',()=>{c2.arrow('c2','c4',null,{label:'A',color:'#123',opacity:0.25});c2.arrow('b3','c4',null,{label:'B',color:'#456',opacity:1});assert.equal(labels.children.length,2);assert.notEqual(labels.children[0].children[0].attrs.cx,labels.children[1].children[0].attrs.cx);assert.equal(labels.children[0].attrs.opacity,0.25);assert(source2.includes('layerPieces, layerCandidateLabels, layerFlash'))});
test('2D clear removes candidate overlay and orientation replays metadata',()=>{c2.clearArrows();assert.equal(labels.textContent,'');assert(source2.includes('arrow(a.from, a.to, a.kind, a.candidate)'))});
const disposed=[];
const material=()=>({color:new Color(),userData:{},clone(){return material()},dispose(){disposed.push(this)}});
class V {constructor(){this.x=0;this.z=0}}
class Mesh {constructor(geometry,mat){this.geometry=geometry;this.material=mat;this.position={set(){}};this.rotation={};this.layers={set(){}}}}
class Sprite extends Mesh {constructor(mat){super(null,mat);this.isSprite=true;this.scale={set(){}}}}
class Texture {constructor(){this.dispose=()=>disposed.push(this)}}
class SpriteMaterial {constructor(o){Object.assign(this,o);this.userData={};this.dispose=()=>disposed.push(this)}}
const source3=fs.readFileSync(new URL('../js/board3d.js',import.meta.url),'utf8');
const group={items:[],add(m){this.items.push(m)},remove(m){this.items=this.items.filter(x=>x!==m)}};
const canvasContext={beginPath(){},arc(){},fill(){},stroke(){},fillText(){}};
const base=material();
const c3={THREE:{Color,Vector3:V,Mesh,Sprite,CanvasTexture:Texture,SpriteMaterial,SRGBColorSpace:'srgb'},document:{createElement:()=>({getContext:()=>canvasContext})},destroyed:false,squareToWorld(s,v){if(!/^[a-h][1-8]$/.test(s))return false;v.x=s.charCodeAt(0)-97;v.z=Number(s[1]);return true},buildArrowGeometry:()=>({dispose(){disposed.push(this)}}),arrowMat:base,HIGHLIGHT_KINDS:['hint'],clamp:(v,lo,hi)=>Math.min(hi,Math.max(lo,v)),TOKEN_FALLBACKS:{'--arrow':'#777'},token:()=>({color:new Color('#777'),alpha:1}),ARROW_BASE_OPACITY:0.8,TOP_Y:1,LAYER_OVERLAY:2,arrowGroup:group,arrows:[],requestRender(){}};
vm.createContext(c3);vm.runInContext(source3.slice(source3.indexOf('function alphaToNumber('),source3.indexOf('function luminance(')),c3);vm.runInContext(source3.slice(source3.indexOf('  function arrow(from'),source3.indexOf('  /* flash:')),c3);
test('real color helper rejects the old raw-string contract',()=>{assert.throws(()=>c3.applyColorToken(base,'#123',0.8));});
test('3D legacy arrow preserves shared base material',()=>{c3.arrow('c2','c4');assert.equal(group.items.length,1);c3.clearArrows();assert(!disposed.includes(base));assert.equal(group.items.length,0)});
test('3D candidates create neutral labels above arrows',()=>{c3.arrow('c2','c4',null,{label:'A',color:'#123',opacity:0.25});assert.equal(group.items.length,2);assert(group.items[1].isSprite);assert.equal(group.items[1].renderOrder,25);assert.equal(group.items[1].material.opacity,0.25);assert(group.items[0].material.color.equals(new Color('#123')));assert.equal(group.items[0].material.opacity,0.2)});
test('3D clear releases each candidate texture and owned material',()=>{const badge=group.items[1],texture=badge.material.userData.labelTexture,mat=badge.material;c3.clearArrows();assert(disposed.includes(texture));assert(disposed.includes(mat));assert.equal(group.items.length,0);assert(!disposed.includes(base))});
test('invalid squares ignored by both adapters',()=>{const before=arrows.children.length;c2.arrow('xx','c4');c3.arrow('xx','c4');assert.equal(arrows.children.length,before);assert.equal(group.items.length,0)});
console.log(`${checks} positional board-adapter tests passed; WebGL visual test still required`);
