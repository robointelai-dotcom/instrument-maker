const C = require('../src/core.js'); const sr = 48000;
const y = new Float32Array(sr * 9); let s = 3; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
for (let i = 0; i < y.length; i++) y[i] = r() * 0.02;
[[57, 0.5, 0.6], [64, 4.5, 0.5]].forEach(([m, at, amp]) => { const f = 440 * 2 ** ((m - 69) / 12); for (let j = 0; j < sr * 1.4; j++) { const t = j / sr; y[Math.round(at * sr) + j] += amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.2) * Math.min(1, j / 200); } });
const band = (d, lo, hi) => { const N = 16384, re = new Float32Array(N), im = new Float32Array(N); for (let i = 0; i < N; i++) re[i] = (d[4000 + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); C.fft(re, im, false); let e = 0; for (let k = Math.round(lo * N / sr); k < Math.round(hi * N / sr); k++) e += re[k] * re[k] + im[k] * im[k]; return 10 * Math.log10(e + 1e-12); };
const a = C.analyse(y, sr, false).takes[0].data, b = C.analyse(y, sr, true).takes[0].data;
console.log('noise 2-20 kHz inside the note: raw', band(a, 2000, 20000).toFixed(1), 'dB, cleaned', band(b, 2000, 20000).toFixed(1), 'dB');
console.log('the note itself 150-300 Hz: raw', band(a, 150, 300).toFixed(1), 'dB, cleaned', band(b, 150, 300).toFixed(1), 'dB');
