/* audio.js — SE 15点のWeb Audio合成（04_spec 12-2）＋ BGM（無音フォールバック付き）
 * 音源ファイルは調達2点（se_door_open_01 / se_hit_01）のみ。それも未着なら合成で代替する。
 */
(function () {
  'use strict';

  var ctx = null, master = null, seGain = null, bgmGain = null;
  var opt = { se: 0.8, bgm: 0.55, mute: false };
  try { var s = localStorage.getItem('keirinomaou_opt_v1'); if (s) opt = Object.assign(opt, JSON.parse(s)); } catch (e) {}
  // ?mute=1 で無音起動（自動テスト用。人の環境で不意に音を鳴らさないため）
  try { if (new URLSearchParams(location.search).get('mute') === '1') opt.mute = true; } catch (e) {}

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = opt.mute ? 0 : 1; master.connect(ctx.destination);
    seGain = ctx.createGain(); seGain.gain.value = opt.se; seGain.connect(master);
    bgmGain = ctx.createGain(); bgmGain.gain.value = opt.bgm; bgmGain.connect(master);
    return ctx;
  }
  function resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /* ---------- 部品 ---------- */
  var seScale = 1;                       // playSe(id, scale) の一時倍率（同期呼び出し中のみ有効）
  function noiseBuf(sec) {
    var n = Math.max(1, Math.floor(ctx.sampleRate * sec)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  /** ノイズ1発。 f=中心周波数, q=Q, dur=秒, g=ピーク音量, sweepTo=終端周波数(任意) */
  function noise(f, q, dur, g, t0, sweepTo) {
    var t = (t0 || ctx.currentTime);
    var src = ctx.createBufferSource(); src.buffer = noiseBuf(dur);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f, t); bp.Q.value = q;
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    var gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g * seScale), t + Math.min(0.012, dur * 0.2));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(gn); gn.connect(seGain);
    src.start(t); src.stop(t + dur + 0.02);
  }
  /** 単音。 type, f0→f1, dur, g */
  function tone(type, f0, f1, dur, g, t0, filt) {
    var t = (t0 || ctx.currentTime);
    var o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    var gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g * seScale), t + Math.min(0.010, dur * 0.25));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var last = o; o.connect(gn); last = gn;
    if (filt) { var f = ctx.createBiquadFilter(); f.type = filt.type; f.frequency.value = filt.f; if (filt.q) f.Q.value = filt.q; gn.connect(f); last = f; }
    last.connect(seGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ---------- SE 定義（04_spec 12-2 の実装値） ---------- */
  var SE = {
    se_slam_01: function (t) {                        // 主役SE「ドンッ」×8箇所
      tone('sine', 60, 38, 0.22, 0.9, t);
      noise(2000, 1.2, 0.04, 0.5, t);
    },
    se_stamp_reject_01: function (t) {                // 判「バン」
      noise(900, 2.0, 0.06, 0.7, t);
      tone('sine', 140, 120, 0.09, 0.5, t);
    },
    se_stamp_ok_01: function (t) {                    // 判「トン」＝通った合図（柔らかく・高く）
      noise(1600, 1.4, 0.045, 0.5, t);
      tone('sine', 320, 300, 0.08, 0.35, t);
    },
    se_tap_align_01: function (t) {                   // 紙束を揃える「トントン」
      for (var i = 0; i < 3; i++) {
        noise(1840, 1.4, 0.04, 0.35, t + i * 0.07);
        tone('sine', 368, 350, 0.06, 0.2, t + i * 0.07);
      }
    },
    se_papers_drop_01: function (t) {                 // 紙束がドサァ
      noise(1200, 1.0, 0.18, 0.8, t);
      tone('sine', 90, 70, 0.12, 0.5, t);
    },
    se_glasses_01: function (t) {                     // 老眼鏡カチャ
      tone('sine', 2600, 2600, 0.018, 0.35, t, { type: 'highpass', f: 1500 });
      tone('sine', 3100, 3100, 0.018, 0.35, t + 0.06, { type: 'highpass', f: 1500 });
    },
    se_glasses_off_01: function (t) {                 // 外す（逆順・−20%）
      tone('sine', 2480, 2480, 0.018, 0.32, t, { type: 'highpass', f: 1200 });
      tone('sine', 2080, 2080, 0.018, 0.32, t + 0.06, { type: 'highpass', f: 1200 });
    },
    se_boom_01: function (t) {                        // 激昂「ドオン」S9の1箇所のみ
      tone('sine', 45, 28, 0.7, 1.0, t);
      noise(180, 0.8, 0.12, 0.6, t);
      tone('triangle', 90, 56, 0.5, 0.35, t);
    },
    se_hit_01: function (t) {                         // 一撃（大ゴマ#3-5）
      noise(1400, 1.0, 0.03, 0.8, t);
      tone('square', 180, 120, 0.4, 0.7, t, { type: 'lowpass', f: 900 });
    },
    se_flash_01: function (t) {                       // フラッシュバックのキン
      tone('sine', 3200, 5200, 0.12, 0.3, t, { type: 'highpass', f: 2000 });
    },
    se_step_01: function (t) {                        // 足音（2種ランダム・控えめ）
      noise(Math.random() < 0.5 ? 500 : 700, 1.6, 0.035, 0.12, t);
    },
    se_item_01: function (t) {                        // 小物の受け渡し
      tone('triangle', 880, 880, 0.06, 0.4, t);
      tone('triangle', 1320, 1320, 0.06, 0.4, t + 0.06);
    },
    se_ui_select_01: function (t) {                   // 選択
      tone('triangle', 660, 660, 0.04, 0.25, t);
    },
    se_gulp_01: function (t) {                        // 唾を飲む「ゴク……」
      tone('sine', 220, 90, 0.2, 0.5, t, { type: 'lowpass', f: 600 });
    },
    se_door_open_01: function (t) {                   // 大扉（調達予定・未着の間は合成で代替）
      noise(300, 0.7, 1.2, 0.6, t, 520);
      tone('sine', 55, 48, 1.1, 0.35, t);
    },
  };

  /* ---------- SEの音源ファイル（あればファイル・無ければ合成） --------------
   * つるが作るのは「ここぞ」の5点だけ（se_slam_01 / se_boom_01 / se_hit_01 /
   * se_stamp_reject_01 / se_stamp_ok_01）。残り10点は合成のまま。
   * ファイルを source/audio/se/ に置いて make-assets.py を回せば、**コードを触らずに**
   * そのIDだけファイル再生へ切り替わる。
   * 速射ラッシュは判定のたびに連打するので、1IDにつき要素を4本プールして使い回す。
   * ------------------------------------------------------------------------ */
  var sePool = {}, SE_POOL_N = 4;
  (function () {
    var as = (window.ASSETS || {}).se || {};
    Object.keys(as).forEach(function (id) {
      var pool = [];
      for (var i = 0; i < SE_POOL_N; i++) {
        var a = new Audio();
        a.preload = (i === 0) ? 'auto' : 'none';   // 1本目だけ先読み。残りは初回再生時に読む
        a.src = as[id].src;
        pool.push(a);
      }
      sePool[id] = { list: pool, i: 0 };
    });
  })();

  function playFileSe(id, scale) {
    var p = sePool[id];
    if (!p) return false;
    var a = p.list[p.i = (p.i + 1) % p.list.length];
    try {
      a.currentTime = 0;
      a.volume = opt.mute ? 0 : opt.se * (scale === undefined ? 1 : scale);
      var r = a.play();
      if (r && r.catch) r.catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  function playSe(id, scale) {
    if (!id) return;
    if (playFileSe(id, scale)) return;               // ①つる納品のファイルがあればそれ
    if (!ensure() || !SE[id]) { if (window.DEBUG && !SE[id]) console.warn('UNKNOWN SE:', id); return; }
    resume();
    seScale = (scale === undefined) ? 1 : scale;
    try { SE[id](ctx.currentTime + 0.001); }         // ②無ければWeb Audio合成
    catch (e) { if (window.DEBUG) console.warn('SE失敗', id, e); }
    seScale = 1;
  }

  /* ---------- BGM ----------------------------------------------------------
   * つる納品の8曲は全部「頭でフェードイン → 本編 → 末尾でフェードアウト」。
   * loop=true のままだと末尾で音が消えて頭から鳴り直す“仕切り直し”が毎周聞こえるので、
   * **2要素のクロスフェードで自前ループ**する（実測値は STAGECRAFT.bgmTrack）。
   * 曲が未納品なら無音で進む（例外を出さない）。
   * ------------------------------------------------------------------------ */
  var cur = null;            // { id, a, b, active, timer, track }
  var curId = null;
  var rate = 1;

  function trackOf(id) { return (window.STAGECRAFT.bgmTrack || {})[id] || null; }

  function mkAudio(src, eager) {
    var a = new Audio();
    // 待機側（クロスフェードの相方）は**先に読み込ませない**。
    // 2本同時に取りに行くと、画面に出したい背景画像と帯域を奪い合って
    // シーンの頭が黒いまま数フレーム残る（QA-023）。
    a.preload = eager ? 'auto' : 'none';
    a.src = src;
    a.loop = false;                       // ループは自前でやる
    a.volume = 0;
    try { a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = preservePitch(); } catch (e) {}
    return a;
  }
  function preservePitch() {
    var q = new URLSearchParams(location.search);
    if (q.get('pitch') === '1') return false;    // 聴き比べ用：テープ早回し
    if (opt.pitch === 'tape') return false;      // 設定パネルでの選択（?pitch=1 と同じ効果）
    return window.STAGECRAFT.bgmPreservePitch !== false;
  }
  function vol() { return opt.mute ? 0 : opt.bgm; }

  var lastBgmId = null;          // 止める直前に鳴っていた曲（[BGM:復帰] 系で戻す先）

  function stopBgm(ms) {
    // 台本は「止める」と同じ数だけ「戻す」を書いている（[BGM:復帰]/[元に戻る]/[コミカルに復帰]）。
    // 戻す先を覚えておかないと、止めたきり無音のまま台詞が流れる（QA-028で61行が該当した）。
    if (curId) lastBgmId = curId;
    var c = cur; cur = null; curId = null;
    if (!c) return;
    clearInterval(c.timer);
    var els = [c.a, c.b];
    if (!ms) { els.forEach(function (e) { try { e.pause(); e.src = ''; } catch (x) {} }); return; }
    var v0 = els.map(function (e) { return e.volume; }), t0 = performance.now();
    var t = setInterval(function () {
      var k = (performance.now() - t0) / ms;
      if (k >= 1) { clearInterval(t); els.forEach(function (e) { try { e.pause(); e.src = ''; } catch (x) {} }); return; }
      els.forEach(function (e, i) { try { e.volume = Math.max(0, v0[i] * (1 - k)); } catch (x) {} });
    }, 16);
  }

  function playBgm(id, opts) {
    opts = opts || {};
    if (opts.neverResume) lastBgmId = null;   // この曲へは戻さない（S0の玉座＝二度と鳴らない）
    if (id === curId && cur) return;
    var as = (window.ASSETS || {}).bgm || {};
    stopBgm(opts.cut ? 0 : 300);
    if (!id) return;
    if (!as[id]) {                                   // ★未納品＝無音で進む（例外を出さない）
      if (window.DEBUG) console.info('BGM未納品（無音で進行）:', id);
      curId = id; return;
    }
    var tr = trackOf(id);
    var c = { id: id, a: mkAudio(as[id].src, true), b: mkAudio(as[id].src, false), active: 'a', timer: 0, track: tr };
    c.a.playbackRate = c.b.playbackRate = rate;
    c.a.volume = vol();
    c.a.play().catch(function () {});
    cur = c; curId = id;
    if (!tr) { c.a.loop = true; return; }            // 実測値が無い曲は素直にループ

    // 末尾のフェードアウトに、頭を重ねて繋ぐ
    var xf = Math.max(0.4, tr.dur - tr.fadeStart);
    c.timer = setInterval(function () {
      if (cur !== c) return;
      var on = c[c.active], off = c[c.active === 'a' ? 'b' : 'a'];
      if (c.swapping) {
        var k = Math.min(1, (on.currentTime - tr.loopStart) / xf);
        // 新しい方が上がり、古い方は自前のフェードアウトに任せて落とす
        try { on.volume = vol() * k; off.volume = vol() * (1 - k); } catch (e) {}
        if (k >= 1) { c.swapping = false; try { off.pause(); } catch (e) {} }
        return;
      }
      // 継ぎ目の3秒前に相方を温めておく（preload:'none' のままだと繋ぎ目で間に合わない）
      if (!c.warmed && on.duration && on.currentTime >= tr.fadeStart - 3) {
        c.warmed = true;
        try { off.preload = 'auto'; off.load(); } catch (e) {}
      }
      if (on.duration && on.currentTime >= tr.fadeStart) {
        try {
          off.currentTime = tr.loopStart;
          off.volume = 0;
          off.playbackRate = rate;
          off.play().catch(function () {});
          c.active = (c.active === 'a') ? 'b' : 'a';
          c.swapping = true;
        } catch (e) {}
      }
    }, 60);
  }

  /** `[BGM:復帰]` `[BGM:元に戻る]` `[BGM:コミカルに復帰]`：
   *  **止める直前に鳴っていた曲へ戻す**。台本の3タグはどれも「独白・沈黙のために止めた曲を
   *  もとに戻す」意味なので、1つの動作にまとめてよい（S4=shinsa / S5=shinmiri / S6=shinsa）。 */
  function resumeBgm() {
    if (cur) return;                        // すでに何か鳴っていれば触らない
    if (!lastBgmId) { if (window.DEBUG) console.info('BGM復帰：戻す先がない'); return; }
    playBgm(lastBgmId);
  }

  /** `[BGM:最高潮]`（03_assets 7-3）：曲の一番厚いところへ跳ぶ。
   *  そこを1秒ほど鳴らした直後にフェードなしで切られるのが冒頭の見せ場。 */
  function climax() {
    if (!cur || !cur.track) return;
    var on = cur[cur.active];
    try { on.currentTime = cur.track.climax; on.volume = vol(); } catch (e) {}
  }

  function setRate(r) {
    rate = r;
    if (!cur) return;
    [cur.a, cur.b].forEach(function (e) {
      try { e.playbackRate = r; e.preservesPitch = e.mozPreservesPitch = e.webkitPreservesPitch = preservePitch(); } catch (x) {}
    });
  }
  function saveOpt() {
    try { localStorage.setItem('keirinomaou_opt_v1', JSON.stringify(opt)); } catch (e) {}
  }
  /** 設定パネルからの音量変更（つる指摘【4】）。
   *  合成SEは seGain 経由なのでゲインを、ファイルSEは鳴らすたび opt.se を読むので自動、
   *  BGMは HTMLAudioElement なので**いま鳴っている要素の volume も入れ直す**。 */
  function setVol(kind, v) {
    v = Math.max(0, Math.min(1, +v));
    if (isNaN(v)) return;
    opt[kind] = v;
    if (kind === 'se' && seGain) seGain.gain.value = v;
    if (kind === 'bgm') {
      if (bgmGain) bgmGain.gain.value = v;
      if (cur) { try { cur[cur.active].volume = vol(); } catch (e) {} }
    }
    saveOpt();
  }
  function setPitchMode(tape) {
    opt.pitch = tape ? 'tape' : 'keep';
    saveOpt();
    setRate(rate);                             // いま鳴っている曲へ即反映
  }

  function setMute(m) {
    opt.mute = !!m;
    if (master) master.gain.value = opt.mute ? 0 : 1;
    if (cur) { try { cur[cur.active].volume = vol(); } catch (e) {} }
    try { localStorage.setItem('keirinomaou_opt_v1', JSON.stringify(opt)); } catch (e) {}
  }

  window.SOUND = {
    resume: resume, se: playSe, bgm: playBgm, stopBgm: stopBgm,
    rate: setRate, mute: setMute, isMuted: function () { return opt.mute; },
    vol: setVol, pitchMode: setPitchMode,
    getOpt: function () { return { se: opt.se, bgm: opt.bgm, mute: opt.mute, pitch: opt.pitch || 'keep' }; },
    climax: climax, resumeBgm: resumeBgm, currentBgm: function () { return curId; },
    lastBgm: function () { return lastBgmId; },
    seSource: function (id) { return sePool[id] ? 'file' : (SE[id] ? 'synth' : 'none'); },
    _now: function () { return cur ? { id: cur.id, t: cur[cur.active].currentTime, v: cur[cur.active].volume,
      rate: cur[cur.active].playbackRate, pitch: cur[cur.active].preservesPitch, swapping: !!cur.swapping,
      other: { t: cur[cur.active === 'a' ? 'b' : 'a'].currentTime, v: cur[cur.active === 'a' ? 'b' : 'a'].volume,
               paused: cur[cur.active === 'a' ? 'b' : 'a'].paused } } : null; },
    _seek: function (t) { if (cur) { try { cur[cur.active].currentTime = t; } catch (e) {} } },   // 自動テスト用
    _ids: Object.keys(SE),
  };
})();
