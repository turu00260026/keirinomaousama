/* engine.js — 『経理の魔王様』進行エンジン（04_spec.md 6〜11章）
 * 台詞は1行もこのファイルに書かない。すべて scenes.js（02_scenario.md の自動変換物）から読む。
 */
(function () {
  'use strict';

  var Q = new URLSearchParams(location.search);
  window.DEBUG = Q.get('debug') === '1';
  var SC = window.STAGECRAFT, AS = window.ASSETS || {}, ASTATE = window.ASSET_STATE || {};
  var SAVE_KEY = 'keirinomaou_save_v1';

  /* 題まわりの確定文言（2026-08-23 つる裁定／裁定P）。**画面に出す題はここ1箇所だけ**。
   * 旧題（仮題）は廃止済み。02_scenario.md 179行のタイトルコール行は本文の正なので
   * 旧題の文字列のまま残っているが、あれは parse.js が titlecall ノードへ畳む合図でしかなく
   * （ノードに本文を持たせていない）、画面に出るのは下の TITLE とロゴ画像だけ。
   * キャッチコピーはロゴ画像に入っていないので CSS で組む（差し替えが利くように）。 */
  var TITLE = '経理の魔王様';
  var TAGLINE = 'その冒険、経費で落ちると思うなよ';
  // つる指示（2026-08-26）「2話ないなら1話って記載なくして」。
  // 続きが無いのに「第1話」と出すと続篇があると誤解させる。話数の表記は全廃し、
  // サブタイトル（作品の内容を示す部分）だけを残す。
  var SUBTITLE = '勇者ご一行、精算に参りました';
  window.TITLE_TEXT = { title: TITLE, tagline: TAGLINE, subtitle: SUBTITLE };

  /* =======================================================================
   * 状態（04_spec 5-1。企画書10章＋裁定L/M の範囲のみ）
   * ===================================================================== */
  var S = null;
  function freshState() {
    return {
      scene: 'S0', node: 0,
      voucher_status: { V1: 'pending', V2: 'pending', V3: 'pending', V4: 'pending', V5: 'pending' },
      evidence: [],
      stomach: 3,
      slip_index: 1,
      reveal_stage: 0,
      talked_npc: { tact: false, kanban: false, falm: false, norman: false },
      hint_kanban: false, hint_falm: false,
      wrong_tried: {},
    };
  }

  /* =======================================================================
   * DOM
   * ===================================================================== */
  var el = {};
  function $(id) { return document.getElementById(id); }
  function bind() {
    ['app', 'view', 'bg', 'komaImg', 'mapCanvas', 'charaL', 'charaC', 'charaR', 'fxLayer',
     'balloons', 'dock', 'hud', 'stomachBox', 'slipBox', 'muteBtn', 'textbox',
     'speaker', 'body', 'choices', 'overlay', 'komaCaption', 'shout', 'debugBox', 'slipCard', 'voucher',
     'sysBtns', 'btnBack', 'btnCfg', 'reviewBar', 'sceneCard', 'roamGoal', 'mvAct']
      .forEach(function (k) { el[k] = $(k); });
  }

  /* ---- 画像差し替えの3点セット（04_spec 13-3・Q-014の事故防止） -------- */
  function setImage(node, url, onload) {
    if (node._onload) { node.onload = null; node.onerror = null; node._onload = null; }
    node.removeAttribute('src');
    if (!url) { node.style.display = 'none'; node.dataset.missing = ''; return; }
    node.style.display = 'block';
    node._onload = function () { node.dataset.missing = ''; if (onload) onload(); };
    node.onload = node._onload;
    node.onerror = function () {
      node.dataset.missing = '1';
      if (window.DEBUG) console.warn('MISSING ASSET:', url);
    };
    node.src = url;
  }
  function assetUrl(group, id) {
    var g = AS[group] || {};
    if (keyed[id]) return keyed[id];          // マゼンタを抜いた表示用があればそちら
    return g[id] ? g[id].src : null;
  }

  /* マゼンタ地の素材（つるの透過待ち）を表示時だけ抜く。
     原本は書き換えないので、つる裁定①「機械的な色抜きで素材を作らない」を侵さない。
     つるが透過PNGを納品したら ASSET_STATE のフラグが落ちて、この処理は丸ごと動かなくなる。 */
  var keyed = {};

  /** マゼンタ(255,0,255)地を、アンチエイリアスの縁ごと正しく抜く。
   *  素材の縁はマゼンタと絵柄が混ざった半透明画素になっているので、
   *  「r>200 && g<60 && b>200」のような一発の閾値では縁が抜けきらず**ピンクの縁**が残る
   *  （QA-004 実測：原本PNGの時点でロゴ7,325px／差戻2,251px／承認1,189px）。
   *  m=(r+b)/2-g を「マゼンタらしさ」として T_LOW..T_HIGH で線形にアルファを作り、
   *  半透明になった画素からは乗っているマゼンタを引き算して元の色へ戻す。 */
  function keyMagenta(imageData) {
    var p = imageData.data, T_LOW = 60, T_HIGH = 130, span = T_HIGH - T_LOW;
    for (var i = 0; i < p.length; i += 4) {
      var r = p[i], g = p[i + 1], b = p[i + 2];
      var m = (r + b) / 2 - g;
      if (m <= T_LOW) continue;                       // 絵柄：そのまま
      if (m >= T_HIGH) { p[i + 3] = 0; continue; }    // 地：完全に抜く
      var a = 1 - (m - T_LOW) / span;                 // 縁：部分的に抜く
      p[i]     = Math.max(0, Math.min(255, (r - 255 * (1 - a)) / a));
      p[i + 1] = Math.max(0, Math.min(255, (g - 0   * (1 - a)) / a));
      p[i + 2] = Math.max(0, Math.min(255, (b - 255 * (1 - a)) / a));
      p[i + 3] = Math.round(a * 255);
    }
    return imageData;
  }

  function prekey(ids, done) {
    var left = ids.length;
    if (!left) return done();
    ids.forEach(function (id) {
      var url = (AS.ui || {})[id] && AS.ui[id].src;
      if (!url) { if (--left === 0) done(); return; }
      var im = new Image();
      im.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          var g = c.getContext('2d'); g.drawImage(im, 0, 0);
          g.putImageData(keyMagenta(g.getImageData(0, 0, c.width, c.height)), 0, 0);
          keyed[id] = c.toDataURL('image/png');
        } catch (e) {
          if (window.DEBUG) console.info('キー抜き不可（http で開いてください）:', id);
        }
        if (--left === 0) done();
      };
      im.onerror = function () { if (--left === 0) done(); };
      im.src = url;
    });
  }

  /* =======================================================================
   * テキスト整形（`**強調**` → <em>。文字は足さない・削らない）
   * ===================================================================== */
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<em class="emph">$1</em>'); }
  /** つる指摘（2026-09-01 スマホ実機）S9「不備をなくせ！！」の大書き文字に
   *  `<em class="emph">` がそのまま出ていた。**plain に渡ってくるのは md() 済みのHTML**
   *  なのに `**` しか外していなかったのが原因。タグを外してから実体参照を戻す
   *  （順番が逆だと、台詞の中の文字としての `<` をタグとして食う）。 */
  function plain(s) {
    return String(s || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/\*\*/g, '');
  }

  /* =======================================================================
   * 演出（04_spec 11章）
   * ===================================================================== */
  var FX = {
    shake: function (strong) {
      el.view.classList.remove('shake', 'shakeHard');
      void el.view.offsetWidth;
      el.view.classList.add(strong ? 'shakeHard' : 'shake');
    },
    flash: function (gain) {
      var d = document.createElement('div'); d.className = 'fxFlash';
      el.fxLayer.appendChild(d); setTimeout(function () { d.remove(); }, 220);
      SOUND.se('se_flash_01', gain);
    },
    lines: function () {
      var d = document.createElement('div'); d.className = 'fxLines';
      el.fxLayer.appendChild(d); setTimeout(function () { d.remove(); }, 700);
    },
    write: function (text) {
      var d = document.createElement('div'); d.className = 'fxWrite'; d.textContent = text;
      d.style.setProperty('--rot', (Math.random() * 12 - 6).toFixed(1) + 'deg');
      el.fxLayer.appendChild(d); setTimeout(function () { d.remove(); }, 1100);
    },
    zoom: function () {
      el.view.classList.remove('zoomIn'); void el.view.offsetWidth; el.view.classList.add('zoomIn');
      setTimeout(function () { el.view.classList.remove('zoomIn'); }, 1200);
    },
    fadeBlack: function (cb) {
      var d = document.createElement('div'); d.className = 'fxBlack';
      el.fxLayer.appendChild(d);
      setTimeout(function () { d.classList.add('out'); if (cb) cb(); }, 420);
      setTimeout(function () { d.remove(); }, 720);
    },
    stamp: function (kind) {
      var url = assetUrl('ui', kind === 'approve' ? 'ui_stamp_approve_01' : 'ui_stamp_reject_01');
      if (!url) return;
      var d = document.createElement('img'); d.className = 'fxStamp'; d.src = url;
      el.fxLayer.appendChild(d);
      setTimeout(function () { d.remove(); }, 900);
    },
  };

  /* タグ配列を演出に落とす。戻り値＝この行の追加待ち時間(ms) */
  /* =======================================================================
   * 演出タグのディスパッチ表（04_spec 11章）
   *
   * ★ここは **if-else の羅列にしない**。台本のタグに対して実装の分岐が
   *   「あるか無いか」を smoke-test が機械で突き合わせられるよう、
   *   **処理するタグ**と**意図的に無視するタグ**を両方テーブルで宣言する。
   *   （`[BGM:一撃]` と `[BGM:復帰]` を続けて取りこぼした反省。QA-028）
   *   → `window.TAG_SUPPORT` として公開し、smoke-test 20章が全数検査する。
   * ===================================================================== */
  var TAG = {
    /* ---- 単独タグ ---- */
    simple: {
      'shake':        function (c) { FX.shake(false); },
      'shake:強':     function (c) { FX.shake(true); },
      '集中線':       function (c) { if (!c.quiet) FX.lines(); },
      'flash':        function (c) { FX.flash(); },
      'ズームイン':   function (c) { FX.zoom(); },
      'ズーム':       function (c) { FX.zoom(); },
      '暗転→明転':   function (c) { FX.fadeBlack(); },
      '明転':         function (c) { FX.flash(); },
      '明朝体':       function (c) { el.app.dataset.font = 'mincho'; },
      'ゴシック体':   function (c) { el.app.dataset.font = 'gothic'; },
      '無言ビート':   function (c) { c.extra = Math.max(c.extra, 320); },
      '即答':         function (c) { c.extra = -1; },
      '書き文字:ガーン': function (c) { if (!c.quiet) FX.write('ガーン'); },
      '老眼鏡を外す': function (c) { SOUND.se('se_glasses_off_01'); },
    },
    /* ---- BGM: の値ごと ---- */
    bgm: {
      'ぶつ切り': function (c) {
        // 【本作の第一の見せ場】03_assets 7-3 のタイムラインは runOpeningCut() が持つ。
        // ここへ来るのは S1 以外で使われた場合の保険（現状の台本では到達しない）。
        SOUND.stopBgm(0);
      },
      '最高潮':   function (c) { SOUND.climax(); },
      '一撃':     function (c) { SOUND.stopBgm(0); SOUND.se('se_hit_01'); },
      '停止':     function (c) { SOUND.stopBgm(0); },
      '止まる':   function (c) { SOUND.stopBgm(0); },
      '止む':     function (c) { SOUND.stopBgm(0); },
      '一瞬止まる': function (c) { SOUND.stopBgm(0); c.extra = Math.max(c.extra, 260); },
      // ★止めたら戻す。台本は「止める」と同じ数だけ「戻す」を書いている（QA-028）
      '復帰':           function (c) { SOUND.resumeBgm(); },
      '元に戻る':       function (c) { SOUND.resumeBgm(); },
      'コミカルに復帰': function (c) { SOUND.resumeBgm(); },
    },
    /* BGM: のうち「曲の指定そのもの」。曲は scene / bgmByVariant が鳴らすので、
       タグ側では何もしないのが正しい。**無視してよい理由を明記して列挙する。** */
    bgmIgnored: {
      '荘厳': 'S0一枚絵①＝bgm_opening_01（scene表で再生済み）',
      '重厚': 'S0一枚絵②＝bgm_throne_01（bgmByVariantで再生済み）',
      '事務的なのに緊迫': 'S2＝bgm_shinsa_01（scene表）',
      '少ししんみり': 'S5＝bgm_shinmiri_01（scene表）',
      'のんびり': '幕間＝bgm_field_01（scene表）',
      '速い事務ロック': 'S7.5＝bgm_rush_01（scene表）',
      'ボス戦（ただし事務的）': 'S8＝bgm_boss_01（scene表）',
      'とほほなBGM': 'S9城門前＝bgm_tohoho_01（bgmByVariant）',
      'だんだん忙しなくなる': 'S9の不備ループ。曲は足さず playbackRate を1.0→1.3（差し戻し行で処理）',
    },
    tone: { 'serious': 'serious', 'serious寄り': 'serious', 'gag': 'gag', '回想': 'kaisou' },
    speed: { '遅': 58, '速': 8 },
    /* 値が自由なタグ（中身は stagecraft の表で解決する） */
    freeValue: ['sfx:', '大ゴマ'],
    /* 演出メモ・ト書き・状態注記。**画面には出さないが、取りこぼしではない**ことを宣言する */
    ignored: {
      'v2.0増補': '執筆メモ（増補箇所の印）。画面に出すものではない',
      'モノクロ': '大ゴマ側のCSSで処理（stagecraft.koma の mono → .koma.mono）',
      '粗線': '大ゴマの作画指定。素材そのものが粗線で描かれている（03_assets 4-2）',
      '暗色トーン': 'tone:serious と同義。同じ行の tone:serious が担当',
      '心の声表示': '台本が（）付きで書いており、そのまま表示している',
      '大書き文字': 'タイトルコール演出（titlecall ノード）が担当',
      'hint_kanban=true': 'フラグは幕間の入場時に立てる（enterRoam の flagOnEnter）',
      'hint_falm=true': 'フラグは幕間の入場時に立てる（enterRoam の flagOnEnter）',
      '記憶のフラッシュバック演出': '同じ行の [flash] が実際の演出を担当',
      '小さく': 'ト書き（声量の指示）。表示は変えない',
      '素直': 'ト書き（演技指示）。表情差分 norman_d で表現',
      '噛みしめている': 'ト書き（演技指示）。表情差分 tact_c で表現',
      '目が据わっている': 'ト書き（演技指示）。表情差分 falm_b で表現',
      'ドヤ顔': 'ト書き（演技指示）。大ゴマ #2-4 の絵で表現',
      '全員集合': '3人同時表示（trio）が担当',
      '3人同時': '3人同時表示（trio）が担当。台詞は「「「」」」で括られている',
      '3人歓声': '3人同時表示（trio）が担当',
      '全員がゆっくりノルマンを見る': 'ト書き。同じ行の [shake] が実際の演出を担当',
      '崩れ落ちる': 'ト書き（演技指示）。表情差分 norman_c で表現',
      '次回の燃料': '執筆メモ（第2話への伏線の印）',
      '小さい文字': '吹き出しの small クラスで処理（.balloon.small）',
      '遠景のまま': '吹き出しの small クラスで処理（.balloon.small）',
      'かすかに': '吹き出しの small クラスで処理（.balloon.small）',
      'カメラが魔王の机へ戻る': 'ト書き。背景は据え置きで、台詞だけで見せる',
    },
    /* 接頭辞ごと無視するもの */
    ignoredPrefix: {
      '※': '執筆メモ（秘密Aの注記）',
      '操作:': 'RPG層の操作仕様（enterRoamが担当）',
      'NPC:': '同上',
      '背景:': 'scene表で背景を設定済み',
      'カメラ:': 'ト書き（一枚絵で表現）',
    },
  };
  window.TAG_SUPPORT = TAG;
  /** 自動検査用：タグを実際に発火させたあと、外から見えない内部状態を読む。
   *  （smoke-test 20章が「宣言があるか」ではなく「本当に効いたか」を見るために使う） */
  TAG._probe = function () {
    return { speed: speed, font: el.app && el.app.dataset ? el.app.dataset.font : null,
             tone: el.app && el.app.dataset ? el.app.dataset.tone : null };
  };
  TAG._apply = function (tags) { return applyTags(tags); };

  /** タグ配列を演出に落とす。戻り値＝この行の追加待ち時間(ms) */
  function applyTags(tags) {
    if (!tags || !tags.length) return 0;
    // ★大ゴマ#3-3 は「静の1枚」（03_assets 4-2 / 6章）。同じ行に付いている
    //   [集中線]・書き文字は出さない（SEだけは 7-2 のとおり鳴らす）。
    var ctx = {
      extra: 0,
      quiet: tags.some(function (t) {
        var m = t.match(/^大ゴマ(#[0-9-]+)/);
        return m && SC.koma[m[1]] && SC.koma[m[1]].quiet;
      }),
    };
    tags.forEach(function (t) {
      if (TAG.simple[t]) return TAG.simple[t](ctx);
      if (t.indexOf('sfx:') === 0) {
        var name = t.slice(4);
        if (!ctx.quiet) FX.write(name.replace(/……$/, '…'));  // 静の1枚では書き文字を出さない
        return SOUND.se(SC.sfx[name] || null);                 // 音は 03_assets 7-2 のとおり鳴らす
      }
      if (t.indexOf('大ゴマ') === 0) return showKoma(t);
      if (t.indexOf('BGM:') === 0) {
        var b = t.slice(4);
        if (TAG.bgm[b]) return TAG.bgm[b](ctx);
        if (TAG.bgmIgnored[b]) return;
        return window.DEBUG && console.warn('未実装のBGMタグ:', t);
      }
      if (t.indexOf('tone:') === 0) {
        var v = TAG.tone[t.slice(5)];
        return v ? setTone(v) : (window.DEBUG && console.warn('未実装のtoneタグ:', t));
      }
      if (t.indexOf('テキスト送り:') === 0) {
        var sp = TAG.speed[t.slice(7)];
        return (sp !== undefined) ? (speed = sp) : (window.DEBUG && console.warn('未実装の送りタグ:', t));
      }
      if (TAG.ignored[t]) return;
      for (var pf in TAG.ignoredPrefix) if (t.indexOf(pf) === 0) return;
      if (window.DEBUG) console.warn('未知のタグ:', t);
    });
    return ctx.extra;
  }
  function setTone(t) { el.app.dataset.tone = t; }

  /* =======================================================================
   * 層の組み替え（04_spec 3-1）
   * ===================================================================== */
  var layer = '決裁';
  function setLayer(l, variant) {
    layer = l;
    el.app.dataset.layer = l;
    el.mapCanvas.style.display = (l === 'RPG' && !currentBg) ? 'block' : 'none';
    el.komaImg.style.display = (l === '漫画') ? 'block' : 'none';
    el.komaCaption.style.display = (l === '漫画') ? 'block' : 'none';
    // 漫画層は大ゴマの中のキャプションで読ませる（04_spec 10-2「#dockは使わない」）。
    // 空の本文窓が画面下40%を占めて大ゴマを潰していた（QA-006）。
    el.dock.style.display = (l === '決裁') ? 'flex' : 'none';
    el.balloons.style.display = (l === 'RPG' || l === '漫画') ? 'block' : 'none';
    if (l !== '漫画') { setImage(el.komaImg, null); el.komaCaption.innerHTML = ''; hideShout(); }
    if (l !== 'RPG') el.balloons.innerHTML = '';
    // QA-054: 入口（showKoma）で --komaPad を渡していたが、**出口が無かった**。
    // setImage(img, null) は url が null なら即 return して onload を呼ばないので、
    // 漫画層を抜けても値が残り続ける（S1に大ゴマ#1があるので S2以降ずっと）。
    // 決裁層は #dock が出て #view=506px なので、残った292pxが書き文字を140pxずらす
    // （画面の26%→54%）。層を抜けたら必ず0へ戻す。
    fitKomaCaption();
    // D-padは「実際に歩ける場面」だけ出す。層だけで判定すると、歩けないカットシーン
    // （冒頭シリアス等）にも十字キーが出てナレーションを覆う（QA-003）。
    updateWalkFlag();
    syncVoucher();
    updateChara();
  }

  /** 「いま実際に歩けるか」。D-pad と［調べる］の表示条件はこれ1本に集約する。
   *  roam の生成・会話の開始/終了・層の切替のたびに必ず呼ぶこと。 */
  function updateWalkFlag() {
    var can = (layer === 'RPG' && !!roam && !roam.cutscene && !roam.talking);
    el.app.dataset.walk = can ? '1' : '';
  }

  var currentBg = null;
  function setBg(id) {
    currentBg = id || null;
    if (!id) { setImage(el.bg, null); el.view.dataset.letterbox = ''; el.view.style.removeProperty('--bgTex'); return; }
    var url = assetUrl('bg', id);
    setImage(el.bg, url, fitNarration);   // 読み込み完了後にも測る（naturalWidth が要る）
    // 一枚絵は contain で「切らない」（Q-014「16:9を縦持ちでcoverすると横26%」の再発防止を、
    // 横長でも効かせる。つる実機report：1920×900で顔と台詞の頭が画面外だった）。
    var one = (id !== 'bg_shinsa_01');
    el.bg.dataset.fit = one ? 'auto' : 'cover';
    fitNarration();                       // 一枚絵なら「絵の下端」を測ってナレーション帯に渡す
    el.bg.dataset.pan = '';
    // contain の余白に同じ絵をぼかして敷く。**var() に入れる url() は絶対URLにする**
    // （宣言元＝css/ 基準で解決されて404る。QA-004で一度踏んだ罠）。
    el.view.dataset.letterbox = one ? '1' : '';
    if (one && url) el.view.style.setProperty('--bgTex', 'url("' + new URL(url, location.href).href + '")');
    else el.view.style.removeProperty('--bgTex');
  }
  /** bg_shinsa_01（2400×1350）の左右パンで2画角（03_assets 1-3） */
  function setAngle(a) { if (currentBg === 'bg_shinsa_01') el.bg.dataset.pan = a; }

  /* ---- 立ち絵（決裁層） ---- */
  var charaState = { left: 'maou', right: null, trio: false, speaker: null, face: {} };
  function faceOf(who, scene, text) {
    var ov = SC.faceOverride, p = plain(text || '');
    for (var i = 0; i < ov.length; i++) {
      var o = ov[i];
      if (o.who !== who) continue;
      if (o.scene && o.scene !== scene) continue;
      if (p.indexOf(o.key) >= 0) return o.face;
    }
    var d = SC.faceDefault[who];
    if (!d) return null;
    return d[scene] || d._;
  }
  function charaId(who, f) { return 'chara_' + who + '_' + f; }
  function charaUrl(who, f) { return assetUrl('chara', charaId(who, f)); }
  /** その立ち絵が透過済みか。**素材ID単位**で見る——つるの透過作業は1枚ずつ進むので、
   *  透過済みと未透過が混在する。全点そろうまで待たずに、済んだ絵から本番表示になる。 */
  function isTransparent(id) {
    var g = (AS.chara || {})[id];
    if (g && typeof g.transparent === 'boolean') return g.transparent;
    return !!ASTATE.charaTransparent;                       // 旧マニフェスト互換
  }
  /** 未透過の絵だけ仮表示（淡グレー地を multiply で背景へなじませる）。透過済みには掛けない。 */
  function applyChara(node, who, f) {
    if (!who) { setImage(node, null); return; }
    var id = charaId(who, f);
    setImage(node, assetUrl('chara', id));
    node.classList.toggle('untransparent', !isTransparent(id));
  }
  /** ゲームオーバー幕1〜幕2は一枚絵 still_maou_sleep_01 が場面そのもの（つる作画・裁定X）。
   *  伏せた魔王が絵の中に居るので、決裁層のまま立ち絵だけ引っ込める。幕4で false に戻す。 */
  var goArt = false;
  function updateChara() {
    var show = (layer === '決裁') && !goArt;
    [el.charaL, el.charaC, el.charaR].forEach(function (n) { n.style.display = show ? 'block' : 'none'; });
    if (!show) return;
    var lf = charaState.face.maou || 'a';
    applyChara(el.charaL, 'maou', lf);
    el.charaL.classList.toggle('active', charaState.speaker === 'maou');
    if (charaState.trio) {
      el.charaC.style.display = 'block';
      applyChara(el.charaC, 'kanban', charaState.face.kanban || 'a');
      applyChara(el.charaR, 'tact', charaState.face.tact || 'a');
      el.charaR.classList.add('active'); el.charaC.classList.add('active');
      el.charaL.dataset.trio = '1';
    } else {
      el.charaC.style.display = 'none';
      el.charaL.dataset.trio = '';
      if (charaState.right) {
        applyChara(el.charaR, charaState.right, charaState.face[charaState.right] || 'a');
        el.charaR.classList.toggle('active', charaState.speaker === charaState.right);
      } else setImage(el.charaR, null);
    }
  }

  /* ---- 大ゴマ ---- */
  var pendingAfterglow = 0;      // 大ゴマの最低表示時間（次に出す1行へ持ち越す）

  function showKoma(tag) {
    var key = (tag.match(/^大ゴマ(#[0-9-]+)/) || [])[1];
    var k = SC.koma[key];
    if (!k) { if (window.DEBUG) console.warn('未定義の大ゴマ:', tag); return; }
    // 【規約】ここぞのSEを伴う大ゴマは SE尺＋余裕を最低表示時間として保証する（stagecraft ⑨c）
    var ag = (SC.afterglowKoma || {})[key];
    if (ag) pendingAfterglow = Math.max(pendingAfterglow, ag.ms);
    setLayer('漫画');
    setImage(el.komaImg, assetUrl('koma', k.file), fitKomaCaption);  // 読み込み完了後にも測る（naturalWidth が要る）
    el.komaImg.className = 'koma' + (k.mono ? ' mono' : '') + (k.big ? ' big' : '');
    if (k.split) el.komaImg.dataset.half = /下コマ/.test(tag) ? 'bottom' : 'top';
    else el.komaImg.dataset.half = '';
    fitKomaCaption();
    if (k.quiet) return;                       // ★#3-3 は静の1枚：集中線も書き文字も出さない
  }

  /* つる指摘【18】：大ゴマは object-fit:contain なので、画面が画像より縦長だと
     上下に黒帯が出る。台詞を画面下端(bottom:0)に置くと「絵の外の真っ黒な余白」に
     浮いてしまう（スマホ390x844では画像高さ260pxに対し台詞が292px下）。
     実表示された絵の下端を測り、--komaPad として黒帯の高さを渡す。
     .koma[data-half] は cover なので黒帯は出ない＝0 でよい。 */
  function fitKomaCaption() {
    var img = el.komaImg, root = document.getElementById('app') || document.documentElement;
    if (!img || !img.naturalWidth) { root.style.setProperty('--komaPad', '0px'); return; }
    if (img.dataset.half) { root.style.setProperty('--komaPad', '0px'); return; }
    var box = img.getBoundingClientRect();
    if (!box.height) { root.style.setProperty('--komaPad', '0px'); return; }
    var shown = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    var pad = Math.max(0, (box.height - img.naturalHeight * shown) / 2);
    root.style.setProperty('--komaPad', Math.round(pad) + 'px');
  }
  window.addEventListener('resize', fitKomaCaption);

  /* つる指摘【20】（2026-08-27 スマホ実機）「下のテキストボックス、画像のすぐ下に配置して」。
     一枚絵（`data-fit="auto"`＝contain）はスマホの縦長画面だと上下に大きく余白が出る。
     ナレーション帯は bottom 固定だったので、**絵から遠く離れた画面の底**に置かれていた。
     大ゴマで入れた --komaPad と同じ考え方で、**実際に描かれた絵の下端**を測って渡す。
     cover のときは余白が無いので 0。 */
  function fitNarration() {
    var root = el.app || document.documentElement;
    var img = el.bg;
    if (!img || img.style.display === 'none' || !img.naturalWidth || img.dataset.fit !== 'auto') {
      root.style.setProperty('--bgPad', '0px');
      return;
    }
    var vr = el.view.getBoundingClientRect();
    var r = drawnRect(img, img.naturalWidth, img.naturalHeight);
    var pad = Math.max(0, vr.height - (r.y + r.h));
    root.style.setProperty('--bgPad', Math.round(pad) + 'px');
  }
  window.addEventListener('resize', fitNarration);

  /* =======================================================================
   * テキスト表示
   * ===================================================================== */
  var speed = 26, typing = null, typeCb = null, inputLock = 0;

  function showLine(node, cb) {
    var who = node.who, name = node.name || '';
    if (who !== 'narration' && who !== 'extra' && who !== 'trio' && SC.faceDefault[who]) {
      charaState.face[who] = faceOf(who, S.scene, node.text) || charaState.face[who] || 'a';
      if (who !== 'maou') charaState.right = who;
      charaState.trio = false;
    }
    if (who === 'trio') { charaState.trio = true; charaState.right = 'tact'; }
    charaState.speaker = who;
    el.app.dataset.speaker = who;
    el.app.dataset.trio = charaState.trio ? '1' : '';
    if (layer === '決裁') { setAngle(who === 'maou' ? 'left' : 'right'); updateChara(); }

    var html = md(node.text);
    if (node.mono) html = '（' + html + '）';
    if (node.group) html = '「「' + html + '」」';

    pushHistory({ who: who, name: name, html: html, node: node, layer: layer, scene: S.scene });
    if (layer === 'RPG') showBalloon(who, name, html, node, cb);
    else if (layer === '漫画') showKomaCaption(who, name, html, node, cb);
    else showDock(who, name, html, node, cb);
    if (window.DEBUG) verifyText(node, html);
  }

  /* =======================================================================
   * 読み返し（つる指摘【4】「一個前の表示に戻る戻るボタン」）
   * ★状態は1バイトも巻き戻さない。**表示し直すだけ**。
   *   選択肢の判定を取り消せると胃ゲージが壊れるので、「進行を戻す」のではなく
   *   「直前に出た台詞をもう一度出す」方式にした。これなら判定・フラグ・伝票の
   *   状態に触れようがない＝**判定を跨いで戻る事故が原理的に起きない**。
   *   同じシーン・同じ層の中だけを遡る（層をまたぐと絵の前提が変わるため）。
   * ===================================================================== */
  var history = [], reviewAt = -1, HISTORY_MAX = 24;
  function pushHistory(rec) {
    if (reviewAt >= 0) return;                       // 読み返しの再描画は積まない
    var last = history[history.length - 1];
    if (last && (last.scene !== rec.scene || last.layer !== rec.layer)) history.length = 0;
    history.push(rec);
    if (history.length > HISTORY_MAX) history.shift();
    updateSysBtns();
  }
  function canReview() {
    return !choicesOpen && !typing && !cfgOpen && history.length >= 2 &&
           (reviewAt < 0 ? true : reviewAt > 0);
  }
  function renderRecord(rec, isReview) {
    var sp = speed; speed = 0;                       // 打ち出しなしで一気に出す
    el.app.dataset.review = isReview ? '1' : '';
    el.reviewBar.style.display = isReview ? 'block' : 'none';
    el.reviewBar.textContent = isReview
      ? '読み返し中（' + (history.length - 1 - reviewAt) + '行前）　タップで先へ' : '';
    if (rec.layer === 'RPG') showBalloon(rec.who, rec.name, rec.html, rec.node, null);
    else if (rec.layer === '漫画') showKomaCaption(rec.who, rec.name, rec.html, rec.node, null);
    else showDock(rec.who, rec.name, rec.html, rec.node, null);
    speed = sp;
  }
  function stepReview(delta) {
    if (typing || choicesOpen || cfgOpen) return;
    if (reviewAt < 0) {
      if (delta > 0 || history.length < 2) return;
      reviewAt = history.length - 1;
    }
    var t = reviewAt + delta;
    if (t < 0 || t > history.length - 1) return;
    reviewAt = t;
    var live = (reviewAt === history.length - 1);
    renderRecord(history[reviewAt], !live);
    if (live) reviewAt = -1;                         // 最新まで進んだらライブへ復帰
    updateSysBtns();
  }
  function updateSysBtns() {
    if (!el.btnBack) return;
    el.btnBack.disabled = !canReview();
  }

  /* ---- 設定パネル（BGM/SE音量・ミュート・終盤の早回しのピッチ） ---- */
  var cfgOpen = false;
  function openConfig() {
    if (cfgOpen) return;
    cfgOpen = true;
    var o = SOUND.getOpt();
    function row(label, id, v) {
      return '<div class="cfgRow"><span>' + label + '</span>' +
        '<input type="range" id="' + id + '" min="0" max="100" step="1" value="' + Math.round(v * 100) + '">' +
        '<span class="cfgVal" id="' + id + 'V">' + Math.round(v * 100) + '</span></div>';
    }
    el.overlay.innerHTML = '<div class="ovBox cfg">' +
      '<div class="cfgTitle">設定</div>' +
      '<div class="cfgSect">音</div>' +
      row('BGM', 'cfgBgm', o.bgm) + row('効果音', 'cfgSe', o.se) +
      '<label class="cfgChk"><input type="checkbox" id="cfgMute"' + (o.mute ? ' checked' : '') + '> 音を消す</label>' +
      '<label class="cfgChk"><input type="checkbox" id="cfgPitch"' + (o.pitch === 'tape' ? ' checked' : '') + '> 終盤の早回しで音程も上げる</label>' +
      '<div class="cfgNote">既定は音程を変えずテンポだけ速くします</div>' +
      '<button class="ovBtn" id="cfgClose">閉じる</button></div>';
    el.overlay.style.display = 'grid';
    // パネル上のクリックで本編が進まないようにする（スライダーは button ではないので素通りする）
    el.overlay.onclick = function (ev) { ev.stopPropagation(); };
    function bindRange(id, kind) {
      var r = $(id), v = $(id + 'V');
      r.oninput = function () { v.textContent = r.value; SOUND.vol(kind, r.value / 100); SOUND.resume(); };
    }
    bindRange('cfgBgm', 'bgm'); bindRange('cfgSe', 'se');
    $('cfgMute').onchange = function () {
      SOUND.mute(this.checked);
      updateMuteBtn();
    };
    $('cfgPitch').onchange = function () { SOUND.pitchMode(this.checked); };
    $('cfgClose').onclick = function (ev) { ev.stopPropagation(); closeConfig(); };
    updateSysBtns();
  }
  /** ♪ボタンは「いま音が出ているか」を見せつつ、押すと設定パネルを開く。 */
  function updateMuteBtn() {
    if (!el.muteBtn) return;
    el.muteBtn.textContent = SOUND.isMuted() ? '♪ 音 OFF' : '♪ 音 ON';
    el.muteBtn.title = '音量とミュートの設定を開く';
  }

  function closeConfig() {
    cfgOpen = false;
    el.overlay.dataset.title = '';
    el.overlay.style.display = 'none';
    el.overlay.innerHTML = '';
    el.overlay.onclick = null;
    updateSysBtns();
  }

  /* 一字不変の実行時検証（?debug=1 のときだけ）。
     台本のテキストが画面に一字も欠けず・足されず出ているかを毎行チェックする。 */
  window.__TEXTCHECK = { checked: 0, bad: [], seen: {}, shownLines: 0, shownChars: 0 };
  function verifyText(node, html) {
    var expect = plain(node.text);
    if (node.mono) expect = '（' + expect + '）';
    if (node.group) expect = '「「' + expect + '」」';
    var probe = document.createElement('div');
    probe.innerHTML = html;
    var got = probe.textContent;
    window.__TEXTCHECK.checked++;
    window.__TEXTCHECK.seen[node.who + '|' + node.text] = 1;
    // 実尺の見積りは「実際に画面へ出た回数」で数える。ユニーク行で数えると
    // 同じ台詞の重複（台本に36行ある）を落として尺が短く出る（QA-026）
    window.__TEXTCHECK.shownLines++;
    window.__TEXTCHECK.shownChars += expect.length;
    if (got !== expect) window.__TEXTCHECK.bad.push({ who: node.who, expect: expect, got: got });
  }

  function typeInto(target, html, node, cb) {
    var tmp = document.createElement('span'); tmp.innerHTML = html;
    var full = html;
    var silent = (node.tags || []).indexOf('無言ビート') >= 0;
    typeCb = cb;
    if (silent || speed <= 0) { target.innerHTML = full; finish(); return; }
    // 文字送り：タグを壊さないよう、テキストノード単位で1文字ずつ出す
    target.innerHTML = full;
    var nodes = [], w = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) nodes.push({ n: w.currentNode, t: w.currentNode.nodeValue });
    nodes.forEach(function (x) { x.n.nodeValue = ''; });
    var i = 0, j = 0;
    typing = setInterval(function () {
      if (i >= nodes.length) { clearInterval(typing); typing = null; finish(); return; }
      var x = nodes[i];
      x.n.nodeValue = x.t.slice(0, ++j);
      if (j >= x.t.length) { i++; j = 0; }
    }, speed);
    function finish() { var f = typeCb; typeCb = null; if (f) f(); }
  }

  function showDock(who, name, html, node, cb) {
    el.speaker.textContent = (who === 'narration') ? '' : name;
    el.speaker.style.visibility = (who === 'narration') ? 'hidden' : 'visible';
    el.textbox.dataset.who = who;
    el.textbox.dataset.mono = node.mono ? '1' : '';
    el.body.innerHTML = '';
    // 【8】決裁層の本文窓でもト書きは改行して分ける。
    //   読点改行（hard）は縦書きの吹き出し向けの作りなので、横に広いこの窓では使わない
    //   （1文節1行になって間延びする）。ここはブラウザの通常折り返しに任せる。
    typeInto(el.body, withStage(html, node.mono), node, cb);
  }

  /* つる指示【23】：魔王が声を張る**生涯ここ一度きり**の一行（S9「不 備 を な く せ ！！」）は、
     絵の下の台詞欄ではなく**絵の中央へ大きく**出す。判定は台本の文言そのもの＝
     台本を書き換えたら自動的に外れる（ここに条件を増やさないこと）。 */
  function isShoutLine(who, html) {
    return who === 'maou' && /不\s*備\s*を\s*な\s*く\s*せ/.test(plain(String(html)));
  }

  /** ★つる指示（2026-09-01 実機）「スマホでは『不備を／なくせ！！』の2行にして」。
   *  横持ちは1行のままでよい。**折る場所は助詞の直後**という規則にしてある——
   *  「不備を」で切るのを文言で決め打ちすると、台本を書き換えた瞬間に嘘になる
   *  （`isShoutLine` を台本の文言で判定しているのと同じ流儀）。
   *  `<br>` は textContent を増やさないので、**台詞の一字不変検証にも実尺にも影響しない**。 */
  function shoutHtml(text) {
    if (el.app.dataset.orient !== 'port') return esc(text);
    var m = text.match(/^(.{2,6}?[をはがにへとで])(.+)$/);
    return m ? esc(m[1]) + '<br>' + esc(m[2]) : esc(text);
  }

  function showShout(html, node, cb) {
    var t = el.shout.querySelector('.stxt');
    // 字間はCSSで作る。改行だけHTMLで入れるので innerHTML（中身は esc 済み）。
    t.innerHTML = shoutHtml(plain(String(html)).replace(/\s+/g, ''));
    el.shout.classList.add('on');
    el.komaCaption.style.display = 'none';
    inputLock = 1;
    setTimeout(function () { inputLock = 0; if (cb) cb(); }, 900);
  }

  function hideShout() {
    if (el.shout) { el.shout.classList.remove('on'); el.shout.querySelector('.stxt').textContent = ''; }
  }

  function showKomaCaption(who, name, html, node, cb) {
    if (isShoutLine(who, html)) return showShout(html, node, cb);
    el.komaCaption.style.display = 'block';
    el.komaCaption.innerHTML = '<span class="cname">' + esc(who === 'narration' ? '' : name) + '</span><span class="ctext"></span>';
    typeInto(el.komaCaption.querySelector('.ctext'), withStage(html, node.mono), node, cb);
  }

  /* ---- 縦書き吹き出し（RPG層・CSSのみ。画像を作らない） ----
   * つる実機指摘（2026-08-23）を4件まとめて反映：
   *  【2】縦長の楕円にする   【3】話者名は出さない
   *  【5】人物の真下に置かない（立ち絵に白い箱を被せない）
   *  【6】読点・句点で改行する（「貴/様」「辿/り着いた」と熟語が割れていた）
   * 位置も大きさも px で計算して置く。CSS の translate に頼るのはやめた
   * （はみ出しの計算が transform 込みになって追いづらいため）。
   */

  /** 【6】読点・句点で改行する。つるの指摘は「幾千の夜を越え、／幾万の骸を踏み、／貴様は…」で、
   *  **句点ごとに必ず1行**が理想形。ただし読点の無い長台詞もあるので3段構えにする。
   *    hard … 読点・句点の直後で**必ず改行**（つるの理想形）
   *    soft … 改行してよい場所を読点・句点の直後**だけに限る**（熟語は割れない）
   *    free … 通常の日本語折り返し（最後の逃げ道。ここでしか熟語は割れない）
   *  `<br>` も `<wbr>` も **textContent は空**なので、台本の一字不変検証にも
   *  実尺の文字数にも影響しない。**`02_scenario.md` は1文字も触らない。**
   *  閉じ括弧の前では切らない（行頭に「」」が来る禁則を自前でも防ぐ）。 */
  /** 【8】台詞の中の（ト書き）を地の文から切り離す。
   *  台本には「（伝票の束をドサッ）今月分です！」のようにト書きと台詞が同じ行に
   *  混ざった台詞が多数ある（全角括弧197箇所）。**（…）の直後に地の文が続く場合だけ改行**し、
   *  ト書き自体は `.stage` で少し弱める。括弧だけの台詞（魔王「（老眼鏡をかける）」）は1行のまま。
   *  独白（node.mono）は**行全体が括弧でくくられている**ので対象外にする
   *  （ここを外すと独白がまるごと弱い字になる）。
   *  `<span>` も `<br>` も textContent は増えないので、**一字不変検証にも実尺にも影響しない**。
   *  **02_scenario.md は1文字も触らない。** */
  function withStage(html, mono) {
    if (mono) return String(html);
    var src = String(html);
    return src.replace(/（[^（）]*）/g, function (m, off) {
      var rest = src.slice(off + m.length).replace(/<[^>]*>/g, '').trim();
      var tag = '<span class="stage">' + m + '</span>';
      // ★つる指摘（2026-09-01 実機）「閉じかっこ前の改行なしにして」。
      //   S9の『魔王国 興行収支報告書（極秘）』で **』だけが次行**へ落ちていた件は、
      //   CSSの禁則の問題ではなく**ここが犯人**だった——（極秘）をト書きと見なし、
      //   後ろに『』』が残っているので「地の文が続く」と判定して <br> を入れていた。
      //   閉じ括弧や句読点しか残っていないなら、それは続きの地の文ではない。
      if (/^[」』）】〉》〕｝、。！？…\s]*$/.test(rest)) return tag;
      return tag + '<br>';                            // 後ろに地の文があるときだけ改行
    });
  }

  var BREAK_AT = /([、。！？])(?![」』）】〉》、。！？])/g;
  function withBreaks(html, mode) {
    if (mode === 'free' || mode === 'freeEmph') return String(html);
    var tag = (mode === 'hard') ? '<br>' : '<wbr>';
    return String(html).replace(/(<[^>]*>)|([^<]+)/g, function (m, t, text) {
      if (t) return t;
      return text.replace(BREAK_AT, '$1' + tag);
    });
  }
  /** 表示用の本文を組む。**ト書きで切ってから、残りを読点で折る**（つる指摘【8】＋【6】）。 */
  function bodyHtml(html, node, mode) {
    return withBreaks(withStage(html, node && node.mono), mode);
  }

  /** 話者が絵の中で占めている範囲（#view 座標）。**ここに吹き出しを被せない。**
   *  一枚絵の人物はDOM要素ではないので測れない → アンカー（頭の位置）から
   *  「頭の少し上から画面下まで、幅は絵の26%」という立ち姿のモデルで近似する。 */
  function speakerBox(who) {
    var anc = SC.balloonAnchor[currentBg];
    if (!anc || !anc[who]) return null;
    var meta = (AS.bg || {})[currentBg] || { w: 1600, h: 900 };
    var r = drawnRect(el.bg, meta.w, meta.h);
    var cx = r.x + r.w * (anc[who][0] / 100);
    var top = r.y + r.h * (anc[who][1] / 100 - 0.08);
    var hw = r.w * 0.13;
    // つる指摘【25】：立っている人は「頭から画面下まで」でよいが、**バルコニーの魔王**は
    // それだと画面の8割を占有扱いになり、吹き出しの置き場所が歪んでノルマンへ寄っていた。
    // アンカーに第3要素（背丈%）があるときは、そのぶんだけを占有とみなす。
    var bottom = (anc[who].length > 2)
      ? r.y + r.h * ((anc[who][1] + anc[who][2]) / 100)
      : (r.y + r.h);
    return { x: cx - hw, y: top, w: hw * 2, h: Math.max(24, bottom - top), cx: cx };
  }
  window.GAME_SPEAKER_BOX = speakerBox;      // QA用（自動プレイが独立に突き合わせる）

  function showBalloon(who, name, html, node, cb) {
    el.balloons.innerHTML = '';
    var b = document.createElement('div');
    var narr = (who === 'narration');
    b.className = 'balloon' + (narr ? ' narr' : '');
    if ((node.tags || []).some(function (t) { return t === '小さい文字' || t === 'かすかに' || t === '遠景のまま'; })) b.classList.add('small');
    // 【3】話者名は入れない。誰の台詞かは吹き出しの位置で分かる。
    b.innerHTML = '<span class="btext"></span>';
    el.balloons.appendChild(b);
    fitAndType(b, b.querySelector('.btext'), html, node, cb, narr ? null : who);
  }

  /** ★吹き出しは「全文が入った状態の大きさ」で寸法と位置を決めてから喋り始める。
   *  空のまま測って位置を決めていた頃は、文字が入ってから伸びて画面外へ出ていた。 */
  function fitAndType(b, target, html, node, cb, who) {
    var marked = bodyHtml(html, node, 'hard');
    if (b.classList.contains('narr')) {
      target.innerHTML = marked;
    } else {
      marked = layoutBalloon(b, target, who, html, node);   // 収まる書き方を選んで寸法と位置を決める
    }
    target.innerHTML = '';                  // 消してからタイプ開始
    typeInto(target, marked, node, cb);
  }

  /** 楕円の大きさを中身から決めて、話者の横へ置く。選んだ本文HTMLを返す。 */
  function layoutBalloon(b, target, who, html, node) {
    var vr = el.view.getBoundingClientRect();
    if (!vr.width || !vr.height) { target.innerHTML = bodyHtml(html, node, 'hard'); return target.innerHTML; }
    var m = Math.max(6, Math.round(Math.min(vr.width, vr.height) * 0.02));
    var availW = vr.width - m * 2, availH = vr.height - m * 2;

    // 楕円に内接させるので、テキストは縦横とも 1/√2 まで。K は楕円が内接矩形を包む倍率。
    var K = 1.42;
    var padX = Math.round(vr.width * 0.012), padY = Math.round(vr.height * 0.012);
    // つる指摘（2026-08-27 実機・2件目）長い台詞で吹き出しの上下が画面から切れる。
    //   これまでは「テキストは availH/1.42 まで」だったが、それを楕円にすると
    //   **画面の高さの89%**を占め、話者の位置しだいで上か下がはみ出していた。
    //   → テキストの上限を下げ、**楕円が画面の7割に収まる**ようにする。
    //     長い台詞は読点で2行以上に折れるので、読みやすさはむしろ上がる。
    // ★つる指摘（2026-09-01 スマホ実機）「吹き出しからの文字のはみ出しが残っている」。
    //   原因は **CSS の `#app[data-orient="port"] .balloon{max-height:40%}`**。
    //   JSが「文字が内接する楕円」として決めた高さ(505px)を、CSSが後から366pxへ
    //   **楕円だけ**縮めていた（文字は縮まない）ので、上下が必ず外へ出ていた。
    //   → 高さの上限は**ここで持つ**。CSS側は撤去した（寸法の持ち主を1つにする）。
    //   縦持ちで画面を覆いすぎない上限＝画面の62%。この中に収まるよう
    //   **先にテキストの上限を下げる**ので、楕円が後から縮むことはもう起きない。
    var kw = Math.max(K, 1.62), kh = Math.max(K, 1.30);
    var maxBH = (el.app.dataset.orient === 'port')
      ? Math.min(availH, Math.round(vr.height * 0.62)) : availH;
    // 短辺は kw(=1.62) 倍まで膨らむので、**capW も K ではなく kw で割る**。
    // K(=1.42) で割ると bw が availW を超えて clamp され、そこでも横に溢れていた。
    var capW = Math.max(40, Math.floor(availW / kw) - padX * 2);
    var capH = Math.max(40, Math.min(Math.floor(availH / 1.92),
                                     Math.floor((maxBH - padY * 2) / kh)) - padY * 2);
    target.style.maxWidth = capW + 'px';
    target.style.maxHeight = capH + 'px';

    // 【6】【12】改行の優先順位。**収まった書き方を採用**する：
    //   hard      読点・句点ごとに必ず改行（つるの理想形）
    //   soft      改行してよい場所を読点・句点だけに限る（熟語を割らない）
    //   free      通常の日本語折り返し。**ただし強調の中は割らない**（.emph の keep-all）
    //   freeEmph  強調が単独で1行に収まらないときだけ、強調の中も割る（最後の逃げ道）
    // つる指摘【22】（2026-08-27 スマホ実機）「『お前、田中かよ！』のところは1行でお願いしたい」。
    //   hard は読点・句点で**必ず**折るので、短い台詞まで2行に割れていた
    //   （「「お前、田中かよ！」」→「「お前、/ 田中かよ！」」）。
    //   短い台詞は割らないほうが読みやすいので、**短いものは hard を飛ばす**。
    //   閾値は12字。20字だと252件（全528件の半分）が変わって影響が大きすぎ、
    //   12字なら105件で、つる指摘の「お前、田中かよ！」(8字)は確実に1行になる。
    var plainLen = String(html).replace(/<[^>]*>/g, '').replace(/\s/g, '').length;
    var modes = (plainLen <= 12) ? ['soft', 'free', 'freeEmph']
                                 : ['hard', 'soft', 'free', 'freeEmph'];
    var chosen = null, tw = 0, th = 0;
    for (var k = 0; k < modes.length; k++) {
      target.classList.toggle('anywhere', modes[k] === 'free' || modes[k] === 'freeEmph');
      target.classList.toggle('emphBreak', modes[k] === 'freeEmph');
      target.innerHTML = bodyHtml(html, node, modes[k]);
      var fits = (target.scrollWidth <= target.clientWidth + 1) && (target.scrollHeight <= target.clientHeight + 1);
      var tr = target.getBoundingClientRect();
      if (fits || k === modes.length - 1) { chosen = target.innerHTML; tw = tr.width; th = tr.height; break; }
    }

    // つる指摘【22】「文字が吹き出しからはみ出しているところ修正して」。
    //   どの書き方でも入らないとき、**はみ出したまま採用**していた（最後の mode を
    //   fits を見ずに確定させていた）。スマホの狭い画面＋長い台詞で実際に溢れていた。
    //   → 入らないぶんだけ**字を縮めて**収める。読めることを優先する。
    var shrink = 1;
    for (var t = 0; t < 6; t++) {
      var over = (target.scrollWidth > target.clientWidth + 1) || (target.scrollHeight > target.clientHeight + 1);
      if (!over) break;
      shrink *= 0.9;
      target.style.fontSize = (shrink * 100) + '%';
      var tr2 = target.getBoundingClientRect();
      tw = tr2.width; th = tr2.height;
    }
    if (shrink === 1) target.style.removeProperty('font-size');
    chosen = target.innerHTML;

    // つる指摘（2026-08-27 実機）「セリフの文字はみ出し発見」。
    //   楕円に矩形を内接させるには縦横とも √2(=1.414) 倍が要るが、**細長い楕円ほど
    //   短辺の余裕が足りなくなる**（実測：テキスト幅53pxに対し楕円の幅48px＝5px溢れ）。
    //   縦書きの吹き出しは「1行だけ＝極端に細長い」形になりやすく、そこで必ず出る。
    //   → 短辺には下限を持たせる。テキストの短辺 × 1.62 と、文字1つぶんの余白を足した値。
    var bw = Math.min(availW, Math.max(Math.round(tw * kw), Math.round(tw + padX * 4)) + padX * 2);
    var bh = Math.min(maxBH, Math.max(Math.round(th * kh), Math.round(th + padY * 2)) + padY * 2);
    b.style.width = bw + 'px';
    b.style.height = bh + 'px';

    // --- 【5】話者の横へ置く（人物に被せない）
    var box = who ? speakerBox(who) : null;
    var gap = Math.max(8, Math.round(vr.width * 0.015));
    var x, y, side;
    if (box) {
      var roomR = vr.width - (box.x + box.w) - m, roomL = box.x - m;
      side = (roomR >= bw + gap) ? 'right' : (roomL >= bw + gap) ? 'left' : (roomR >= roomL ? 'right' : 'left');
      x = (side === 'right') ? box.x + box.w + gap : box.x - gap - bw;
      y = box.y;                                   // 顔の高さに合わせる
      b.classList.add(side === 'right' ? 'side-right' : 'side-left');
      // つる指摘【25】「しっぽもっと上から出して／門の上から魔王が話しているのが分かるように」。
      //   横向きのしっぽは吹き出しの中央（top:50%）から出るだけで、**話者の高さを指していなかった**。
      //   バルコニーの魔王のように上下へ離れた相手だと「誰がどこから喋っているか」が消える。
      //   → 話者の顔の高さを吹き出し内の比率に直して --tailY で指す。
      var faceY = box.y + Math.min(box.h * 0.5, bh * 0.5);
      var relY = (faceY - y) / Math.max(1, bh);
      b.style.setProperty('--tailY', Math.round(Math.max(12, Math.min(88, relY * 100))) + '%');
    } else {
      // ★つる指摘【16】幕間・カットシーンのドット絵。以前は「話者の頭の上」に置くだけで、
      //   **奥にいる他のキャラ（特に操作キャラの魔王）を吹き出しが覆っていた**。
      //   → 画面内の全キャラの矩形を避ける。避けきれないときは
      //     「魔王を隠さないこと」を最優先に、重なりが最小の置き場所を選ぶ。
      var pl = placeRoamBalloon(who, bw, bh, vr, m, gap);
      x = pl.x; y = pl.y; side = pl.side;
      b.classList.add(pl.side === 'up' ? 'side-up' : pl.side === 'down' ? 'side-down'
                    : pl.side === 'right' ? 'side-right' : 'side-left');
      if (pl.tailX !== null) b.style.setProperty('--tailX', Math.round(pl.tailX) + 'px');
    }
    // --- 中央の帯へ収める（つる指摘【7】）。
    //     ただし**顔を隠すくらいなら帯から出す**（読みやすさより「誰が喋っているか」が上）。
    var band = contentBand();
    var bx = Math.max(band.left + m, Math.min(x, band.right - bw - m));
    if (!box || !rectsOverlap({ x: bx, y: y, w: bw, h: bh }, box)) x = bx;
    // --- 画面内へ収める
    x = Math.max(m, Math.min(x, vr.width - bw - m));
    y = Math.max(m, Math.min(y, vr.height - bh - m));
    // 収めた結果また人物に重なるなら、しっぽを消して上へ逃がす（顔だけは死守）
    if (box && rectsOverlap({ x: x, y: y, w: bw, h: bh }, box)) {
      var above = box.y - gap - bh;
      if (above >= m) { y = above; b.className = b.className.replace(/side-(left|right)/, 'side-up'); }
    }
    // 設定・戻るボタン（左上）にも被せない。
    // ★ドット絵の場面は placeRoamBalloon が最初からボタンごと避けて選んでいるので触らない。
    //   ここで後から動かすと、避けたはずのキャラの上へ押し戻してしまう（つる指摘【16】）。
    var sb = (box && el.sysBtns) ? el.sysBtns.getBoundingClientRect() : null;
    if (sb && sb.width) {
      var sbv = { x: sb.left - vr.left, y: sb.top - vr.top, w: sb.width + gap, h: sb.height + gap };
      if (rectsOverlap({ x: x, y: y, w: bw, h: bh }, sbv)) {
        var ux = x, uy = y;
        var under = sbv.y + sbv.h;
        if (under + bh <= vr.height - m) uy = under;
        else if (sbv.x + sbv.w + bw <= vr.width - m) ux = sbv.x + sbv.w;
        // 逃がした先が話者の顔なら動かさない（顔を隠さないほうが上）
        if (!rectsOverlap({ x: ux, y: uy, w: bw, h: bh }, box)) { x = ux; y = uy; }
      }
    }
    b.style.left = Math.round(x) + 'px';
    b.style.top = Math.round(y) + 'px';
    return chosen;
  }

  /** ★つる指摘【16】RPG層のドット絵キャラの占有範囲（#view座標）。
   *  スプライトは map 座標で (x-16, y-32) から 32×32。canvas の実描画矩形へ写して返す。
   *  DOM要素ではないので、【5】の一枚絵と同じく「モデルを作って避ける」しかない。 */
  function roamCharRects() {
    if (!roam) return [];
    var M = SC.map, mr = drawnRect(el.mapCanvas, M.w, M.h);
    if (!mr.w) return [];
    var sc = mr.w / M.w;
    var out = [], list = [{ id: 'maou', a: roam.player }];
    Object.keys(roam.actors).forEach(function (id) { list.push({ id: id, a: roam.actors[id] }); });
    list.forEach(function (o) {
      if (!o.a) return;
      out.push({ id: o.id,
        x: mr.x + (o.a.x - 16) * sc, y: mr.y + (o.a.y - 32) * sc,
        w: 32 * sc, h: 32 * sc });
    });
    return out;
  }

  /** 【16】ドット絵の場面で、他のキャラに被らない置き場所を選ぶ。
   *  候補の順番＝①頭の真上 ②頭の上を左右へずらす ③話者の左右 ④話者の下。
   *  しっぽは常に話者を指す（--tailX）。**魔王（操作キャラ）への重なりは重み10で嫌う。** */
  function placeRoamBalloon(who, bw, bh, vr, m, gap) {
    var rects = roamCharRects();
    /** 避けたさの重み。操作キャラ(魔王)＞他のキャラ＞設定ボタン＞ヒント帯・D-pad。 */
    function wt(o) { return o.id === 'maou' ? 10 : o.id === 'ui' ? (o.wt || 1) : 3; }
    var me = null, others = [];
    rects.forEach(function (r) { if (r.id === who) me = r; else others.push(r); });
    // 設定・戻るボタンも**最初から**障害物に混ぜる。
    // ★ここを後処理の「ぶつかったら下へ落とす」でやっていたら、
    //   せっかくキャラを避けた吹き出しを**魔王の上へ押し戻していた**（つる指摘【16】の実測）。
    // ★つる指摘（2026-09-01 実機）ノルマンの「（遠くから）人違いでーす」が
    //   上中央の「仲間に話しかける（あと1人）」の帯（#roamGoal）に重なっていた。
    //   sysBtns（左上）だけを障害物にしていて、**この帯とD-padが抜けていた**。
    //   ＝ HANDOVER の「道具はあるのに、そこだけ使っていない」の5件目。
    //   避けるUIは1つずつ足すのではなく**表示中のUIを全部**入れる。
    //   避けたさには順番がある。**全部を同じ重さで嫌うと、横持ちのように置き場所が
    //   狭い画面で「帯を避けてボタンとキャラの上へ逃げる」**という悪化が起きる（実測で
    //   UIの重なり0→2件・キャラの重なり2→4件になった）。キャラ＞ボタン＞帯の順で守る。
    [[el.sysBtns, 2], [el.roamGoal, 1], [$('padPort'), 1]].forEach(function (p) {
      var n = p[0];
      if (!n || n.offsetParent === null) return;             // 非表示は障害物にしない
      var r0 = n.getBoundingClientRect();
      if (!r0.width || !r0.height) return;
      others.push({ id: 'ui', wt: p[1], x: r0.left - vr.left - gap / 2, y: r0.top - vr.top - gap / 2,
                    w: r0.width + gap, h: r0.height + gap });
    });
    var p = balloonPos(who);
    var ax = me ? me.x + me.w / 2 : p.x / 100 * vr.width;
    var aTop = me ? me.y : p.y / 100 * vr.height;
    var aBot = me ? me.y + me.h : aTop + 24;
    var band = contentBand();
    var lo = Math.max(m, band.left + m), hi = Math.min(vr.width - m, band.right - m);

    var cands = [];
    cands.push({ x: ax - bw / 2, y: aTop - gap - bh, side: 'up' });
    var step = Math.max(20, Math.round(bw * 0.55));
    for (var k = 1; k <= 5; k++) {
      cands.push({ x: ax - bw / 2 + step * k, y: aTop - gap - bh, side: 'up' });
      cands.push({ x: ax - bw / 2 - step * k, y: aTop - gap - bh, side: 'up' });
    }
    cands.push({ x: (me ? me.x + me.w : ax) + gap, y: aTop - bh * 0.35, side: 'right' });
    cands.push({ x: (me ? me.x : ax) - gap - bw, y: aTop - bh * 0.35, side: 'left' });
    cands.push({ x: ax - bw / 2, y: aBot + gap, side: 'down' });

    var best = null;
    for (var i2 = 0; i2 < cands.length; i2++) {
      var c = cands[i2];
      var x2 = Math.max(lo, Math.min(c.x, hi - bw));
      var y2 = Math.max(m, Math.min(c.y, vr.height - bh - m));
      var r2 = { x: x2, y: y2, w: bw, h: bh }, cost = 0;
      for (var j2 = 0; j2 < others.length; j2++) {
        var o = others[j2];
        var ow = Math.max(0, Math.min(r2.x + bw, o.x + o.w) - Math.max(r2.x, o.x));
        var oh = Math.max(0, Math.min(r2.y + bh, o.y + o.h) - Math.max(r2.y, o.y));
        cost += ow * oh * wt(o);                          // 操作キャラは最優先で守る
      }
      // しっぽが話者から離れすぎる置き方は避けたい（誰の台詞か分からなくなる）
      var tail = Math.max(0, Math.abs((x2 + bw / 2) - ax) - bw / 2);
      cost += tail * 6;
      if (!best || cost < best.cost) best = { x: x2, y: y2, side: c.side, cost: cost };
      if (cost === 0) break;
    }
    // まだどこかに当たっているなら、その置き場所のまわりを細かく探して**完全に空いた場所**を狙う。
    //   （粗い候補だけだと、スプライトの角を数%かすめる置き方が残った＝実測445px²）
    // ★つる指摘（2026-09-01）で足した帯の見張りが拾った件。細かい探索が
    //   **上方向にしか動けなかった**（gy が 0以上で `best.y - gy*stepY`）ので、
    //   画面上端で頭打ちになった置き場所からは二度と下りられず、帯に重なったままだった
    //   （S3b カンバンの471px吹き出し＝実測2160px²）。下にも同じだけ探す。
    //   粗い刻みだけだと数十px²のかすりが残るので、残ったときは刻みを細かくしてもう一周する。
    for (var pass = 0; pass < 2 && best && best.cost > 0; pass++) {
      var div = pass ? 4 : 1;
      var stepX = Math.max(4, Math.round(bw * 0.22 / div)), stepY = Math.max(4, Math.round(bh * 0.18 / div));
      for (var gy = -5; gy <= 5; gy++) for (var gx = -8; gx <= 8; gx++) {
        var nx = Math.max(lo, Math.min(best.x + gx * stepX, hi - bw));
        var ny = Math.max(m, Math.min(best.y - gy * stepY, vr.height - bh - m));
        var cst = 0;
        for (var t2 = 0; t2 < others.length; t2++) {
          var o2 = others[t2];
          var w3 = Math.max(0, Math.min(nx + bw, o2.x + o2.w) - Math.max(nx, o2.x));
          var h3 = Math.max(0, Math.min(ny + bh, o2.y + o2.h) - Math.max(ny, o2.y));
          cst += w3 * h3 * wt(o2);
        }
        cst += Math.max(0, Math.abs((nx + bw / 2) - ax) - bw / 2) * 6;
        if (cst < best.cost) best = { x: nx, y: ny, side: best.side, cost: cst };
        if (best.cost === 0) break;
      }
    }
    if (!best) return { x: ax - bw / 2, y: aTop - gap - bh, side: 'up', tailX: null };
    var tailX = (best.side === 'up' || best.side === 'down')
      ? Math.max(bw * 0.12, Math.min(ax - best.x, bw * 0.88)) : null;
    return { x: best.x, y: best.y, side: best.side, tailX: tailX };
  }

  function rectsOverlap(a, c) {
    return !(a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y);
  }

  /** object-fit で実際に描かれている矩形を返す（#view 座標系）。
   *  これを使わずに要素の矩形で計算すると、cover/contain のぶんだけ吹き出しがズレる。 */
  function drawnRect(node, natW, natH) {
    var vr = el.view.getBoundingClientRect(), r = node.getBoundingClientRect();
    var fit = getComputedStyle(node).objectFit;
    var bw = r.width, bh = r.height;
    if (!natW || !natH || !bw || !bh) return { x: r.left - vr.left, y: r.top - vr.top, w: bw, h: bh };
    var s = (fit === 'contain') ? Math.min(bw / natW, bh / natH) : Math.max(bw / natW, bh / natH);
    var dw = natW * s, dh = natH * s;
    return { x: (r.left - vr.left) + (bw - dw) / 2, y: (r.top - vr.top) + (bh - dh) / 2, w: dw, h: dh };
  }
  function toViewPct(rect, fx, fy) {
    var vr = el.view.getBoundingClientRect();
    return { x: (rect.x + rect.w * fx) / vr.width * 100, y: (rect.y + rect.h * fy) / vr.height * 100 };
  }
  /** 幕間（ドット絵）の話者の頭の上。一枚絵は speakerBox() 側で横に置くのでここへは来ない。 */
  function balloonPos(who) {
    if (roam) {
      var a = (who === 'maou') ? roam.player : roam.actors[who];
      if (a) {
        var mr = drawnRect(el.mapCanvas, SC.map.w, SC.map.h);
        var p = toViewPct(mr, a.x / SC.map.w, Math.max(0, a.y - 34) / SC.map.h);
        p.y = Math.max(6, p.y);
        return p;
      }
    }
    return { x: 50, y: 20 };
  }

  /* =======================================================================
   * 進行（04_spec 6-2）
   * ===================================================================== */
  var scene = null, idx = 0, waiting = false, interject = [], onInterjectEnd = null;

  function sceneById(id) { return SCENES.filter(function (s) { return s.id === id; })[0]; }

  function startScene(id, fromSave) {
    if (id === 'S1') s1Until = performance.now() + 2400;   // 冒頭のぶつ切りはスキップさせない（12-3）
    S.scene = id; S.node = 0;
    scene = sceneById(id); idx = 0;
    history.length = 0; reviewAt = -1;                  // 読み返しはシーンをまたがない
    if (el.roamGoal) el.roamGoal.style.display = 'none';
    if (el.sceneCard) el.sceneCard.style.display = 'none';
    el.app.dataset.review = ''; if (el.reviewBar) el.reviewBar.style.display = 'none';
    updateSysBtns();
    var cfg = SC.scene[id] || {};
    if (!cfg.carryOver) {
      speed = cfg.speed === 'fast' ? 8 : cfg.speed === 'slow' ? 58 : 26;
      el.app.dataset.font = cfg.font || 'gothic';
      setTone(cfg.tone || 'gag');
    }
    currentBg = null;
    setBg(cfg.bg || null);
    setLayer(cfg.layer || '決裁');
    // carryOver のシーンは音を触らない（S1＝ぶつ切りのタイムラインが自分で切る）
    if (!cfg.carryOver && cfg.bgm !== undefined) SOUND.bgm(cfg.bgm);
    charaState = { left: 'maou', right: null, trio: false, speaker: null, face: {} };
    if (roam && roam.cutscene) leaveCutscene();
    rushN = 0; rateStep = 0; pendingAfterglow = 0;
    el.slipCard.style.display = 'none'; el.slipCard.innerHTML = '';
    SOUND.rate(1);
    var v = voucherOf(id); if (v) S.slip_index = v.index;
    // 三段開示の到達段階（台本7章 / 04_spec 5-1）。①疑念の芽=S4 ②相互認知=S6 ③連鎖発覚=S7
    var rv = { S4: 1, S6: 2, S7: 3 }[id];
    if (rv) S.reveal_stage = Math.max(S.reveal_stage, rv);
    hideVoucher();
    updateHud();
    if (SC.savePoints.indexOf(id) >= 0 && !fromSave) save();
    if (SC.interlude[id]) { enterRoam(id); return; }
    next();
  }

  function next() {
    if (interject.length) { var ij = interject.shift(); waiting = true; showLine(ij, doneLine); return; }
    if (onInterjectEnd) { var f = onInterjectEnd; onInterjectEnd = null; f(); return; }
    if (!scene || idx >= scene.nodes.length) { endScene(); return; }
    var n = scene.nodes[idx++]; S.node = idx;
    handle(n);
  }

  function handle(n) {
    switch (n.t) {
      case 'layer': {
        var bgv = SC.bgByVariant[n.variant];
        if (n.layer === '決裁') {
          // 決裁層は必ず審査の間を張り直す。台本は1シーン内で層を何度も渡るので
          // （S9は 漫画→RPG→決裁→漫画→RPG）、直前のRPG層で null にした背景が
          // そのまま引き継がれて画面が真っ黒になっていた（QA-002・34行が黒画面）。
          setBg((SC.scene[S.scene] && SC.scene[S.scene].bg) || 'bg_shinsa_01');
        } else if (bgv !== undefined) setBg(bgv);
        var bm = SC.bgmByVariant[n.variant];
        if (bm) SOUND.bgm(bm);
        // RPG層で背景（一枚絵）が無い＝ドットマップの場面。幕間でなければカットシーンとして
        // キャラを固定配置して描く。ここを入れないとマップが一度も描かれず真っ黒（QA-001）。
        if (n.layer === 'RPG' && !currentBg && !SC.interlude[S.scene]) enterCutscene(S.scene);
        else if (n.layer !== 'RPG' || currentBg) leaveCutscene();
        setLayer(n.layer, n.variant);
        var oc = SC.openingCut;
        if (oc && S.scene === oc.scene && (n.tags || []).indexOf('BGM:ぶつ切り') >= 0) {
          return runOpeningCut(n, oc);          // ★03_assets 7-3 のタイムライン
        }
        var hold = applyTags(n.tags);
        if (hold > 0) { inputLock = performance.now() + hold; return setTimeout(next, hold); }
        return next();
      }
      case 'mark':
        applyTags(n.tags);
        return next();
      case 'dir':
        return handleDir(n);
      case 'rush':
        rushN = n.n;
        showSlipCard(n.item, n.n);
        return next();
      case 'titlecall':
        return titleCall();
      case 'theend':
        return theEnd();
      case 'beat': {
        applyTags(n.tags);
        waiting = false;
        return setTimeout(next, 700);                 // 話者のいない演出行は自動で送る
      }
      case 'narr':
      case 'line': {
        var extra = applyTags(n.tags);
        // 直前に出した大ゴマの「最低表示時間」をこの行で消化する（音を切らずに画を持たせる）
        if (pendingAfterglow) { extra = Math.max(extra, pendingAfterglow); pendingAfterglow = 0; }
        // S9の不備ループ：曲を足さず bgm_shinsa_01 の再生速度だけ上げる（03_assets 1-3 / 7-1）
        if (S.scene === 'S9' && n.t === 'line' && n.who === 'maou' && plain(n.text).indexOf('差し戻し') >= 0) {
          rateStep = Math.min(3, rateStep + 1);
          SOUND.rate(1 + rateStep * 0.1);
        }
        waiting = true;
        showLine(n.t === 'narr' ? { who: 'narration', name: '', text: n.text, tags: n.tags } : n, function () {
          doneLine(extra);
        });
        return;
      }
      default:
        return next();
    }
  }

  /** 冒頭シリアス → ぶつ切り明転（03_assets 7-3・秒単位で組む）。
   *  この区間だけは個別タグの即時処理に任せず、時刻を明示して並べる。
   *  実装の都合で0秒に潰すと「扉の音が荘厳なBGMに被る0.5秒」と
   *  「無音の1拍だけ大ゴマ#1が出ている区間」が両方消える（QA-022）。 */
  function runOpeningCut(n, oc) {
    // ① 大ゴマ#1 と画面の揺れだけ先に出す。書体・トーン・明転はまだ S0 のまま
    applyTags((n.tags || []).filter(function (t) {
      return t.indexOf('大ゴマ') === 0 || t === 'shake' || t === 'shake:強';
    }));
    // ② +0.3s 大扉の軋みを **BGMに被せて** 鳴らす
    setTimeout(function () { SOUND.se('se_door_open_01'); }, oc.doorSe);
    // ③ +0.8s フェードなしで即カット
    setTimeout(function () { SOUND.stopBgm(0); }, oc.cutBgm);
    // ④ +0.8〜1.6s 完全な無音。入力も受け付けない
    inputLock = performance.now() + oc.hold;
    waiting = false; el.app.dataset.wait = '';
    // ⑤ +1.6s 台詞と同時に明転＋明朝→ゴシック
    setTimeout(function () {
      FX.flash(oc.flashGain);
      el.app.dataset.font = 'gothic';
      setTone('gag');
      speed = 8;
      next();
    }, oc.hold);
  }

  function doneLine(extra) {
    var lock = (extra === -1) ? 80 : (extra || 0);
    inputLock = performance.now() + lock;
    waiting = true;
    el.app.dataset.wait = '1';
  }
  function endScene() {
    var order = SCENES.map(function (s) { return s.id; });
    var i = order.indexOf(S.scene);
    if (i < 0 || i + 1 >= order.length) { theEnd(); return; }
    startScene(order[i + 1]);
  }

  /* ---- クリック／キーで送る ---- */
  function advance() {
    if (choicesOpen) return;
    if (performance.now() < inputLock) return;
    if (noSkipZone()) return;
    if (typing) { skipTyping(); return; }
    if (!waiting) return;
    waiting = false; el.app.dataset.wait = '';
    next();
  }
  var lastFull = null;
  function restoreFullText() { if (lastFull) { lastFull.target.innerHTML = lastFull.html; } }
  /** 文字送りを飛ばす。飛ばしても「送り待ち」へ必ず入る（ここを外すと進まなくなる） */
  function skipTyping() {
    clearInterval(typing); typing = null;
    restoreFullText();
    var f = typeCb; typeCb = null;
    if (f) f(); else { waiting = true; el.app.dataset.wait = '1'; }
  }

  /* S1の30秒はスキップさせない（04_spec 12-3） */
  function noSkipZone() { return S.scene === 'S1' && performance.now() < s1Until; }
  var s1Until = 0;

  /* =======================================================================
   * ▼ディレクティブ（呼び出し／判断）
   * ===================================================================== */
  var choicesOpen = false, rushN = 0, rateStep = 0;
  var NAME2ID = { 'タクト': 'tact', 'カンバン': 'kanban', 'ファルム': 'falm' };
  var ID2NAME = { tact: 'タクト', kanban: 'カンバン', falm: 'ファルム' };

  function voucherOf(sceneId) { return VOUCHERS.filter(function (v) { return v.scene === sceneId; })[0]; }

  function handleDir(n) {
    var raw = n.raw || '';
    if (raw.indexOf('▼呼び出し') === 0) {
      var m = raw.match(/▼呼び出し[：:]\s*(.+?)の証言/);
      var wid = m ? NAME2ID[m[1]] : null;
      if (!wid) return next();
      return openCall(wid);
    }
    if (raw.indexOf('▼プレイヤー判断') === 0) return openJudge();
    if (raw.indexOf('▼判断') === 0) return openRushJudge();
    return next();
  }

  function mkLine(who, text) { return { t: 'line', who: who, name: who === 'maou' ? '魔王' : ID2NAME[who] || 'ノルマン', text: text, tags: [] }; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ---- 呼び出し（無限・無罰。詰み防止＝台本7章） ---- */
  /** ★つる実機【13】「最後の審査、3人の証言聞いても次に進まない」の修正。
   *  誤呼び出しは無罰・無限（台本7章）で正しいが、**一度呼んだ相手が「済」にならない**ので、
   *  3人とも押しても同じ3択が出続け、**進行不能と区別がつかなかった**。
   *  （`openJudge` は試した選択肢を無効にしているのに、こちらだけ抜けていた。）
   *  → 呼んだ相手を tried に積んで無効化する。**正解は必ずこの3人の中にいるので、
   *    最大3回で必ず正解に到達する＝詰みが原理的に起きない。**
   *  罰は増やしていない（胃は減らない）。tried は再入時も引き継ぐ。 */
  function openCall(correctId, tried) {
    tried = tried || [];
    choices([
      { label: 'タクトを呼ぶ', v: 'tact', disabled: tried.indexOf('tact') >= 0 },
      { label: 'カンバンを呼ぶ', v: 'kanban', disabled: tried.indexOf('kanban') >= 0 },
      { label: 'ファルムを呼ぶ', v: 'falm', disabled: tried.indexOf('falm') >= 0 },
    ], '▼ 証人を呼ぶ', function (v) {
      SOUND.se('se_ui_select_01');
      if (v === correctId) {
        if (S.evidence.indexOf(v) < 0) S.evidence.push(v);
        var hintKey = (S.scene === 'S4' && v === 'kanban' && S.hint_kanban) ? 'hint_kanban'
                    : (S.scene === 'S6' && v === 'falm' && S.hint_falm) ? 'hint_falm' : null;
        if (hintKey && window.HINT_LINE[hintKey]) {
          var h = window.HINT_LINE[hintKey];
          interject.push({ t: 'line', who: h.who, name: h.name, text: h.text, tags: [] });
        }
        return next();
      }
      if (tried.indexOf(v) < 0) tried.push(v);
      interject.push(mkLine(v, pick(CALL_CHAT[v])));
      interject.push(mkLine('norman', pick(CALL_BLOCK)));
      onInterjectEnd = function () { openCall(correctId, tried); };
      return next();
    });
  }

  /* ---- 承認／差し戻しの判断 ---- */
  function openJudge() {
    var v = voucherOf(S.scene);
    if (!v) return next();
    var tried = S.wrong_tried[v.id] || (S.wrong_tried[v.id] = []);
    choices([
      { label: '承認する', v: 'approve', disabled: tried.indexOf('J:approve') >= 0 },
      { label: '差し戻し！', v: 'reject', disabled: tried.indexOf('J:reject') >= 0, hot: true },
    ], '▼ 決裁　' + v.title, function (a) {
      SOUND.se('se_ui_select_01');
      if (a === v.correct) {
        S.voucher_status[v.id] = (a === 'approve') ? 'approved' : 'rejected';
        if (a === 'approve') { el.voucher.dataset.state = 'approved'; FX.stamp('approve'); SOUND.se('se_stamp_ok_01'); return next(); }
        if (!v.evidence.length) return next();
        return openEvidence(v);
      }
      tried.push('J:' + a);
      var kind = (a === 'approve') ? 'approve_wrong' : 'reject_wrong';
      return penalty(kind, function () { openJudge(); });
    });
  }

  /* ---- 根拠の提示 ---- */
  function openEvidence(v) {
    var tried = S.wrong_tried[v.id] || (S.wrong_tried[v.id] = []);
    choices(v.evidence.map(function (e) {
      return { label: e.label, v: e.id, disabled: tried.indexOf(e.id) >= 0 };
    }), '▼ 差し戻しの根拠は', function (id) {
      SOUND.se('se_ui_select_01');
      var e = v.evidence.filter(function (x) { return x.id === id; })[0];
      if (e.correct) { el.voucher.dataset.state = 'rejected'; FX.stamp('reject'); return next(); }
      tried.push(id);
      return penalty(e.wrongKind === 'witness' ? 'witness_wrong' : 'evidence_wrong', function () { openEvidence(v); });
    });
  }

  /* ---- 速射審査（胃ゲージ対象外・詰みなし） ---- */
  function openRushJudge() {
    var r = RUSH[rushN - 1];
    if (!r) return next();
    choices([
      { label: '承認', v: 'approve' },
      { label: '差し戻し！', v: 'reject', hot: true },
    ], '▼ 速射　' + rushN + ' / 7', function (a) {
      SOUND.se('se_ui_select_01');
      if (a !== r.correct) {                        // 誤判定＝胃は減らない。ツッコミ→正判定へ
        var rw = (REACTION.rush_wrong || {}).norman;
        if (rw) interject.push(mkLine('norman', rw));          // 「え、今のダメなの？」（QA-007）
        interject.push(mkLine('maou', RUSH_RETORT[rushN] || ''));
      }
      FX.stamp(r.correct);
      return next();
    });
  }

  /* ---- 不正解リアクション（台本4章から自動抽出したものだけを使う） ---- */
  function penalty(kind, back) {
    var r = REACTION[kind];
    S.stomach = Math.max(0, S.stomach - 1);
    updateHud();
    el.stomachBox.classList.remove('hurt'); void el.stomachBox.offsetWidth; el.stomachBox.classList.add('hurt');
    SOUND.se('se_slam_01');
    if (r) {
      if (r.norman) interject.push(mkLine('norman', r.norman));
      if (r.maou) interject.push(mkLine('maou', r.maou));
    }
    if (S.stomach <= 0) {
      // ★つる指示（2026-09-01 実機）「やり直しは**間違った選択肢を選んだところ**から」。
      //   それまではシーンの頭（＝その伝票の最初）へ戻していたので、既に読んだ台詞を
      //   もう一度全部送らされていた。胃が残っているときの通常の間違いは
      //   `penalty(kind, back)` の back で**その選択肢のところへ即戻る**のだから、
      //   ゲームオーバーだけ扱いが違うほうがおかしい。**back を捨てずに覚えておく。**
      goResumeAt = back;
      // 台本4章「胃0（ゲームオーバー）」の2行を必ず出してから画面へ。
      // ノルマンだけ喜ぶのがこの場面のギャグ（QA-007）。
      var go = REACTION.gameover || {};
      if (go.norman) interject.push(mkLine('norman', go.norman));
      if (go.maou) interject.push(mkLine('maou', go.maou));
      onInterjectEnd = gameOver;
      return next();
    }
    onInterjectEnd = back;
    return next();
  }

  /* =======================================================================
   * 選択肢UI
   * ===================================================================== */
  function choices(list, title, cb) {
    choicesOpen = true;
    updateSysBtns();          // 選択肢の間は戻るを押せなくする（見た目も無効に）
    waiting = false;
    el.choices.innerHTML = '<div class="chTitle">' + esc(title) + '</div>';
    var wrap = document.createElement('div'); wrap.className = 'chList';
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'ch' + (c.hot ? ' hot' : '');
      b.innerHTML = md(c.label);
      if (c.disabled) { b.disabled = true; b.classList.add('done'); }
      b.onclick = function (ev) {
        ev.stopPropagation();
        closeChoices();
        cb(c.v);
      };
      wrap.appendChild(b);
    });
    el.choices.appendChild(wrap);
    el.choices.style.display = 'flex';
    el.dock.dataset.choosing = '1';
  }
  function closeChoices() { choicesOpen = false; el.choices.style.display = 'none'; el.choices.innerHTML = ''; el.dock.dataset.choosing = ''; updateSysBtns(); }

  /* =======================================================================
   * HUD
   * ===================================================================== */
  function updateHud() {
    var st = S.stomach;
    el.stomachBox.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var d = document.createElement('span');
      d.className = 'st';
      if (i < st) {
        d.classList.add('on');
        d.dataset.frame = (st === 3) ? '0' : (st === 2 ? '1' : '2');
      } else d.classList.add('off');
      el.stomachBox.appendChild(d);
    }
    var v = voucherOf(S.scene);
    el.slipBox.textContent = (S.scene === 'S7.5') ? '速射審査' : (v ? ('伝票 ' + v.index + ' / 5') : '');
  }

  /* ---- 審査中の伝票UI（裁定O・03_assets 6章「画像は作らずHTML表で」） ----
   * 台詞は流れて消えるので、ボス伝票V5の「この120万、まだ底がある」は
   * 内訳が一覧で手元に残っていて初めて効く。新規画像素材はゼロ。 */
  function money(v) {
    if (v === null || v === undefined) return '';        // 台本にない金額は作らない（04_spec 8-1）
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' G';
  }
  function showVoucher(v) {
    if (!v) return hideVoucher();
    var rows = (v.lines || []).map(function (l) {
      return '<tr><th>' + esc(l.label) + '</th><td>' + esc(money(l.amount)) + '</td></tr>';
    }).join('');
    el.voucher.innerHTML =
      '<div class="vcHead"><span class="vcNo">伝票 ' + v.index + ' / 5</span>' +
      '<span class="vcTitle">' + esc(v.title) + '</span></div>' +
      '<table class="vcTable">' + rows + '</table>';
    el.voucher.dataset.state = S.voucher_status[v.id] || 'pending';
    el.voucher.style.display = 'block';
    el.voucher.classList.remove('in'); void el.voucher.offsetWidth; el.voucher.classList.add('in');
  }
  function hideVoucher() { el.voucher.style.display = 'none'; el.voucher.innerHTML = ''; }
  /** 決裁層に居るあいだだけ出す。漫画層・RPG層・幕間では消す（裁定Oのライフサイクル） */
  function syncVoucher() {
    if (layer !== '決裁' || S.scene === 'S7.5') return hideVoucher();
    var v = voucherOf(S.scene);
    if (!v) return hideVoucher();
    showVoucher(v);
  }

  function showSlipCard(item, n) {
    el.slipCard.innerHTML = '<div class="slipHead">速射 ' + n + ' / 7</div><div class="slipItem">' + esc(item) + '</div>';
    el.slipCard.classList.remove('in'); void el.slipCard.offsetWidth; el.slipCard.classList.add('in');
    el.slipCard.style.display = 'block';
  }

  /* =======================================================================
   * タイトルコール／エンド／ゲームオーバー
   * ===================================================================== */
  function titleCall() {
    var d = document.createElement('div'); d.className = 'titleCall';
    var u = assetUrl('ui', 'ui_title_logo_01');
    d.innerHTML = u ? '<img src="' + u + '" alt="' + TITLE + '">'
      : '<span>' + TITLE + '</span>';
    el.fxLayer.appendChild(d);
    SOUND.se('se_slam_01'); FX.shake(true);
    setTimeout(function () { d.classList.add('out'); }, 1800);
    setTimeout(function () { d.remove(); }, 2400);
    inputLock = performance.now() + 1600;
    waiting = true; el.app.dataset.wait = '1';
  }

  function theEnd() {
    closeChoices();
    el.overlay.innerHTML = '<div class="ovBox end"><div class="endTitle">完</div>' +
      '<button class="ovBtn" id="toTitle">タイトルへ</button></div>';
    el.overlay.style.display = 'grid';
    $('toTitle').onclick = function () { location.reload(); };
    SOUND.stopBgm(800);
  }

  /* ---- ゲームオーバー4幕（裁定X＋つる確定・台本 4-1） ----------------------
   * S2チュートリアルで魔王が「3回痛めば、私は全部承認して寝る」「貴様の不正は
   * すべて通る」とプレイヤーに約束した分の回収。台詞・決算報告・テロップ・
   * ボタン文言は **すべて台本4章から parse.js が抽出したもの**（REACTION.gameover_*）。
   * コード側で文言も並び順も決め打ちしない。
   *   幕1 ふて寝     決裁層のまま・一枚絵 still_maou_sleep_01 ＋4行
   *   幕2 全件承認   台詞ゼロ・伝票の実数ぶん承認スタンプを連打
   *   幕3 決算報告   黒地・明朝／5行＋テロップ2行（世界は荒廃した…… → GAME OVER）
   *   幕4 復帰       GAME OVER を消さないまま5行 → ボタン2つ
   * 荒廃は絵で描かない（決算書で通告する＝裁定X）。大ゴマは1枚も使わない。
   * goCount は **セッション内カウンタであって状態キーではない**（save() に入れない）。
   * 2回目以降は全幕をタップで即送りできる（カントク必須条件・全誤答で実測5回起きる）。 */
  var goCount = 0, goFast = false, goTapSkip = null, goTimers = [];
  /** ★つる指示（2026-09-01）復帰したときに戻る先＝**間違えた選択肢そのもの**。
   *  `penalty()` が胃0になった瞬間に、通常の間違いと同じ `back`（openJudge / openEvidence）を
   *  ここへ預ける。`wrong_tried` は保持したままなので、**間違えた選択肢は取り消し線で選べない**。 */
  var goResumeAt = null;
  /** 幕1で音を止めるので、**止める前に鳴っていた曲**を覚えておいて復帰時に戻す。
   *  シーンの設定から引き直すと carryOver のシーンで曲が変わってしまう。 */
  var goPrevBgm = null;
  /** 4幕のタイマーは必ずここを通す。**途中で閉じられたら全部止める**
   *  （自動通しプレイは #goRetry を見つけ次第押すので、残った setTimeout が
   *    再開後の場面にオーバーレイを出してしまう）。 */
  function goT(fn, ms) { var id = setTimeout(function () { if (el.overlay.dataset.go) fn(); }, ms); goTimers.push(id); return id; }

  function gameOver() {
    closeChoices();
    goCount++;
    goFast = (goCount >= 2);
    goAct1Sleep();
  }

  /** 幕1 ふて寝。決裁層のまま、伏せた魔王の一枚絵に差し替えて4行流す。 */
  function goAct1Sleep() {
    var nw = SOUND._now && SOUND._now();
    goPrevBgm = (nw && nw.id) || null;                  // 復帰で鳴らし直す曲を控える
    SOUND.stopBgm(0);
    SOUND.se('se_glasses_off_01');                     // 老眼鏡を外して伏せる（既存の合成SE）
    goArt = true;
    setBg('still_maou_sleep_01');
    updateChara();                                     // 立ち絵を引っ込める（伏せた魔王は絵の中に居る）
    var a = REACTION.gameover_sleep || [];
    for (var i = 0; i < a.length; i++) interject.push(mkLine(a[i].who, a[i].text));
    onInterjectEnd = goAct2Approve;
    next();
  }

  /** 幕2 全件承認。台詞は1行も出さない。回数は伝票の実長から取る（増減に自動追従）。 */
  function goAct2Approve() {
    waiting = false; el.app.dataset.wait = '';
    var n = (window.VOUCHERS || []).length;
    var gap = goFast ? 60 : 350;
    goTapSkip = goFast ? function () { gap = 0; } : null;
    var i = 0;
    (function step() {
      if (i >= n) { goTapSkip = null; return setTimeout(goAct3Report, goFast ? 80 : 600); }
      i++;
      if (el.voucher) el.voucher.dataset.state = 'approved';
      FX.stamp('approve'); SOUND.se('se_stamp_ok_01');
      setTimeout(step, gap);
    })();
  }

  /** 幕3 決算報告。黒地・明朝。項目名と値の2カラム＋左寄せの締め言葉＋テロップ2行。 */
  function goAct3Report() {
    SOUND.se('se_boom_01');
    var cap = REACTION.gameover_caption || '';
    var rep = REACTION.gameover_report || [];
    var tel = REACTION.gameover_telop || [];
    var btn = REACTION.gameover_buttons || [];
    var rows = rep.map(function (t, i) {
      if (i === 0) return '<div class="rHead">' + esc(t) + '</div>';   // 見出し行
      var k = t.lastIndexOf('　');                                     // 全角スペースで項目／値に割る
      if (k < 0) return '<div class="rClose">' + esc(t) + '</div>';    // 締め言葉＝左寄せ1カラム
      return '<div class="rItem"><span>' + esc(t.slice(0, k)) + '</span>' +
             '<span class="rVal">' + esc(t.slice(k + 1)) + '</span></div>';
    }).join('');
    el.overlay.dataset.go = '3';
    el.overlay.innerHTML =
      '<div class="ovBox gameover" id="goBox" data-act="3">' +
        '<div class="goDoc">' +
          '<div class="goCap">' + esc(cap) + '</div>' +
          '<div class="goReport">' + rows + '</div>' +
          '<div class="goWorld">' + esc(tel[0] || '') + '</div>' +
        '</div>' +
        '<div class="goOver">' + esc(tel[1] || '') + '</div>' +
        '<div class="goBtns">' +
          '<button class="ovBtn" id="goRetry">' + esc(btn[0] || '') + '</button>' +
          '<button class="ovBtn ghost" id="goTitle">' + esc(btn[1] || '') + '</button>' +
        '</div>' +
      '</div>';
    el.overlay.style.display = 'grid';
    bindGoButtons();
    var box = $('goBox');
    var items = box.querySelectorAll('.goReport > div');
    var step = goFast ? 0 : 450, t = 0;
    for (var i = 0; i < items.length; i++) {
      (function (nd, d) { goT(function () { nd.classList.add('in'); }, d); })(items[i], t += step);
    }
    var tw = t + (goFast ? 0 : 900), to = tw + (goFast ? 0 : 1200);
    goT(function () { box.querySelector('.goWorld').classList.add('in'); }, tw);
    goT(function () { box.querySelector('.goOver').classList.add('in'); }, to);
    goT(goAct4Revive, to + (goFast ? 120 : 1100));
    goTapSkip = goFast ? function () {
      goTimers.forEach(clearTimeout); goTimers = [];
      for (var j = 0; j < items.length; j++) items[j].classList.add('in');
      box.querySelector('.goWorld').classList.add('in');
      box.querySelector('.goOver').classList.add('in');
      goAct4Revive();
    } : null;
  }

  /** 幕4 復帰。**GAME OVER の文字は消さない。** 決裁の間へ戻り、胃薬に気づいて立ち上がる。 */
  function goAct4Revive() {
    goTapSkip = null;
    var box = $('goBox');
    if (box) box.dataset.act = '4';
    el.overlay.dataset.go = '4';                       // 黒地を引いてクリックを下へ通す
    goT(function () {
      var d = box && box.querySelector('.goDoc'); if (d) d.style.display = 'none';
    }, goFast ? 0 : 560);
    // つる指示（2026-08-27 実機）「胃薬飲むまでは突っ伏した魔王のイラストを表示させておいて、
    //   『そんなことさせるわけにはいかん！』で立ち絵にもどって」。
    //   幕4の頭でいきなり決裁の間へ戻していたので、**立ち上がる瞬間が絵で分からなかった**。
    //   → 伏せた絵のまま胃薬に気づき、**「いかん！」の行で顔を上げる**。所作を絵で見せる。
    var a = REACTION.gameover_revive || [], i = 0;
    var riseAt = a.length - 2;                          // 「そんなことさせるわけにはいかん！」の行
    for (var k = 0; k < a.length; k++) {
      if (String(a[k].text || '').indexOf('いかん') >= 0) { riseAt = k; break; }
    }
    /* つる指示（2026-08-27 実機）で幕4は3段になった。
         ①「……ああ、いつぞやもらった胃薬か」まで＝**伏せた絵**（still_maou_sleep_01）
         ②「そんなことさせるわけにはいかん！」＝**覚醒の絵**（still_maou_wake_01）
         ③「……決裁を、続ける」＝**通常の立ち絵に戻り、GAME OVER の表記も消す**
       立ち上がる所作を絵で見せてから、事務に戻ったことを画面から GAME OVER を消して示す。 */
    function wake() {
      var wk = (AS.bg || {})['still_maou_wake_01'];
      if (wk) { goArt = true; setBg('still_maou_wake_01'); }   // 目を見開いて覚醒
      else { rise(); }                                          // 絵が無ければ立ち絵へ（安全側）
    }
    function rise() {
      goArt = false;
      setBg((SC.scene[S.scene] && SC.scene[S.scene].bg) || 'bg_shinsa_01');   // 通常の立ち絵へ
      // ノルマンは幕1で勝ったつもりで出ていっている。**幕4の画面に残さない**
      // （立ち上がる意志は魔王ひとりの場面。ここに居ると台本の退場が無かったことになる）
      charaState.right = null; charaState.trio = false; charaState.speaker = 'maou';
      updateChara();
    }
    function clearGameOver() {
      // つる指示：「決裁を続ける」で **GAME OVER 表記なしに**。終わった画面のまま
      // 続きを喋らせない＝もう終わっていない、を画面で示す。
      var box = $('goBox');
      if (box) { box.dataset.act = '6'; }
      el.overlay.dataset.go = '6';
    }
    function step() {
      if (i >= a.length) return goResume();   // つる指示：ボタンを出さずそのまま審査へ戻る
      var l = a[i];
      if (i === riseAt) wake();                            // ★「いかん！」＝覚醒の絵
      if (i === riseAt + 1) { rise(); clearGameOver(); }   // ★「決裁を、続ける」＝立ち絵＋GAME OVER消す
      i++;
      if (i === a.length) SOUND.se('se_glasses_off_01');   // 最終行＝老眼鏡をかけ直す（幕1の裏返し）
      interject.push(mkLine(l.who, l.text));
      onInterjectEnd = step;
      next();
    }
    var wait = goFast ? 120 : 900;                      // 一拍おいてから胃薬に気づく
    inputLock = performance.now() + wait;
    goT(step, wait);
  }

  /** ボタン2つ。GAME OVER は出したまま。 */
  /* つる指示（2026-08-27 実機）「決裁を続けるの時に出る［続きから］［タイトルへ戻る］これいらない」。
     幕4の最終行「……決裁を、続ける」で**すでに立ち上がって事務に戻っている**のに、
     そこでボタンを出すと「まだ終わった画面のまま」に見えるうえ、伝票UIにも被っていた。
     → ボタンを出さず、**そのまま審査へ戻す**。挙動は［続きから］と同じ
     （胃3・wrong_tried は保持＝詰み防止の要）。 */
  function goResume() {
    goCloseOverlay();                       // goArt=false・オーバーレイを閉じる
    S.stomach = 3;
    var target = S.scene;
    // 4幕のあいだ背景を差し替えているので、**戻り先の絵を明示的に戻す**。
    // これが無いと、ふて寝の絵のまま審査に戻る（実機で確認した不具合）。
    goArt = false;
    setBg((SC.scene[target] && SC.scene[target].bg) || 'bg_shinsa_01');

    /* ★つる指示（2026-09-01 実機）「やり直しは間違った選択肢を選んだところから。
         間違ったやつは取り消し線で選べなくしてそっから再開」。
       戻り先が分かっているなら**シーンを丸ごとやり直さない**。画面だけ審査中の状態へ戻して、
       間違えた選択肢をもう一度開く。`wrong_tried` は消していないので、
       間違えた選択肢は `disabled`＋`.done`（取り消し線）で選べないまま残る＝詰みも起きない。 */
    if (goResumeAt) {
      var at = goResumeAt; goResumeAt = null;
      restoreJudgeScreen();
      pushRetryLine();
      onInterjectEnd = at;                  // 台詞を出しきったら、その選択肢を開き直す
      return next();
    }
    startScene(target, true);
    pushRetryLine();
  }

  /** 復帰の一言。**承認が正解の伝票では出さない。**
   *  つる指摘（2026-09-01 実機）「承認していいやつを差し戻したあとの、復帰して承認する
   *  ところの一文に違和感」。台本4章のリトライ台詞は
   *  **「……いや。通していい額ではない」＝差し戻せ、という意味の1本しかない**。
   *  伝票3（討伐に伴う損害弁償・企画書いわく「本作の心臓＝通すべきものを通す伝票」）で出すと、
   *  **魔王が言ったことと逆を選ぶのが正解**になり、芯そのものを裏切る。
   *  台本は「通すべきものを差し戻した」を別台詞で持っているのに、リトライ台詞だけ
   *  伝票を区別していない＝台本の想定漏れ。**台詞は足さない・変えない。意味が反転する場面で出さない。**
   *  幕4の最終行「……決裁を、続ける」で締まっているので、無くても流れは切れない。 */
  function pushRetryLine() {
    if (!REACTION.retry_line) return;
    var v = voucherOf(S.scene);
    if (v && v.correct === 'approve') return;
    interject.push(mkLine('maou', REACTION.retry_line));
  }

  /** 4幕のあいだに書き換えた「審査中の画面」を元へ戻す。**シーンの進行位置には触らない。**
   *  幕1＝BGM停止・立ち絵を引っ込め、幕2＝伝票に承認スタンプを連打、が入っているので、
   *  その3つを戻せば「間違えた瞬間の画面」に戻る。 */
  function restoreJudgeScreen() {
    if (goPrevBgm) { SOUND.bgm(goPrevBgm); goPrevBgm = null; }
    // 幕1で退場させたノルマンは戻さない（幕4の rise() と同じ画面のまま続ける）
    updateChara();
    // 幕2で 'approved' にした伝票の見た目を、**実際の決裁状況**から引き直す
    // （dataset を直接戻すのではなく showVoucher に決めさせる＝持ち主を1つにする）
    syncVoucher();
    updateHud();
  }

  function goChoice() {
    var box = $('goBox');
    if (box) box.dataset.act = '5';
    el.overlay.dataset.go = '5';
    waiting = false; el.app.dataset.wait = '';
    var b = $('goRetry'); if (b) b.focus();
  }

  function bindGoButtons() {
    // ［続きから］＝**goResume と同じものを呼ぶ**。以前はここに再開処理をもう一組
    //   持っていたが、2026-09-01 に再開位置を変えたとき**片方だけ直す事故**になりかける。
    //   自動プレイは #goRetry を押して通すので、ここが本編と違うと検証にならない。
    $('goRetry').onclick = function () { goResume(); };
    // ［タイトルへ戻る］＝**自動セーブは消さない**。失敗画面にプレイヤーのデータを壊す権限は
    // 持たせない（裁定X）。ここで clearSave() を呼んだら詰みと事故のもと。
    $('goTitle').onclick = function () { location.reload(); };
  }

  function goCloseOverlay() {
    goTimers.forEach(clearTimeout); goTimers = [];      // 残ったタイマーで再開後に出戻らせない
    goTapSkip = null; goArt = false;
    el.overlay.style.display = 'none';
    // ★つる指摘（2026-09-01 実機）「何回目かの机を調べたあと、決裁に戻るボタンが
    //   画面の真ん中じゃなくて上にあった」。**`dataset.go = ''` は属性を消さない**
    //   （`data-go=""` が残る）ので、CSSの `#overlay[data-go]{place-items:stretch}` が
    //   **ゲームオーバーを一度でも経験したあと、ずっと効きっぱなし**になっていた。
    //   実測：確認ダイアログの箱が 386〜529px → **0〜915px（画面いっぱい）**に伸び、
    //   中身が上へ張り付いていた。**属性ごと消す。**
    delete el.overlay.dataset.go;
    el.overlay.innerHTML = '';
  }

  /* =======================================================================
   * RPG層：ドット歩行（04_spec 9章）
   * ===================================================================== */
  var roam = null, sheets = {}, mapImg = null, rafId = 0;

  function loadSheet(id, cb) {
    if (sheets[id]) return cb(sheets[id]);
    var url = assetUrl('dot', id);
    if (!url) return cb(null);
    var im = new Image();
    im.onload = function () {
      if (!ASTATE.dotMagenta) { sheets[id] = im; return cb(im); }
      try {                                            // マゼンタ地を表示時に抜く（原本は書き換えない）
        var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        var g = c.getContext('2d'); g.drawImage(im, 0, 0);
        g.putImageData(keyMagenta(g.getImageData(0, 0, c.width, c.height)), 0, 0);
        sheets[id] = c; cb(c);
      } catch (e) {                                    // file:// のcanvas汚染。抜けないが進行はできる
        if (window.DEBUG) console.warn('キー抜き不可（http で開いてください）:', id);
        sheets[id] = im; cb(im);
      }
    };
    im.onerror = function () { cb(null); };
    im.src = url;
  }

  /** 歩けないRPG層（S1・S9）：キャラを固定配置してマップを描くだけのモード。
   *  操作・NPCのうろうろ・調べるは一切しない（04_spec 9-3「カットシーン扱い」）。 */
  function enterCutscene(sceneId) {
    var cfg = SC.cutscene[sceneId];
    if (!cfg) return;
    if (roam && roam.cutscene && roam.sceneId === sceneId) return;   // 二重に入らない
    var M = SC.map;
    roam = { cutscene: true, sceneId: sceneId, talking: false, actors: {}, keys: {}, path: null,
             player: { x: (cfg.maou || M.start).x, y: (cfg.maou || M.start).y,
                       dir: (cfg.maou || M.start).dir || 'down', moving: false, frame: 0, t: 0 } };
    var need = ['maou'];
    Object.keys(cfg).forEach(function (id) {
      if (id === 'maou') return;
      roam.actors[id] = { x: cfg[id].x, y: cfg[id].y, dir: cfg[id].dir || 'left',
                          vx: 0, frame: 0, t: 0, wait: 1e9 };   // wait=∞ ＝ 動かない
      need.push(id);
    });
    if (!mapImg) { mapImg = new Image(); mapImg.src = assetUrl('map', M.file); }
    var left = need.length;
    need.forEach(function (id) { loadSheet('dot_' + id + '_sheet', function () { if (--left === 0) startLoop(); }); });
    startLoop();                                   // シートを待たずに地図だけ先に出す
    updateWalkFlag();
  }
  function leaveCutscene() {
    if (roam && roam.cutscene) { cancelAnimationFrame(rafId); roam = null; }
  }

  function enterRoam(sceneId) {
    var cfg = SC.interlude[sceneId], M = SC.map;
    // 「話しかけた」フラグは幕間ごとにリセットする（台本7章の talked_npc は幕間内の進行フラグ）。
    // ここを持ち越すと S7 で最初の1人に話した瞬間に連鎖発覚が起き、S5b/S7 の会話が丸ごと死ぬ。
    S.talked_npc = { tact: false, kanban: false, falm: false, norman: false };
    // ★roam を先に作ってから setLayer する。逆にすると setLayer 内の
    //   `roam && !roam.cutscene` が false になり、**data-walk が一度も立たない**。
    //   → D-padも［調べる］も出ず、タッチ専用端末は机を調べられずに詰む（QA-021）。
    roam = {
      cfg: cfg, sceneId: sceneId, talking: false,
      player: { x: M.start.x, y: M.start.y, dir: M.start.dir, moving: false, frame: 0, t: 0 },
      actors: {}, path: null, keys: {},
    };
    setLayer('RPG');
    setBg(null);
    el.mapCanvas.style.display = 'block';
    cfg.npcs.forEach(function (id) {
      var n = M.npc[id];
      roam.actors[id] = { x: n.x, y: n.y, min: n.min, max: n.max, dir: 'left', vx: -1, frame: 0, t: 0, wait: Math.random() * 1500 };
    });
    if (!mapImg) { mapImg = new Image(); mapImg.src = assetUrl('map', M.file); }
    var need = ['maou'].concat(cfg.npcs), left = need.length;
    need.forEach(function (id) { loadSheet('dot_' + id + '_sheet', function () { if (--left === 0) startLoop(); }); });
    // ヘッダ（layer / dir ノード）だけ先に適用
    var s = sceneById(sceneId);
    for (var i = 0; i < s.nodes.length; i++) {
      var n = s.nodes[i];
      if (n.t === 'mark') break;
      if (n.t === 'layer') applyTags(n.tags);
    }
    sceneCard(cfg);
    updateRoamGoal();
  }

  /** 【10】幕間の入りに転換のカードを出す。何をする場面なのかを最初に言う。 */
  function sceneCard(cfg) {
    var touch = window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;
    var how = touch ? '行きたい場所をタップ' : '矢印キーで移動';
    var goal = (cfg.require === 'all3')
      ? '<b>3人全員に話しかける</b>と審査へ戻る'
      : '<b>審査の机を調べる</b>と審査へ戻る';
    var hint = (cfg.require === 'all3')
      ? '' : '<br>仲間に話しかけると<b>次の伝票のヒント</b>が手に入る（話さなくても先へ進める）';
    el.sceneCard.innerHTML = '<div><div class="scHead">審査、一時中断</div>' +
      '<div class="scTitle">魔王城　内部</div>' +
      '<div class="scGoal">' + goal + hint + '<br>' + how + '</div></div>';
    el.sceneCard.classList.remove('out');
    el.sceneCard.style.display = 'grid';
    setTimeout(function () { el.sceneCard.classList.add('out'); }, 1800);
    setTimeout(function () { el.sceneCard.style.display = 'none'; }, 2300);
  }

  /** 【10】目的は消さずに出し続ける（4.2秒で消えるヒントでは伝わらなかった）。 */
  function updateRoamGoal() {
    if (!roam || roam.cutscene) { el.roamGoal.style.display = 'none'; return; }
    var cfg = roam.cfg, txt;
    if (cfg.require === 'all3') {
      var left = cfg.npcs.filter(function (n) { return !S.talked_npc[n]; }).length;
      txt = left ? '仲間に話しかける（あと<b>' + left + '人</b>）' : '<b>審査の机</b>へ戻る';
    } else {
      var t = cfg.npcs.filter(function (n) { return S.talked_npc[n]; }).length;
      txt = '<b>審査の机</b>を調べると次へ　／　仲間に話しかけるとヒント（' + t + '/' + cfg.npcs.length + '）';
    }
    el.roamGoal.innerHTML = txt;
    el.roamGoal.style.display = 'block';
  }

  /** 【11】［調べる］の見た目とラベルを、いま近くにいる相手で変える。 */
  var ACT_NAME = { kanban: 'カンバン', tact: 'タクト', falm: 'ファルム', norman: 'ノルマン' };
  function updateActBtn() {
    if (!el.mvAct) return;
    if (!roam || roam.cutscene || roam.talking) { el.mvAct.dataset.ready = '0'; el.mvAct.textContent = '調べる'; return; }
    var t = nearTarget();
    if (!t) { el.mvAct.dataset.ready = '0'; el.mvAct.textContent = '調べる'; return; }
    el.mvAct.dataset.ready = '1';
    el.mvAct.textContent = (t.kind === 'desk') ? '机を調べる' : (ACT_NAME[t.id] || '') + 'と話す';
  }
  function startLoop() {
    cancelAnimationFrame(rafId);
    var last = performance.now();
    (function loop(t) {
      rafId = requestAnimationFrame(loop);
      var dt = Math.min(50, t - last); last = t;
      try {
        if (roam && !roam.talking && !roam.cutscene) stepRoam(dt);
        if (roam) drawRoam();
      } catch (e) { if (window.DEBUG) console.warn('RPG層の描画で例外（続行）', e); }
    })(last);
  }

  function walkable(x, y) {
    var M = SC.map, f = M.field;
    if (x < f.x0 || x > f.x1 || y < f.y0 || y > f.y1) return false;
    for (var i = 0; i < M.blocks.length; i++) {
      var b = M.blocks[i];
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return false;
    }
    return true;
  }

  /* タップ移動は 8px グリッドの幅優先探索で経路を作る（机を回り込ませるため必須） */
  var GRID = 8;
  function gridKey(gx, gy) { return gx + ',' + gy; }
  function findPath(from, to) {
    var M = SC.map, f = M.field;
    var gx0 = Math.round(f.x0 / GRID), gx1 = Math.round(f.x1 / GRID);
    var gy0 = Math.round(f.y0 / GRID), gy1 = Math.round(f.y1 / GRID);
    // ±3px の余白つきで判定する。壁ぎわを舐める経路を作ると追従で引っかかる
    function cellOk(gx, gy) {
      var x = gx * GRID, y = gy * GRID, m = 3;
      return walkable(x, y) && walkable(x - m, y) && walkable(x + m, y) &&
             walkable(x, y - m) && walkable(x, y + m);
    }
    var sx = Math.round(from.x / GRID), sy = Math.round(from.y / GRID);
    var tx = Math.round(to.x / GRID), ty = Math.round(to.y / GRID);
    if (!cellOk(tx, ty)) {                       // 目的地が壁なら一番近い通行可へ寄せる
      var best = null, bd = 1e9;
      for (var y = gy0; y <= gy1; y++) for (var x = gx0; x <= gx1; x++) {
        if (!cellOk(x, y)) continue;
        var d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (!best) return null;
      tx = best[0]; ty = best[1];
    }
    var q = [[sx, sy]], prev = {}, seen = {};
    seen[gridKey(sx, sy)] = 1;
    var D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      var c = q.shift();
      if (c[0] === tx && c[1] === ty) break;
      for (var i = 0; i < 4; i++) {
        var nx = c[0] + D[i][0], ny = c[1] + D[i][1];
        if (nx < gx0 || nx > gx1 || ny < gy0 || ny > gy1) continue;
        var k = gridKey(nx, ny);
        if (seen[k] || !cellOk(nx, ny)) continue;
        seen[k] = 1; prev[k] = c; q.push([nx, ny]);
      }
    }
    if (!seen[gridKey(tx, ty)]) return null;
    var path = [], cur = [tx, ty];
    while (cur && !(cur[0] === sx && cur[1] === sy)) {
      path.unshift({ x: cur[0] * GRID, y: cur[1] * GRID });
      cur = prev[gridKey(cur[0], cur[1])];
    }
    return path;
  }

  var stepSfx = 0;
  function stepRoam(dt) {
    var p = roam.player, M = SC.map, sp = 72 * dt / 1000, dx = 0, dy = 0, k = roam.keys;
    if (k.left) dx -= 1; if (k.right) dx += 1; if (k.up) dy -= 1; if (k.down) dy += 1;
    if (dx || dy) roam.path = null;
    var auto = false;
    if (!dx && !dy && roam.path && roam.path.length) {
      auto = true;
      var w = roam.path[0];
      var tx = w.x - p.x, ty = w.y - p.y;
      if (Math.abs(tx) < 3 && Math.abs(ty) < 3) { roam.path.shift(); }
      else if (Math.abs(tx) > Math.abs(ty)) { dx = tx > 0 ? 1 : -1; roam.alt = ty > 0 ? [0, 1] : (ty < 0 ? [0, -1] : null); }
      else { dy = ty > 0 ? 1 : -1; roam.alt = tx > 0 ? [1, 0] : (tx < 0 ? [-1, 0] : null); }
    }
    p.moving = !!(dx || dy);
    var moved = false;
    if (dx) { p.dir = dx > 0 ? 'right' : 'left'; if (walkable(p.x + dx * sp, p.y)) { p.x += dx * sp; moved = true; } }
    if (dy) { p.dir = dy > 0 ? 'down' : 'up'; if (walkable(p.x, p.y + dy * sp)) { p.y += dy * sp; moved = true; } }
    if (auto && !moved) {
      // 主軸が塞がれた → もう片方の軸で回り込む。それも無理なら経路を捨てる（固まらせない）
      var a = roam.alt;
      if (a && walkable(p.x + a[0] * sp, p.y + a[1] * sp)) {
        p.x += a[0] * sp; p.y += a[1] * sp;
        p.dir = a[0] ? (a[0] > 0 ? 'right' : 'left') : (a[1] > 0 ? 'down' : 'up');
        moved = true;
      } else { roam.path = null; }
    }
    if (auto) {
      roam.stuck = moved ? 0 : (roam.stuck || 0) + dt;
      if (roam.stuck > 500) { roam.path = null; roam.stuck = 0; }
    }
    if (p.moving) {
      p.t += dt;
      if (p.t > 220) { p.t = 0; p.frame ^= 1; }
      stepSfx += dt;
      if (stepSfx > 300) { stepSfx = 0; SOUND.se('se_step_01'); }
    } else { p.frame = 0; }
    // NPC：左右2方向のうろうろ
    Object.keys(roam.actors).forEach(function (id) {
      var a = roam.actors[id];
      if (a.wait > 0) { a.wait -= dt; a.frame = 0; return; }
      a.x += a.vx * 28 * dt / 1000;
      if (a.x < a.min) { a.x = a.min; a.vx = 1; a.wait = 1200 + Math.random() * 1600; }
      if (a.x > a.max) { a.x = a.max; a.vx = -1; a.wait = 1200 + Math.random() * 1600; }
      a.dir = a.vx > 0 ? 'right' : 'left';
      a.t += dt; if (a.t > 240) { a.t = 0; a.frame ^= 1; }
    });
  }

  function nearTarget() {
    var p = roam.player, M = SC.map, best = null, bd = 40;
    Object.keys(roam.actors).forEach(function (id) {
      var a = roam.actors[id], d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bd) { bd = d; best = { kind: 'npc', id: id }; }
    });
    if (best) return best;
    var d2 = M.desk;
    if (p.x > d2.x && p.x < d2.x + d2.w && p.y > d2.y && p.y < d2.y + d2.h) return { kind: 'desk' };
    return null;
  }

  function drawRoam() {
    var M = SC.map, z = M.zoom, c = el.mapCanvas;
    if (c.width !== M.w * z) { c.width = M.w * z; c.height = M.h * z; }
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    // complete は「壊れた画像」でも true になる。naturalWidth を見ないと drawImage が例外を投げ、
    // RPG層のループごと落ちる（素材が1点欠けただけでゲームが止まる）
    if (drawable(mapImg)) g.drawImage(mapImg, 0, 0, c.width, c.height);
    else { g.fillStyle = '#241d2c'; g.fillRect(0, 0, c.width, c.height); }

    var list = Object.keys(roam.actors).map(function (id) { return { id: id, a: roam.actors[id] }; });
    list.push({ id: 'maou', a: roam.player });
    list.sort(function (p, q) { return p.a.y - q.a.y; });
    list.forEach(function (o) { drawSprite(g, o.id, o.a, z); });

    // 【11】調べられる相手を**常に**指し示す。近くの1人だけ明るく、それ以外は控えめに。
    //   （以前は「近づいたときだけ！が出る」ので、近づく前は何ができるか分からなかった）
    var tgt = roam.cutscene ? null : nearTarget();
    if (!roam.cutscene && !roam.talking) {
      g.textAlign = 'center';
      g.font = 'bold ' + (11 * z / 3) + 'px sans-serif';
      Object.keys(roam.actors).forEach(function (id) {
        if (tgt && tgt.kind === 'npc' && tgt.id === id) return;
        var a2 = roam.actors[id];
        g.fillStyle = 'rgba(255,228,92,.45)';
        g.fillText('・', a2.x * z, (a2.y - 36) * z);
      });
      var dk = SC.map.desk;
      if (!(tgt && tgt.kind === 'desk')) {
        g.fillStyle = 'rgba(255,228,92,.45)';
        g.fillText('・', (dk.x + dk.w / 2) * z, (dk.y + 4) * z);
      }
    }
    if (tgt && !roam.talking) {
      var pos = tgt.kind === 'npc' ? roam.actors[tgt.id] : { x: roam.player.x, y: roam.player.y - 6 };
      g.fillStyle = '#ffe45c'; g.font = 'bold ' + (14 * z / 3) + 'px sans-serif'; g.textAlign = 'center';
      g.fillText('！', pos.x * z, (pos.y - 38) * z);
    }
    updateActBtn();
    if (window.DEBUG) drawDebug(g, z);
  }

  /** canvas に描ける状態か（<canvas> はそのままOK、<img> は読み込み成功時のみ） */
  function drawable(im) {
    if (!im) return false;
    if (im.tagName === 'CANVAS') return im.width > 0;
    return im.complete && im.naturalWidth > 0;
  }

  /** コマ割りは stagecraft の dotSprite 表に従う（つる指摘【9】）。
   *  'mirror:xxx' の向きは、xxx のコマを**左右反転して**描く。
   *  ★アニメの2コマは必ず同じ向きのコマ同士。ここを跨ぐと「振り向きながら歩く」になる。 */
  function spriteFrame(id, dir, moving, frame) {
    var t = (SC.dotSprite || {})[id] || {};
    var v = t[dir];
    var mirror = false;
    if (typeof v === 'string' && v.indexOf('mirror:') === 0) { mirror = true; v = t[v.slice(7)]; }
    if (!v) { v = t.right || t.down || [0, 1]; }
    return { f: v[moving ? (frame & 1) : 0], mirror: mirror };
  }

  function drawSprite(g, id, a, z) {
    var sh = sheets['dot_' + id + '_sheet'];
    if (!drawable(sh)) { g.fillStyle = '#c33'; g.fillRect((a.x - 8) * z, (a.y - 24) * z, 16 * z, 24 * z); return; }
    var sp = spriteFrame(id, a.dir, a.moving, a.frame);
    var f = sp.f, max = (sh.width / 32) - 1;
    if (f > max) f = max;
    var dx = (a.x - 16) * z, dy = (a.y - 32) * z, w = 32 * z;
    if (sp.mirror) {
      g.save();
      g.translate(dx + w, dy);
      g.scale(-1, 1);
      g.drawImage(sh, f * 32, 0, 32, 32, 0, 0, w, w);
      g.restore();
    } else {
      g.drawImage(sh, f * 32, 0, 32, 32, dx, dy, w, w);
    }
  }

  function drawDebug(g, z) {
    var M = SC.map, f = M.field;
    g.strokeStyle = 'rgba(0,255,120,.7)'; g.lineWidth = 2;
    g.strokeRect(f.x0 * z, f.y0 * z, (f.x1 - f.x0) * z, (f.y1 - f.y0) * z);
    g.fillStyle = 'rgba(255,60,60,.28)';
    M.blocks.forEach(function (b) { g.fillRect(b.x * z, b.y * z, b.w * z, b.h * z); });
    g.fillStyle = 'rgba(80,160,255,.32)';
    g.fillRect(M.desk.x * z, M.desk.y * z, M.desk.w * z, M.desk.h * z);
    g.fillStyle = '#0f0';
    g.fillRect((roam.player.x - 2) * z, (roam.player.y - 2) * z, 4 * z, 4 * z);
  }

  function roamInteract() {
    if (!roam || roam.talking || roam.cutscene) return;
    updateRoamGoal();
    var t = nearTarget();
    if (!t) return;
    if (t.kind === 'desk') {
      SOUND.se('se_item_01');
      confirmDesk();
      return;
    }
    talkTo(t.id);
  }

  function confirmDesk() {
    roam.talking = true; updateWalkFlag();
    el.overlay.innerHTML = '<div class="ovBox confirm"><div class="cfText">審査を再開する。よいな？</div>' +
      '<div class="cfBtns"><button class="ovBtn" id="cfYes">はい</button><button class="ovBtn ghost" id="cfNo">いいえ</button></div></div>';
    el.overlay.style.display = 'grid';
    $('cfYes').onclick = function () {
      el.overlay.style.display = 'none';
      cancelAnimationFrame(rafId); roam = null;
      el.roamGoal.style.display = 'none';
      startScene(SC.interlude[S.scene].next);
    };
    $('cfNo').onclick = function () { el.overlay.style.display = 'none'; roam.talking = false; updateWalkFlag(); };
  }

  /** NPCに話しかける＝そのブロックだけを再生して roam へ戻る */
  function talkTo(id) {
    var label = SC.npcBlockLabel[id];
    var s = sceneById(roam.sceneId);
    var nodes = blockNodes(s, label);
    if (!nodes.length) return;
    // フラグはブロックに入った瞬間に立てる（途中で中断しても立ったまま）
    var fl = roam.cfg.flagOnEnter && roam.cfg.flagOnEnter[id];
    if (fl) S[fl] = true;
    S.talked_npc[id] = true;
    roam.talking = true; updateWalkFlag();
    playBlock(nodes, function () {
      roam.talking = false; updateWalkFlag();
      el.balloons.innerHTML = '';
      var c = roam.cfg;
      if (c.require === 'all3' && c.npcs.every(function (n) { return S.talked_npc[n]; })) {
        var auto = blockNodes(s, c.autoBlock);
        roam.talking = true; updateWalkFlag();
        playBlock(auto, function () {
          cancelAnimationFrame(rafId); roam = null;
          startScene(c.next);
        });
      }
    });
  }

  function blockNodes(s, label) {
    var out = [], on = false;
    for (var i = 0; i < s.nodes.length; i++) {
      var n = s.nodes[i];
      if (n.t === 'mark') { on = (n.label.indexOf(label) === 0); continue; }
      if (on) out.push(n);
    }
    return out;
  }

  var blockQueue = null, blockDone = null;
  function playBlock(nodes, done) {
    blockQueue = nodes.slice(); blockDone = done;
    stepBlock();
  }
  function stepBlock() {
    if (!blockQueue || !blockQueue.length) { var d = blockDone; blockQueue = null; blockDone = null; if (d) d(); return; }
    var n = blockQueue.shift();
    if (n.t !== 'line' && n.t !== 'narr' && n.t !== 'beat') { applyTags(n.tags); return stepBlock(); }
    if (n.t === 'beat') { applyTags(n.tags); return setTimeout(stepBlock, 700); }
    var extra = applyTags(n.tags);
    showLine(n.t === 'narr' ? { who: 'narration', name: '', text: n.text, tags: n.tags } : n, function () {
      inputLock = performance.now() + ((extra === -1) ? 80 : (extra || 0));
      waiting = true; el.app.dataset.wait = '1';
    });
  }

  /* =======================================================================
   * 入力
   * ===================================================================== */
  /** オーバーレイが「入力を受け取る状態」か。
   *  ★ゲームオーバーの幕4・幕6は `pointer-events:none` で**わざとクリックを下へ通す**設計
   *  （つる指示でボタンを出さず、そのまま台詞を送って審査へ戻る）。そこでキーを奪うと
   *  **進めなくなって詰む**ので、見た目ではなく pointer-events で判定する。 */
  function overlayCaptures() {
    if (!el.overlay) return false;
    var d = el.overlay.style.display;
    if (!d || d === 'none') return false;
    return getComputedStyle(el.overlay).pointerEvents !== 'none';
  }
  /** Enter で押す既定のボタン＝**オーバーレイの先頭の押せるボタン**。
   *  机の確認なら［はい］、タイトルならセーブがあれば［続きから］、無ければ［はじめから］。
   *  並び順がそのまま既定になるので、コード側に文言を持たない。 */
  function overlayDefaultBtn() {
    return el.overlay.querySelector('button:not([disabled])');
  }

  function onAdvance(ev) {
    SOUND.resume();
    if (cfgOpen) return;                                   // 設定を開いている間は進まない
    // 2回目以降のゲームオーバーは、台詞のない幕2・幕3もタップで即送りできる（裁定Xの必須条件）
    if (goTapSkip) { var gs = goTapSkip; goTapSkip = null; gs(); return; }
    if (reviewAt >= 0) { stepReview(+1); return; }         // 読み返し中は「今」へ向かって進むだけ
    if (roam && !roam.talking && !roam.cutscene) return;   // 歩ける場面のクリックは移動指示
    if (blockQueue !== null) {
      if (performance.now() < inputLock) return;
      if (typing) { skipTyping(); return; }
      if (!waiting) return;
      waiting = false; el.app.dataset.wait = '';
      return stepBlock();
    }
    advance();
  }

  function setupInput() {
    document.addEventListener('click', function (ev) {
      if (ev.target.closest('button')) return;
      if (roam && !roam.talking && !roam.cutscene) {
        var r = el.mapCanvas.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          var goal = { x: (ev.clientX - r.left) / r.width * SC.map.w, y: (ev.clientY - r.top) / r.height * SC.map.h };
          roam.path = findPath(roam.player, goal);
          SOUND.resume();
        }
        return;
      }
      onAdvance(ev);
    });
    var KMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    document.addEventListener('keydown', function (e) {
      SOUND.resume();
      /* ★つる指摘（2026-09-01 実機）「机に戻って決裁に戻るボタンだけエンターキーが使えない」。
         オーバーレイのボタンに**一度もフォーカスを当てていなかった**（`focus()` は
         ゲームオーバーの1か所だけ）ので、Enter がボタンに届かず、そのまま台詞送りへ流れていた。
         机の確認だけでなく**タイトル画面・設定パネルも同じ**だった＝1か所で決める。
         **開いているオーバーレイがあれば、Enter/Space はそこのもの。** */
      if (overlayCaptures() && (e.key === 'Enter' || e.key === ' ')) {
        var a = document.activeElement;
        // Tab でボタンを選んでいるなら**ブラウザ既定に任せる**。ここで preventDefault すると
        // Enter によるクリックまで潰してしまい、選んだボタンが押せなくなる。
        if (a && a.tagName === 'BUTTON' && el.overlay.contains(a)) return;
        var b = overlayDefaultBtn();
        if (b) b.click();                      // フォーカスが無いときだけ既定ボタンを押す
        e.preventDefault();                    // 台詞送りへは流さない（二重発火を防ぐ）
        return;
      }
      if (roam && !roam.talking && !roam.cutscene) {
        var k = KMAP[e.key] || KMAP[e.key.toLowerCase()];
        if (k) { roam.keys[k] = true; roam.path = null; e.preventDefault(); return; }
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') { roamInteract(); e.preventDefault(); return; }
        return;
      }
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.key === 'ArrowRight') { onAdvance(e); e.preventDefault(); }
    });
    document.addEventListener('keyup', function (e) {
      if (!roam) return;
      var k = KMAP[e.key] || KMAP[e.key.toLowerCase()];
      if (k) roam.keys[k] = false;
    });
    // ★つる指摘【15】「BGMの音量調整できるようにしてね」——機能はあったが**見つけられなかった**。
    //   音のUIが左上（⚙）と右下（♪ON）に分かれていて、目立つ♪ONにはミュートしか無かったのが原因。
    //   → **♪ボタンも設定パネルを開く**（音の入口を1つに統合）。ミュートはパネルの中にある。
    el.muteBtn.onclick = function (ev) { ev.stopPropagation(); SOUND.resume(); if (cfgOpen) closeConfig(); else openConfig(); };
    el.btnBack.onclick = function (ev) { ev.stopPropagation(); SOUND.resume(); stepReview(-1); };
    el.btnCfg.onclick = function (ev) { ev.stopPropagation(); SOUND.resume(); if (cfgOpen) closeConfig(); else openConfig(); };
    updateSysBtns();
    var mv = $('mvUp');
    ['mvUp', 'mvDown', 'mvLeft', 'mvRight', 'mvAct'].forEach(function (id) {
      var b = $(id); if (!b) return;
      var k = id.slice(2).toLowerCase();
      function on(e) { e.preventDefault(); e.stopPropagation(); if (!roam) return; if (k === 'act') roamInteract(); else { roam.keys[k] = true; roam.path = null; } }
      function off(e) { e.preventDefault(); e.stopPropagation(); if (roam && k !== 'act') roam.keys[k] = false; }
      b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('mousedown', on);
      b.addEventListener('touchend', off, { passive: false }); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
    });
  }

  /* =======================================================================
   * 単位スケール（04_spec 3-2）
   * ===================================================================== */
  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var port = (vw / vh < 1.2);
    el.app.dataset.orient = port ? 'port' : 'land';
    // 文字の基準寸法。横長は「画の高さ」基準、縦持ちは「画面の幅」基準にしないと字が潰れる
    var u = port ? Math.min(vw / 31, vh / 68)
                 : Math.min(vw / 64, Math.max(120, el.view.clientHeight) / 36);
    el.app.style.setProperty('--u', Math.max(7, u).toFixed(3) + 'px');
    setContentBand(vw, vh);
  }

  /** ★つる指摘【7】「画面横いっぱいは見ずらい。左右20%ずつは人物とテキスト配置しないで背景だけ」。
   *  **人物とテキストを中央の帯へ収める**（背景・マップ・大ゴマは画面いっぱいのまま）。
   *  ただし狭い画面で60%に絞ると窮屈なので、**アスペクト比で可変**にする：
   *    16:9より横長 → 60%（左右20%ずつ空ける）／縦持ち（6:5より縦） → 100%（従来どおり）
   *    その間は線形。細い窓で潰さないよう最低360pxの保険つき。
   *  帯は CSS 変数（--cw / --cpad）で配り、位置はCSS側で解決する。 */
  var BAND_WIDE = 1.78, BAND_TALL = 1.20, BAND_MIN_FRAC = 0.60;
  function bandFrac(vw, vh) {
    if (!vh) return 1;
    var a = vw / vh;
    if (a >= BAND_WIDE) return BAND_MIN_FRAC;
    if (a <= BAND_TALL) return 1;
    return 1 - (a - BAND_TALL) / (BAND_WIDE - BAND_TALL) * (1 - BAND_MIN_FRAC);
  }
  function setContentBand(vw, vh) {
    var cw = Math.round(vw * bandFrac(vw, vh));
    cw = Math.max(cw, Math.min(vw, 360));            // 細い窓で潰さない
    el.app.style.setProperty('--cw', cw + 'px');
    el.app.style.setProperty('--cpad', Math.round((vw - cw) / 2) + 'px');
  }
  /** 帯の左右端（#view 座標）。吹き出しの置き場所にも使う。 */
  function contentBand() {
    var vr = el.view.getBoundingClientRect();
    var pad = parseFloat(getComputedStyle(el.app).getPropertyValue('--cpad')) || 0;
    return { left: pad, right: vr.width - pad, width: vr.width - pad * 2 };
  }
  window.GAME_BAND = contentBand;                    // デバッグ用

  /* =======================================================================
   * セーブ（04_spec 5-2）
   * ===================================================================== */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, scene: S.scene, stomach: 3, voucher_status: S.voucher_status, evidence: S.evidence,
        hint_kanban: S.hint_kanban, hint_falm: S.hint_falm, talked_npc: S.talked_npc,
        wrong_tried: S.wrong_tried, ts: Date.now(),
      }));
    } catch (e) {}
  }
  function loadSave() {
    try {
      var d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d || d.v !== 1 || SC.savePoints.indexOf(d.scene) < 0) return null;
      return d;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  /* =======================================================================
   * タイトル
   * ===================================================================== */
  function title() {
    var sv = loadSave();
    var logo = assetUrl('ui', 'ui_title_logo_01');
    // ★つる採用＝案B（`title_key_b`）。**絵を全面に敷き、ロゴは上端の静かな壁へ**。
    //   キービジュアルの構図（実測）：タクト11% / ファルム26% / カンバン35% / ノルマン49% / 魔王82%、
    //   顔は高さ33〜40%、机の上の対比（散らかり↔整然）は60〜72%。
    //   → 文字は**上端0〜26%（横エッジ1.4〜1.8の平坦な壁）**と**下端**にだけ置き、
    //     顔と机には一切かぶせない。可読性はべた塗りでなくグラデーションのスクリムで確保する。
    var kv = assetUrl('bg', 'title_key_b');
    if (kv) el.overlay.style.setProperty('--keyTex', 'url("' + new URL(kv, location.href).href + '")');
    else el.overlay.style.removeProperty('--keyTex');
    // つる指示（2026-08-27）縦持ちは**縦長のキービジュアルを全面に**敷き、
    //   ロゴもボタンもその上へ重ねる。無ければ横長へ自動で戻る（CSSの var 既定値）。
    var kvp = assetUrl('bg', 'title_key_b_portrait_v2');
    if (kvp) el.overlay.style.setProperty('--keyTexP', 'url("' + new URL(kvp, location.href).href + '")');
    else el.overlay.style.removeProperty('--keyTexP');
    el.overlay.dataset.title = kv ? '1' : '';
    el.overlay.innerHTML =
      '<div class="ovBox titleScreen">' +
      '<div class="tkArt"></div>' +
      '<div class="tkTop">' +
      (logo ? '<img class="titleLogo" src="' + logo + '" alt="' + TITLE + '">'
            : '<h1 class="titleLogo">' + TITLE + '</h1>') +
      // キャッチコピーはロゴ画像に入っていない（差し替えが利くようCSSで組む・2026-08-23 つる確定）
      '<div class="titleCatch">' + TAGLINE + '</div>' +
      '</div>' +
      '<div class="tkMid"></div>' +
      '<div class="tkFoot">' +
      // ★サブタイトルは**タイトル画面には出さない**（2026-08-23 つる【17】）。
      //   作品としてのサブタイトルは生きている＝SUBTITLE 定数と index.html の
      //   <title> はそのまま。ここで消すのは「画面表示」だけ。
      '<div class="titleBtns">' +
      (sv ? '<button class="ovBtn" id="btnCont">続きから（' + esc(sv.scene) + '）</button>' : '') +
      '<button class="ovBtn' + (sv ? ' ghost' : '') + '" id="btnNew">はじめから</button>' +
      '</div>' +
      '<div class="titleNote">' + statusNote() + '</div>' +
      '</div></div>';
    el.overlay.style.display = 'grid';
    function leaveTitle() { el.overlay.style.display = 'none'; el.overlay.dataset.title = ''; el.overlay.style.removeProperty('--keyTex'); }
    $('btnNew').onclick = function () { SOUND.resume(); clearSave(); S = freshState(); leaveTitle(); startScene('S0'); };
    if (sv) $('btnCont').onclick = function () {
      SOUND.resume(); S = freshState();
      Object.assign(S, { voucher_status: sv.voucher_status, evidence: sv.evidence, hint_kanban: sv.hint_kanban,
        hint_falm: sv.hint_falm, talked_npc: sv.talked_npc, wrong_tried: sv.wrong_tried, stomach: 3 });
      leaveTitle(); startScene(sv.scene, true);
    };
  }
  function statusNote() {
    var n = [];
    var tn = (ASTATE.charaTransparentIds || []).length;
    if (!ASTATE.charaTransparent) n.push('立ち絵の透過 ' + tn + '/17');
    if ((ASTATE.bgmMissing || []).length) n.push('BGM ' + (8 - (ASTATE.bgmMissing || []).length) + '/8');
    return n.length ? '（素材の状態： ' + n.join('　／　') + '）' : '';
  }

  /* =======================================================================
   * デバッグ
   * ===================================================================== */
  function debugPanel() {
    if (!window.DEBUG) return;
    el.debugBox.style.display = 'block';
    var html = '<div class="dbgRow">' + SCENES.map(function (s) {
      return '<button data-s="' + s.id + '">' + s.id + '</button>';
    }).join('') + '<button data-act="clear">セーブ消去</button></div><pre id="dbgState"></pre>';
    el.debugBox.innerHTML = html;
    el.debugBox.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.stopPropagation();
      if (b.dataset.act === 'clear') { clearSave(); alert('消した'); return; }
      cancelAnimationFrame(rafId); roam = null; closeChoices();
      el.overlay.style.display = 'none';
      interject = []; onInterjectEnd = null; blockQueue = null;
      startScene(b.dataset.s);
    };
    setInterval(function () {
      var p = $('dbgState'); if (!p) return;
      p.textContent = JSON.stringify({ scene: S && S.scene, node: S && S.node, stomach: S && S.stomach,
        slip: S && S.slip_index, hint_kanban: S && S.hint_kanban, hint_falm: S && S.hint_falm,
        talked: S && S.talked_npc, layer: layer, bgm: SOUND.currentBgm(), waiting: waiting }, null, 1);
    }, 250);
  }

  /* =======================================================================
   * 起動
   * ===================================================================== */
  function boot() {
    bind();
    S = freshState();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
    setupInput();
    debugPanel();
    updateMuteBtn();
    var jump = Q.get('scene');
    // var() で差し込む url() は「宣言元」基準で解決される（style.css 基準になって404る）。
    // 必ず絶対URLにしてから渡す。
    var mg = ASTATE.uiMagenta || {};
    var needKey = ['ui_stomach_01', 'ui_stamp_reject_01', 'ui_stamp_approve_01', 'ui_title_logo_01']
      .filter(function (id) { return mg[id]; });
    prekey(needKey, function () {
      var pt = assetUrl('ui', 'ui_paper_01');   // 全UIの下地（03_assets 6章・QA-012）
      if (pt) el.app.style.setProperty('--paperTex', 'url("' + new URL(pt, location.href).href + '")');
      var su = assetUrl('ui', 'ui_stomach_01');
      // var() で差し込む url() は「宣言元」基準で解決される（style.css 基準になって404る）。
      // 必ず絶対URL（またはdataURL）にしてから渡す。
      if (su) el.app.style.setProperty('--stomach', 'url("' + new URL(su, location.href).href + '")');
      if (jump && sceneById(jump)) { el.overlay.style.display = 'none'; startScene(jump); }
      else title();
    });
    if (Q.get('auto') === '1') {                       // QA用の自動通しプレイ（14-2）
      var sc = document.createElement('script'); sc.src = 'js/autoplay.js?v=' + Date.now();
      document.body.appendChild(sc);
    }
  }

  /* typeInto が全文復元できるよう、最後に組んだHTMLを覚えておく */
  var _typeInto = typeInto;
  typeInto = function (target, html, node, cb) { lastFull = { target: target, html: html }; return _typeInto(target, html, node, cb); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.GAME = {
    get state() { return S; }, get roam() { return roam; }, get layer() { return layer; },
    startScene: function (id) { startScene(id); }, save: save, clearSave: clearSave,
    _findPath: function (a, b) { return findPath(a, b); },
    _step: function (dt) { if (roam && !roam.talking) stepRoam(dt); },   // 自動テスト用（rAFの代わり）
    _gameOver: function () { gameOver(); },            // QA用：4幕演出を胃0まで削らずに確認する
    _dbg: function () { return { waiting: waiting, typing: !!typing, typeCb: !!typeCb,
      lock: Math.max(0, inputLock - performance.now()), blockQueue: blockQueue && blockQueue.length,
      idx: idx, nodes: scene && scene.nodes.length, choicesOpen: choicesOpen,
      interject: interject.length, onEnd: !!onInterjectEnd, layer: layer }; },
    _walkable: function (x, y) { return walkable(x, y); },
    _interact: function () { roamInteract(); },
    _canWalk: function () { return el.app.dataset.walk === '1'; },
  };
})();
