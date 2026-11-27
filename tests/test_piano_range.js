const Core=require('../src/core.js'), fs=require('fs');
const sr=48000;
function pluck(m,dur){const f=440*Math.pow(2,(m-69)/12),n=Math.round(sr*dur),x=new Float32Array(n);
  for(let j=0;j<n;j++){const t=j/sr;let s=0;for(let h=1;h<=8;h++){ if(f*h>sr/2.2)break; s+=Math.sin(2*Math.PI*f*h*t)*Math.exp(-t*(1.2+h*0.5))/h;} x[j]=0.5*s*Math.min(1,j/(sr*0.004));}return x;}
let seed=3;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296-0.5;};
// 1) every key of the 30-note plan, as the guided mode hands it over: 2 s room + note
let bad=[];
for(let m=21;m<=108;m+=3){const n=pluck(m,3),x=new Float32Array(sr*2+n.length+sr*0.5);for(let i=0;i<x.length;i++)x[i]=rnd()*0.004;x.set(n.map((v,i)=>v+x[sr*2+i]),sr*2);
  const a=Core.analyse(x,sr,true);const t=a.takes.sort((p,q)=>q.peak-p.peak)[0];
  if(!t||!t.ok||t.midi!==m)bad.push(Core.noteName(m)+'->'+(t?(t.midi===null?'none':Core.noteName(t.midi))+' c'+t.clarity.toFixed(2):'nothing'));}
console.log('30-note plan wrong:',bad.length?bad.join(', '):'none');
// 2) a fake microphone file: 4 s room, then C2 C3 (wrong: D4) C4 C5 C6
const seq=[36,48,62,60,72,84];const parts=[new Float32Array(sr*4)];seq.forEach(m=>{parts.push(pluck(m,3.5));parts.push(new Float32Array(sr*2.5));});
const N=parts.reduce((s,p)=>s+p.length,0),y=new Float32Array(N);let o=0;parts.forEach(p=>{y.set(p,o);o+=p.length;});for(let i=0;i<N;i++)y[i]+=rnd()*0.004;
const b=Buffer.alloc(44+N*2);b.write('RIFF',0);b.writeUInt32LE(36+N*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*2,40);
for(let i=0;i<N;i++)b.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(y[i]*32767))),44+i*2);
fs.writeFileSync('/tmp/fakemic.wav',b);console.log('fake mic seconds',N/sr);
