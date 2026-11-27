const C = require('../src/core.js'); const fs = require('fs');
const sr = 48000; let x = C.example(sr);
let t0 = Date.now(); const a = C.analyse(x, sr, true); console.log('analyse ms', Date.now() - t0, '| noise dB', a.noiseDb.toFixed(1), 'peak dB', a.peakDb.toFixed(1), 'noise learned', a.noiseLearned);
console.log(a.takes.map(t => `${t.midi === null ? '?' : C.noteName(t.midi)} ${t.cents}c clarity ${t.clarity.toFixed(2)} ${t.seconds.toFixed(2)}s ok=${t.ok}`).join(' | '));
// noise check: the tail of a note with and without cleaning
const b = C.analyse(x, sr, false); const tail = d => C.db(C.rms(d.slice(d.length - 9000, d.length - 3000)));
console.log('tail level, not cleaned', tail(b.takes[0].data).toFixed(1), 'dB | cleaned', tail(a.takes[0].data).toFixed(1), 'dB | body kept', (C.db(C.rms(a.takes[0].data.slice(2000, 20000))) - C.db(C.rms(b.takes[0].data.slice(2000, 20000)))).toFixed(2), 'dB');
// a harder recording: louder noise, two takes of one note at different loudness, two alike takes
const y = new Float32Array(sr * 9); let s = 3; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
for (let i = 0; i < y.length; i++) y[i] = r() * 0.02;
[[57, 0.5, 0.6], [57, 2.5, 0.15], [64, 4.5, 0.5], [64, 6.5, 0.48]].forEach(([m, at, amp]) => { const f = 440 * 2 ** ((m - 69) / 12 + 0.012); for (let j = 0; j < sr * 1.4; j++) { const t = j / sr; y[Math.round(at * sr) + j] += amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.2) * Math.min(1, j / 200); } });
const h = C.analyse(y, sr, true); console.log('noisy:', h.takes.map(t => `${t.midi === null ? '?' : C.noteName(t.midi)} ${t.cents}c lvl ${t.level.toFixed(0)} ok=${t.ok}`).join(' | '), '| SNR', h.snrDb.toFixed(0));
const inst = C.buildInstrument(a.takes.concat(h.takes), { name: 'Test Pluck', reach: 5, date: '2026-11-27' });
console.log('zones', inst.zones.map(z => `${C.noteName(z.midi)} [${C.noteName(z.lo)}..${C.noteName(z.hi)}] layers ${z.layers.map(l => l.length).join('+')}`).join(' | '));
console.log('files', inst.files.map(f => f.name.split('/').slice(1).join('/') + ':' + f.bytes.length).join(', '));
const sfz = new TextDecoder().decode(inst.files.find(f => f.name.endsWith('Test Pluck.sfz')).bytes); console.log(sfz);
fs.writeFileSync('/tmp/test.zip', C.zip(inst.files)); console.log('far keys', inst.far, 'samples', inst.samples);
