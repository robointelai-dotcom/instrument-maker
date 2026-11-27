const Core=require('../src/core.js');const sr=48000;let seed=5;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296-0.5;};
function held(m,d){const f=440*Math.pow(2,(m-69)/12),n=Math.round(sr*d),x=new Float32Array(n);for(let j=0;j<n;j++){const t=j/sr;let s=0;for(let h=1;h<=6;h++)s+=Math.sin(2*Math.PI*f*h*t)/(h*h);x[j]=0.3*s*Math.min(1,t/0.03)*Math.min(1,(d-t)/0.15);}return x;}
for(const m of [48,55,62,69,76]){const n=held(m,4.5),x=new Float32Array(sr*2+n.length+sr);for(let i=0;i<x.length;i++)x[i]=rnd()*0.004;for(let i=0;i<n.length;i++)x[sr*2+i]+=n[i];
const a=Core.analyse(x,sr,true);console.log(Core.noteName(m),a.takes.map(t=>Core.noteName(t.midi)+' '+t.seconds.toFixed(2)+'s').join(' | '));}
