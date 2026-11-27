/* Instrument Maker core: pure functions, no DOM. Works in a browser and in Node. */
var Core = (function () {
  "use strict";
  var NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function noteName(m) { return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function fileNote(m) { return noteName(m).replace("#", "s"); }
  function db(x) { return 20 * Math.log10(Math.max(x, 1e-9)); }

  /* ---------- FFT (radix 2, in place) ---------- */
  function fft(re, im, inverse) {
    var n = re.length, i, j = 0, k, t;
    for (i = 1; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var a = i + k, b = a + len / 2;
          var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
    if (inverse) for (i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  /* ---------- loudness curve: RMS in 10 ms frames ---------- */
  function envelope(x, sr) {
    var hop = Math.max(1, Math.round(sr * 0.01)), n = Math.floor(x.length / hop), e = new Float32Array(n);
    for (var f = 0; f < n; f++) {
      var s = 0, o = f * hop;
      for (var i = 0; i < hop; i++) s += x[o + i] * x[o + i];
      e[f] = Math.sqrt(s / hop);
    }
    return { env: e, hop: hop };
  }
  function percentile(arr, p) {
    var a = Array.prototype.slice.call(arr).sort(function (u, v) { return u - v; });
    return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
  }

  /* ---------- find the notes in a recording ----------
     A note starts when the sound rises well above the room's noise and ends
     when it has fallen back to it (or when the next note is struck). */
  function findNotes(x, sr) {
    var E = envelope(x, sr), env = E.env, hop = E.hop, n = env.length;
    var noise = Math.max(percentile(env, 0.1), 1e-6), peak = 0, i;
    for (i = 0; i < n; i++) if (env[i] > peak) peak = env[i];
    var on = Math.max(noise * 4, peak * 0.05), off = Math.max(noise * 2, peak * 0.012);
    var notes = [], start = -1, quiet = 0, lastOnset = 0;
    for (i = 0; i < n; i++) {
      if (start < 0) {
        if (env[i] > on) { start = i; quiet = 0; lastOnset = i; }
      } else {
        var lo = env[i];
        for (var k = 1; k <= 8 && i - k > start; k++) if (env[i - k] < lo) lo = env[i - k];
        var struck = i - lastOnset > 15 && env[i] > on && env[i] > lo * 2.5 && lo > 0;
        if (env[i] < off) quiet++; else quiet = 0;
        if (struck) { notes.push([start, i - 1]); start = i; lastOnset = i; quiet = 0; }
        else if (quiet >= 12) { notes.push([start, i - quiet + 2]); start = -1; }
      }
    }
    if (start >= 0) notes.push([start, n - 1]);
    var out = [];
    notes.forEach(function (p) {
      var a = Math.max(0, p[0] * hop - Math.round(sr * 0.012)), b = Math.min(x.length, (p[1] + 1) * hop + Math.round(sr * 0.02));
      if (b - a >= sr * 0.15) out.push({ start: a, end: b });
    });
    return { notes: out, noiseRms: noise, peakRms: peak, onThreshold: on, env: env, hop: hop, offThreshold: off };
  }

  /* ---------- pitch of one note (McLeod method on its steady part) ---------- */
  function pitchAt(x, sr, at, W) {
    var minLag = Math.max(2, Math.floor(sr / 4500)), maxLag = Math.min(Math.floor(sr / 25), W >> 1);   /* 25 Hz to 4500 Hz: the whole piano */
    var nsdf = new Float32Array(maxLag + 1), tau, i;
    for (tau = minLag - 1; tau <= maxLag; tau++) {
      var ac = 0, m = 0, lim = at + W - tau;
      for (i = at; i < lim; i++) { var u = x[i], v = x[i + tau]; ac += u * v; m += u * u + v * v; }
      nsdf[tau] = m > 0 ? 2 * ac / m : 0;
    }
    var best = 0, peaks = [];
    for (tau = minLag; tau < maxLag; tau++) {
      if (nsdf[tau] > 0 && nsdf[tau] > nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1]) {
        peaks.push(tau); if (nsdf[tau] > best) best = nsdf[tau];
      }
    }
    for (var p = 0; p < peaks.length; p++) {
      tau = peaks[p];
      if (nsdf[tau] >= 0.9 * best) {
        var y0 = nsdf[tau - 1], y1 = nsdf[tau], y2 = nsdf[tau + 1], d = y0 - 2 * y1 + y2;
        var shift = d !== 0 ? 0.5 * (y0 - y2) / d : 0;
        return { hz: sr / (tau + shift), clarity: y1 };
      }
    }
    return { hz: 0, clarity: 0 };
  }
  function notePitch(x, sr, a, b) {
    var W = 8192; while (W > 512 && W * 2 > (b - a) * 0.9) W >>= 1;
    var len = b - a, got = [];
    [0.2, 0.35, 0.5].forEach(function (f) {
      var at = a + Math.floor(len * f);
      if (at + W + (W >> 1) < x.length && at + W < b + W) { var r = pitchAt(x, sr, at, W); if (r.hz > 0) got.push(r); }
    });
    if (!got.length) return { midi: null, cents: 0, hz: 0, clarity: 0 };
    got.sort(function (u, v) { return u.hz - v.hz; });
    var mid = got[got.length >> 1], mf = 69 + 12 * Math.log2(mid.hz / 440), m = Math.round(mf);
    return { midi: m, cents: Math.round((mf - m) * 100), hz: mid.hz, clarity: mid.clarity };
  }

  /* ---------- background noise ----------
     The room's noise is measured in the gaps between notes and taken out of
     every note (spectral subtraction, with a floor so no "watery" artefacts). */
  var NFFT = 2048, HOP = 512;
  var WIN = (function () { var w = new Float32Array(NFFT); for (var i = 0; i < NFFT; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NFFT); return w; })();
  function noiseProfile(x, sr, found) {
    var mag = new Float32Array(NFFT / 2 + 1), count = 0, re = new Float32Array(NFFT), im = new Float32Array(NFFT);
    var busy = found.notes.map(function (n) { return [n.start - sr * 0.05, n.end + sr * 0.25]; });
    for (var o = 0; o + NFFT <= x.length; o += NFFT) {
      var clash = false;
      for (var b = 0; b < busy.length; b++) if (o + NFFT > busy[b][0] && o < busy[b][1]) { clash = true; break; }
      if (clash) continue;
      for (var i = 0; i < NFFT; i++) { re[i] = x[o + i] * WIN[i]; im[i] = 0; }
      fft(re, im, false);
      for (var k = 0; k <= NFFT / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
      count++;
    }
    if (count < 3) return null;                    /* too little silence to learn the noise */
    for (var j = 0; j < mag.length; j++) mag[j] /= count;
    return mag;
  }
  function denoise(seg, profile, strength) {
    if (!profile) return seg;
    var pad = NFFT, n = seg.length, buf = new Float32Array(n + 2 * pad), out = new Float32Array(n + 2 * pad), norm = new Float32Array(n + 2 * pad);
    buf.set(seg, pad);
    var re = new Float32Array(NFFT), im = new Float32Array(NFFT), mg = new Float32Array(NFFT / 2 + 1), k, i;
    for (var o = 0; o + NFFT <= buf.length; o += HOP) {
      for (i = 0; i < NFFT; i++) { re[i] = buf[o + i] * WIN[i]; im[i] = 0; }
      fft(re, im, false);
      for (k = 0; k <= NFFT / 2; k++) mg[k] = Math.hypot(re[k], im[k]);
      for (k = 0; k <= NFFT / 2; k++) {
        /* judged on the neighbouring bins too, so single noisy bins do not chirp */
        var ms = (mg[Math.max(0, k - 1)] + 2 * mg[k] + mg[Math.min(NFFT / 2, k + 1)]) / 4;
        var q = ms > 0 ? strength * profile[k] / ms : 1, g = Math.max(1 - q * q, 0.03);
        re[k] *= g; im[k] *= g;
        if (k > 0 && k < NFFT / 2) { re[NFFT - k] *= g; im[NFFT - k] *= g; }
      }
      fft(re, im, true);
      for (i = 0; i < NFFT; i++) { out[o + i] += re[i] * WIN[i]; norm[o + i] += WIN[i] * WIN[i]; }
    }
    var res = new Float32Array(n);
    for (i = 0; i < n; i++) res[i] = norm[pad + i] > 1e-6 ? out[pad + i] / norm[pad + i] : 0;
    return res;
  }
  function rms(x) { var s = 0; for (var i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); }

  /* ---------- one clean sample per note ---------- */
  function cleanNote(x, sr, note, profile, clean) {
    var seg = x.slice(note.start, note.end), i, mean = 0;
    for (i = 0; i < seg.length; i++) mean += seg[i];
    mean /= seg.length;
    for (i = 0; i < seg.length; i++) seg[i] -= mean;
    if (clean) seg = denoise(seg, profile, 2.2);
    var fin = Math.min(seg.length >> 1, Math.round(sr * 0.003)), fout = Math.min(seg.length >> 1, Math.round(sr * 0.05));
    for (i = 0; i < fin; i++) seg[i] *= i / fin;
    for (i = 0; i < fout; i++) seg[seg.length - 1 - i] *= i / fout;
    return seg;
  }

  /* ---------- from a recording to a list of takes ---------- */
  function analyse(x, sr, clean) {
    var found = findNotes(x, sr), profile = noiseProfile(x, sr, found), takes = [];
    found.notes.forEach(function (n) {
      var p = notePitch(x, sr, n.start, n.end), seg = cleanNote(x, sr, n, profile, clean !== false);
      var pk = 0; for (var i = 0; i < seg.length; i++) { var v = Math.abs(seg[i]); if (v > pk) pk = v; }
      takes.push({ midi: p.midi, cents: p.cents, hz: p.hz, clarity: p.clarity, data: seg, sr: sr, peak: pk,
                   level: db(rms(seg)), seconds: seg.length / sr, ok: p.midi !== null && p.clarity >= 0.6 && p.midi >= 21 && p.midi <= 108 });
    });
    return { takes: takes, noiseDb: db(found.noiseRms), peakDb: db(found.peakRms), noiseLearned: !!profile,
             snrDb: db(found.peakRms) - db(found.noiseRms) };
  }

  /* ---------- the instrument: which key plays which take ---------- */
  var TONES = {
    natural: { label: "Natural", lines: [] },
    warm: { label: "Warm", lines: ["fil_type=lpf_2p cutoff=3200 resonance=0"] },
    bright: { label: "Bright", lines: ["eq1_freq=5500 eq1_bw=2 eq1_gain=6"] },
    soft: { label: "Soft", lines: ["ampeg_attack=0.04 volume=-3", "fil_type=lpf_2p cutoff=5000 resonance=0"] }
  };
  function layout(takes, reach) {
    var by = {};
    takes.filter(function (t) { return t.ok; }).forEach(function (t) { (by[t.midi] = by[t.midi] || []).push(t); });
    var notes = Object.keys(by).map(Number).sort(function (a, b) { return a - b; });
    var zones = notes.map(function (m, i) {
      var lo = i === 0 ? Math.max(0, m - reach) : Math.floor((notes[i - 1] + m) / 2) + 1;
      var hi = i === notes.length - 1 ? Math.min(127, m + reach) : Math.floor((m + notes[i + 1]) / 2);
      var ts = by[m].slice().sort(function (a, b) { return a.level - b.level; });
      /* takes of clearly different loudness become soft/loud layers; alike takes take turns */
      var layers = [[ts[0]]];
      for (var k = 1; k < ts.length; k++) {
        var cur = layers[layers.length - 1];
        if (ts[k].level - cur[0].level > 5 && layers.length < 4) layers.push([ts[k]]); else cur.push(ts[k]);
      }
      return { midi: m, lo: lo, hi: hi, layers: layers };
    });
    return zones;
  }
  function keyQuality(zones) {
    var q = {};
    zones.forEach(function (z) { for (var k = z.lo; k <= z.hi; k++) { var d = Math.abs(k - z.midi); q[k] = d === 0 ? "real" : d <= 2 ? "near" : d <= 4 ? "ok" : "far"; } });
    return q;
  }
  function buildInstrument(takes, opts) {
    var name = (opts.name || "My Instrument").replace(/[\\/:*?"<>|]+/g, " ").trim() || "My Instrument";
    var zones = layout(takes, opts.reach == null ? 5 : opts.reach), files = [], gain = 1, pk = 0, used = [];
    zones.forEach(function (z) { z.layers.forEach(function (l) { l.forEach(function (t) { used.push(t); if (t.peak > pk) pk = t.peak; }); }); });
    if (pk > 0) gain = 0.89 / pk;                   /* one gain for all: soft notes stay soft */
    var count = {}, regions = [];
    zones.forEach(function (z) {
      var nl = z.layers.length;
      z.layers.forEach(function (layer, li) {
        var lovel = li === 0 ? 0 : Math.round(127 * li / nl) + 1, hivel = li === nl - 1 ? 127 : Math.round(127 * (li + 1) / nl);
        layer.forEach(function (t, ti) {
          count[z.midi] = (count[z.midi] || 0) + 1;
          var fn = fileNote(z.midi) + "_" + count[z.midi] + ".wav";
          var data = new Float32Array(t.data.length);
          for (var i = 0; i < data.length; i++) data[i] = t.data[i] * gain;
          files.push({ name: name + "/samples/" + fn, bytes: wav24(data, t.sr) });
          regions.push("<region> sample=" + fn + " pitch_keycenter=" + z.midi + " lokey=" + z.lo + " hikey=" + z.hi +
            (t.cents ? " tune=" + (-t.cents) : "") + (nl > 1 ? " lovel=" + lovel + " hivel=" + hivel : "") +
            (layer.length > 1 ? " seq_length=" + layer.length + " seq_position=" + (ti + 1) : ""));
        });
      });
    });
    var made = opts.date || new Date().toISOString().slice(0, 10);
    Object.keys(TONES).forEach(function (key) {
      var t = TONES[key];
      var txt = ["// " + name + " (" + t.label + ")", "// Made with Instrument Maker on " + made + " from the owner's own recording.",
        "// " + zones.length + " recorded notes, " + used.length + " samples.", "", "<control>", "default_path=samples/", "",
        "<global>", "ampeg_release=0.35 amp_veltrack=85"].concat(t.lines).concat(["", "<group>"]).concat(regions).join("\r\n") + "\r\n";
      files.push({ name: name + "/" + name + (key === "natural" ? "" : " - " + t.label) + ".sfz", bytes: utf8(txt) });
    });
    var q = keyQuality(zones), far = Object.keys(q).filter(function (k) { return q[k] === "far"; }).length;
    var readme = [name, "", "Made with Instrument Maker on " + made + ".", "Every sample in this folder was recorded by the owner. Nothing here comes from another sample library.", "",
      "Recorded notes: " + zones.map(function (z) { return noteName(z.midi) + (z.layers.reduce(function (s, l) { return s + l.length; }, 0) > 1 ? " x" + z.layers.reduce(function (s, l) { return s + l.length; }, 0) : ""); }).join(", "),
      "Keys covered: " + (zones.length ? noteName(zones[0].lo) + " to " + noteName(zones[zones.length - 1].hi) : "none"),
      "Keys more than 4 semitones from a recorded note: " + far + (far ? " (record notes near them for a better sound)" : ""), "",
      "To use: keep this folder together and open the .sfz file in any SFZ player (sfizz, Sforzando) or Backing Studio.",
      "Files: " + name + ".sfz (natural), and Warm, Bright and Soft versions made from the same samples."].join("\r\n") + "\r\n";
    files.push({ name: name + "/README.txt", bytes: utf8(readme) });
    return { name: name, files: files, zones: zones, quality: q, samples: used.length, far: far };
  }

  /* ---------- files ---------- */
  function utf8(s) { return new TextEncoder().encode(s); }
  function wav24(x, sr) {
    var n = x.length, b = new Uint8Array(44 + n * 3), v = new DataView(b.buffer);
    function str(o, s) { for (var i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); }
    str(0, "RIFF"); v.setUint32(4, 36 + n * 3, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 3, true); v.setUint16(32, 3, true); v.setUint16(34, 24, true);
    str(36, "data"); v.setUint32(40, n * 3, true);
    for (var i = 0, o = 44; i < n; i++, o += 3) {
      var s = Math.max(-1, Math.min(1, x[i])), q = Math.round(s * 8388607); if (q < 0) q += 16777216;
      b[o] = q & 255; b[o + 1] = (q >> 8) & 255; b[o + 2] = (q >> 16) & 255;
    }
    return b;
  }
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {                              /* stored (no compression): WAV barely shrinks */
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var nm = utf8(f.name), crc = crc32(f.bytes), h = new Uint8Array(30 + nm.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, 0, true); v.setUint16(12, 0x21, true); v.setUint32(14, crc, true); v.setUint32(18, f.bytes.length, true);
      v.setUint32(22, f.bytes.length, true); v.setUint16(26, nm.length, true); v.setUint16(28, 0, true); h.set(nm, 30);
      var c = new Uint8Array(46 + nm.length), w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true);
      w.setUint16(10, 0, true); w.setUint16(12, 0, true); w.setUint16(14, 0x21, true); w.setUint32(16, crc, true);
      w.setUint32(20, f.bytes.length, true); w.setUint32(24, f.bytes.length, true); w.setUint16(28, nm.length, true);
      w.setUint32(42, offset, true); c.set(nm, 46);
      parts.push(h, f.bytes); central.push(c); offset += h.length + f.bytes.length;
    });
    var csize = central.reduce(function (s, c) { return s + c.length; }, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    var all = parts.concat(central, [end]), total = all.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(total), o = 0;
    all.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  /* ---------- an example to open with: five plucked notes, made by maths ---------- */
  function example(sr) {
    var notes = [48, 55, 62, 67, 72], gap = 0.5, dur = 1.6, total = Math.round(sr * (0.6 + notes.length * (dur + gap)));
    var x = new Float32Array(total), seed = 7;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; }
    for (var i = 0; i < total; i++) x[i] = rnd() * 0.004;                 /* a little room noise */
    notes.forEach(function (m, k) {
      var f = 440 * Math.pow(2, (m - 69) / 12), o = Math.round(sr * (0.6 + k * (dur + gap))), n = Math.round(sr * dur);
      for (var j = 0; j < n; j++) {
        var t = j / sr, s = 0;
        for (var h = 1; h <= 8; h++) s += Math.sin(2 * Math.PI * f * h * t) * Math.exp(-t * (1.6 + h * 0.9)) / h;
        x[o + j] += 0.5 * s * Math.min(1, j / (sr * 0.004));
      }
    });
    return x;
  }

  return { noteName: noteName, findNotes: findNotes, notePitch: notePitch, analyse: analyse, layout: layout,
           buildInstrument: buildInstrument, keyQuality: keyQuality, zip: zip, wav24: wav24, crc32: crc32,
           example: example, TONES: TONES, rms: rms, db: db, fft: fft, pitchAt: pitchAt };
})();
if (typeof module !== "undefined") module.exports = Core;
