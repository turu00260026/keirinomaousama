/* stagecraft.js — 素材の割り当て表（04_spec.md 4-2）
 *
 * 【規約】素材の割り当てはこの1ファイルに集約する。scenes.js（生成物）は手で触らない。
 * 表情の割り当ては 03_assets.md 2-2 の「使用シーン」列を機械化したもの。
 * smoke-test が全エントリの命中を検証する（命中0のエントリがあったら落ちる）。
 */
window.STAGECRAFT = {

  /* ---- ① シーン既定：層・背景・BGM ------------------------------------- */
  scene: {
    'S0':   { layer: 'RPG',  bg: 'still_village_01', bgm: 'bgm_opening_01', font: 'mincho', tone: 'serious', speed: 'slow' },
    // S1は「冒頭のぶつ切り」そのもの。シーンに入った瞬間に音・書体・トーンを切り替えると
    // 03_assets 7-3 のタイムライン（+0.3s扉／+0.8sカット／+1.6s明転）が全部0秒に潰れる。
    // → carryOver:true で S0 の状態（荘厳なBGM・明朝・シリアス）を持ち越し、
    //    切り替えは openingCut のタイムラインが行う。
    'S1':   { layer: '漫画', bg: null,                                   carryOver: true },
    'S2':   { layer: '決裁', bg: 'bg_shinsa_01',  bgm: 'bgm_shinsa_01',  font: 'gothic', tone: 'gag' },
    'S3':   { layer: '決裁', bg: 'bg_shinsa_01',  bgm: 'bgm_shinsa_01',  font: 'gothic', tone: 'gag' },
    'S3b':  { layer: 'RPG',  bg: null,            bgm: 'bgm_field_01',   font: 'gothic', tone: 'gag' },
    'S4':   { layer: '決裁', bg: 'bg_shinsa_01',  bgm: 'bgm_shinsa_01',  font: 'gothic', tone: 'gag' },
    'S5':   { layer: '決裁', bg: 'bg_shinsa_01',  bgm: 'bgm_shinmiri_01',font: 'gothic', tone: 'gag' },
    'S5b':  { layer: 'RPG',  bg: null,            bgm: 'bgm_field_01',   font: 'gothic', tone: 'gag' },
    'S6':   { layer: '決裁', bg: 'bg_shinsa_01',  bgm: 'bgm_shinsa_01',  font: 'gothic', tone: 'gag' },
    'S7':   { layer: 'RPG',  bg: null,            bgm: 'bgm_field_01',   font: 'gothic', tone: 'gag' },
    'S7.5': { layer: '決裁', bg: 'bg_shinsa_01',  bgm: 'bgm_rush_01',    font: 'gothic', tone: 'gag', speed: 'fast' },
    'S8':   { layer: '決裁', bg: 'bg_shinsa_01',  bgm: 'bgm_boss_01',    font: 'gothic', tone: 'gag' },
    'S9':   { layer: '漫画', bg: 'bg_shinsa_01',  bgm: 'bgm_shinsa_01',  font: 'gothic', tone: 'gag' },
  },

  /* ---- ⑨b 冒頭シリアス→ぶつ切り明転のタイムライン（03_assets 7-3・秒単位） ----
   * S0末のクリックを 0.0s とする。ここは本作の第一の見せ場で、実装の都合で圧縮しない。
   *   +0.30s 大扉の軋みを**BGMに被せて**鳴らす（荘厳な曲の上に異物が乗る0.5秒）
   *   +0.80s bgm_throne_01 をフェードなしで即カット
   *   +0.80〜1.60s **完全な無音**。大ゴマ#1 だけが出ている（入力も止める）
   *   +1.60s 台詞と同時に明転＋書体を明朝→ゴシックへ。se_flash_01 を粒ひとつぶんだけ
   */
  openingCut: {
    scene: 'S1',
    doorSe: 300,        // +0.3s
    cutBgm: 800,        // +0.8s（フェード0ms）
    hold: 1600,         // +1.6s まで無音・入力ロック
    flashGain: 0.10,    // 明転に付ける音の粒（ごく小さく）
  },

  /* S0 の途中で一枚絵②へ切り替える（layerノードの variant で拾う） */
  bgByVariant: {
    'RPG層／一枚絵①：村を発つ勇者一行': 'still_village_01',
    'RPG層／一枚絵②：魔王城・玉座の間': 'still_throne_01',
    'RPG層／魔王城マップ': null,                 // ドットマップ
    'RPG層／ドット絵・魔王城マップ': null,
    'RPG層／魔王城・城門前（引きの画）': 'still_gate_dusk_01',
  },
  /* 一枚絵②へ入った時点で BGM を差し替える */
  bgmByVariant: {
    'RPG層／一枚絵②：魔王城・玉座の間': 'bgm_throne_01',
    'RPG層／魔王城・城門前（引きの画）': 'bgm_tohoho_01',
  },

  /* ---- ② 立ち絵の既定表情（キャラ×シーン。03_assets 2-2） -------------- */
  faceDefault: {
    maou:   { _: 'a', S3: 'c', S4: 'c', S5: 'c', S6: 'c', 'S7.5': 'c', S8: 'c', S9: 'c' },
    norman: { _: 'a' },
    falm:   { _: 'a' },
    kanban: { _: 'a' },
    tact:   { _: 'a' },
  },

  /* ---- ③ 台詞で表情を上書き（03_assets 2-2 の「使用シーン」列そのまま） --
   * key = 台本の台詞（`**` を除いた正規化テキストの部分一致）。scene を指定すると
   * そのシーンだけに効く。上から順に見て最初に当たったものを採用する。 */
  faceOverride: [
    // 魔王
    { who: 'maou', scene: 'S1',  key: '……は？',                     face: 'a' },
    { who: 'maou', scene: 'S3',  key: 'なぜ疑問形だ',                 face: 'c' },
    { who: 'maou', scene: 'S4',  key: '……この数字の丸め方',          face: 'b' },
    { who: 'maou', scene: 'S4',  key: '実数を書かず',                 face: 'b' },
    { who: 'maou', scene: 'S4',  key: 'どこかで、見たことがある',      face: 'b' },
    { who: 'maou', scene: 'S5',  key: 'ならん',                       face: 'c' },
    { who: 'maou', scene: 'S5',  key: '……この領収書の貼り方',        face: 'b' },
    { who: 'maou', scene: 'S5',  key: '斜め45度',                     face: 'b' },
    { who: 'maou', scene: 'S5',  key: '……間違いない',                face: 'b' },
    { who: 'maou', scene: 'S5',  key: '私はこの貼り方を、20年見てきた', face: 'b' },
    { who: 'maou', scene: 'S6',  key: '……今、なんと言った',          face: 'b' },
    { who: 'maou', scene: 'S9',  key: '不 備 を な く せ',            face: 'd' },
    { who: 'maou', scene: 'S9',  key: 'それでもまだ、待たされている',   face: 'd' },
    { who: 'maou', scene: 'S9',  key: '……まあ、精算が先だ',          face: 'a' },
    // ノルマン
    { who: 'norman', scene: 'S1', key: '精算お願いしまーす',           face: 'a' },
    { who: 'norman', scene: 'S2', key: '読んでないっす！',             face: 'a' },
    { who: 'norman', scene: 'S3', key: '空いてなかったんですよ！',     face: 'b' },
    { who: 'norman', scene: 'S3', key: '……芋？',                     face: 'b' },
    { who: 'norman', scene: 'S3', key: '……頼んじゃった',             face: 'd' },
    { who: 'norman', scene: 'S4', key: '情報収集です！',               face: 'b' },
    { who: 'norman', scene: 'S5', key: '……ありがとうございます',     face: 'd' },
    { who: 'norman', scene: 'S6', key: 'か——課長ォ！？',              face: 'c' },
    { who: 'norman', scene: 'S8', key: '寝てない！',                   face: 'b' },
    { who: 'norman', scene: 'S8', key: 'うわあああああああ',           face: 'c' },
    { who: 'norman', scene: 'S8', key: '……落ちてたので',             face: 'c' },
    { who: 'norman', scene: 'S9', key: '……はい',                     face: 'd' },
    { who: 'norman', scene: 'S9', key: '……はーい',                   face: 'd' },
    // ファルム
    { who: 'falm', scene: 'S5b', key: '審査の場で、申し上げます',      face: 'b' },
    { who: 'falm', scene: 'S6',  key: '外した結果が、通り3本です',     face: 'b' },
    { who: 'falm', scene: 'S8',  key: 'ドラゴンの中の人と名刺交換しました', face: 'b' },
    { who: 'falm', scene: 'S7',  key: '10年、現役で動いています',      face: 'c' },
    { who: 'falm', scene: 'S7',  key: '直せません。動いているので',    face: 'c' },
    { who: 'falm', scene: 'S9',  key: '前世で100枚書いた',             face: 'c' },
    // カンバン
    { who: 'kanban', scene: 'S3', key: '11室空いていました',           face: 'b' },
    { who: 'kanban', scene: 'S3', key: '記録は、残るので',             face: 'b' },
    { who: 'kanban', scene: 'S3', key: '（メモ）来月から標準室、と',   face: 'a' },
    { who: 'kanban', scene: 'S4', key: '消費されたのは12本です',       face: 'b' },
    { who: 'kanban', scene: 'S5b', key: '上司によく渡していました',    face: 'c' },
    { who: 'kanban', scene: 'S7', key: '……全会一致で、承認します',   face: 'c' },
    { who: 'kanban', scene: 'S7.5', key: '8分6厘です',                 face: 'b' },
    { who: 'kanban', scene: 'S8', key: '酒類：68%。食事：22%。治療費：0%', face: 'b' },
    // タクト
    { who: 'tact', scene: 'S2',  key: '呼ばれたら、全部話すぞ',        face: 'a' },
    { who: 'tact', scene: 'S3b', key: '燃費で溶岩やめた魔王城',        face: 'a' },
    { who: 'tact', scene: 'S5',  key: 'そういう会社が、あったんだな',  face: 'c' },
    { who: 'tact', scene: 'S5b', key: '業務の傷は、会社が払う',        face: 'c' },
    { who: 'tact', scene: 'S7',  key: 'お前、田中かよ！',              face: 'b' },
    { who: 'tact', scene: 'S7',  key: '30台、手で組んだ',              face: 'b' },
    { who: 'tact', scene: 'S7.5', key: 'サビは、ちょっといいぞ',       face: 'a' },
    { who: 'tact', scene: 'S8',  key: '俺が払った領収書だろうが！！',  face: 'b' },
  ],

  /* ---- ④ 大ゴマ 13枚（03_assets 13章の突合表と1対1） ------------------- */
  koma: {
    '#1':   { file: 'koma_01_tenraku',        mono: false },
    '#2-1': { file: 'koma_02_1_suite',        mono: true },
    '#2-2': { file: 'koma_02_2_sakaba',       mono: true },
    '#2-3': { file: 'koma_02_3_kohan',        mono: true },
    '#2-4': { file: 'koma_02_4_odori',        mono: true },
    '#2-5': { file: 'koma_02_5_enkai',        mono: true },
    '#3-1': { file: 'koma_03_1_sashimodoshi', mono: false },
    '#3-2': { file: 'koma_03_2_sashimodoshi', mono: false },
    '#3-3': { file: 'koma_03_3_sashimodoshi', mono: false, quiet: true },  // ★静の1枚：集中線も書き文字も使わない
    '#3-4': { file: 'koma_03_4_sashimodoshi', mono: false },
    '#3-5': { file: 'koma_03_5_settai',       mono: false, big: true },    // ★本作最大のコマ
    '#4':   { file: 'koma_04_shotaibare',     mono: false },
    '#5':   { file: 'koma_05_epilogue',       mono: false, split: true },  // 1枚2コマ（上／下）
  },

  /* ---- ⑤ sfx タグ → SE（03_assets 7-2） -------------------------------- */
  sfx: {
    'ドンッ':   'se_slam_01',
    'バン':     'se_stamp_reject_01',
    'バンッ':   'se_stamp_reject_01',
    'トン':     'se_stamp_ok_01',
    'トントン': 'se_tap_align_01',
    'ドサァ':   'se_papers_drop_01',
    'カチャ':   'se_glasses_01',
    'ゴク……': 'se_gulp_01',
    'ドオン':   'se_boom_01',
  },

  /* ---- ⑥ RPG層：当たり判定・NPC配置（04_spec 9-2 / 9-3・実測値） ------- */
  /* ★つる指摘【9】：魔王の左移動がムーンウォーク、右移動が振り向きになっていた。
     engine のコマ割り（down0,up2,left4,right6）は 03_assets 3-2 の仕様どおりだったが、
     **シート画像の中身が仕様と違った**——実測（肌の重心）で
       index4=右向き / index5=右向き / index6=右向き / index7=左向き。
     つまり左向きのコマが1枚しかない。左に4,5（両方右向き）＝ムーンウォーク、
     右に6,7（右向き＋左向き）＝振り向き、という症状に完全に一致する。
     → **原本は書き換えず、右向きの2枚を左右反転して左向きに使う**（2Dの定石・新規素材ゼロ）。
     素材の割り当てはここに集約する規約なので、コマ割りもこの表に置く。 */
  dotSprite: {
    maou:   { down: [0, 1], up: [2, 3], right: [4, 5], left: 'mirror:right' },
    norman: { left: [0, 1], right: [2, 3] },
    tact:   { left: [0, 1], right: [2, 3] },
    kanban: { left: [0, 1], right: [2, 3] },
    falm:   { left: [0, 1], right: [2, 3] },
  },

  map: {
    file: 'map_castle_01', w: 480, h: 320, zoom: 3,
    field: { x0: 66, y0: 98, x1: 414, y1: 256 },
    blocks: [
      { id: 'throne', x: 186, y: 0,   w: 90,  h: 112 },
      { id: 'desk',   x: 128, y: 128, w: 224, h: 66 },
      { id: 'box_l',  x: 132, y: 190, w: 52,  h: 44 },
      { id: 'box_c',  x: 202, y: 190, w: 72,  h: 44 },
      { id: 'box_r',  x: 288, y: 190, w: 54,  h: 44 },
    ],
    // 机は「奥（上側）が魔王の席」。上通路から調べる
    desk: { x: 132, y: 100, w: 216, h: 28, facing: 'down' },
    // 開始位置＝下通路の中央（大扉の前）。机まで行くには机を回り込む必要がある＝歩く意味が出る
    start: { x: 240, y: 246, dir: 'up' },
    npc: {
      kanban: { x: 96,  y: 168, min: 72,  max: 122 },
      falm:   { x: 384, y: 168, min: 358, max: 408 },
      tact:   { x: 120, y: 246, min: 78,  max: 162 },
      norman: { x: 336, y: 246, min: 300, max: 392 },
    },
  },

  /* ---- ⑥b RPG層のカットシーン配置（04_spec 9-3・歩けない場面） ----------
   * S1（転落の瞬間）と S9（始末書）は「RPG層だが歩行しない」。歩かせない代わりに
   * ドットキャラを固定配置して**マップを描く**。ここが無いと画面が真っ黒になる（QA-001）。 */
  cutscene: {
    'S1': {
      maou:   { x: 240, y: 124, dir: 'down' },
      norman: { x: 240, y: 248, dir: 'up' },
    },
    'S9': {
      maou:   { x: 240, y: 124, dir: 'down' },
      norman: { x: 238, y: 248, dir: 'up' },
      tact:   { x: 150, y: 246, dir: 'right' },
      kanban: { x: 322, y: 246, dir: 'left' },
      falm:   { x: 386, y: 170, dir: 'left' },
    },
  },

  /* ---- ⑦ 幕間シーンの構成（04_spec 6-3） ------------------------------- */
  interlude: {
    'S3b': { npcs: ['kanban', 'tact', 'falm', 'norman'], require: 'desk', next: 'S4',
             flagOnEnter: { kanban: 'hint_kanban' } },
    'S5b': { npcs: ['tact', 'falm', 'kanban', 'norman'], require: 'desk', next: 'S6',
             flagOnEnter: { falm: 'hint_falm' } },
    'S7':  { npcs: ['tact', 'kanban', 'falm'],           require: 'all3', next: 'S7.5',
             autoBlock: '3人全員と話した後（自動発生）' },
  },
  /* 話しかけたときに再生するブロック（mark.label の前方一致） */
  npcBlockLabel: {
    kanban: '僧侶カンバンに話しかけた場合',
    tact:   '戦士タクトに話しかけた場合',
    falm:   '賢者ファルムに話しかけた場合',
    norman: '勇者ノルマンに話しかけた場合',
  },

  /* ---- ⑧ S0 一枚絵の縦書き吹き出しアンカー（03_assets 15-1 実測） ------ */
  balloonAnchor: {
    'still_village_01': { falm: [21, 38], kanban: [37, 46], norman: [58, 43], tact: [78, 31] },
    'still_throne_01':  { maou: [50, 20] },
    // つる指摘【25】（2026-08-27 実機）「吹き出しのしっぽもっと上から出して、
    //   門の上から魔王が話しているのがよくわかるように／ノルマンに吹き出しかぶせないで」
    //   絵を実測したら **魔王の頭は y=4%（バルコニーの上）** なのに 26% を指していた。
    //   20%も下を向いていたので、しっぽが門の中ほどから出て「上にいる」感が消えていた。
    //   ノルマンも x=38%→実測41%・頭 y=56% とずれていて、吹き出しが被る一因だった。
    //   第3要素は「頭から足元までの高さ（絵に対する%）」。**省略すると画面の下端まで**を
    //   人物の占有とみなす（地面に立っている人の近似）。バルコニーの魔王はそれだと
    //   画面の8割を占有扱いになって吹き出しの置き場所が歪むので、実測の背丈16%を渡す。
    'still_gate_dusk_01': { norman: [41, 56], maou: [74, 4, 16] },
  },

  /* ---- ⑨ BGM 8曲の実測値（2026-08-22 つる納品・192kbps CBR 44.1kHz MP3） ----
   * 全曲「頭でフェードイン → 本編 → 末尾でフェードアウト」の作り。
   * loop=true のまま鳴らすと末尾で音が消えて頭から鳴り直す＝「仕切り直し」が毎周聞こえる
   * （bgm_shinsa_01 は本編20分以上で10周以上する）。→ audio.js が
   *   fadeStart で次の再生を loopStart から重ね、(dur - fadeStart) 秒でクロスフェードする。
   * climax = エネルギーが最大の2秒窓の頭。`[BGM:最高潮]` タグでここへ跳ぶ（03_assets 7-3）。
   */
  bgmTrack: {
    bgm_opening_01:  { dur: 76.3,  loopStart: 0.0, fadeStart: 74.7,  climax: 69.0 },
    bgm_throne_01:   { dur: 53.4,  loopStart: 0.9, fadeStart: 50.9,  climax: 47.0 },
    bgm_shinsa_01:   { dur: 113.4, loopStart: 3.7, fadeStart: 111.9, climax: 96.5 },
    bgm_shinmiri_01: { dur: 56.6,  loopStart: 0.2, fadeStart: 54.5,  climax: 35.5 },
    bgm_field_01:    { dur: 64.3,  loopStart: 0.0, fadeStart: 61.8,  climax: 59.0 },
    bgm_rush_01:     { dur: 82.3,  loopStart: 0.0, fadeStart: 79.9,  climax: 77.2 },
    bgm_boss_01:     { dur: 118.9, loopStart: 7.0, fadeStart: 110.8, climax: 63.8 },
    bgm_tohoho_01:   { dur: 49.6,  loopStart: 0.0, fadeStart: 46.3,  climax: 39.2 },
  },
  /* S9の不備ループで再生速度を上げるとき、ピッチを保つか（true=テンポだけ速くなる）。
   * false にするとテープ早回しでピッチも上がる。?pitch=1 で切り替えて聴き比べできる。 */
  bgmPreservePitch: true,

  /* ---- ⑨c 大ゴマの最低表示時間（音を切らずに「画を持たせる」） -------------
   *
   * 【規約】**「ここぞ」のSE（つる提供5点）を伴う大ゴマは、SE尺 ＋ 余裕400ms を
   *          最低表示時間として保証する。**
   *
   * 理由：SEの余韻が鳴り終わる前に絵が次へ行くと、音が宙に浮いて演出が濁る。
   *       **音を短く切るのではなく、絵のほうを持たせる**（つるが余韻の長さを選んでいるため）。
   * ここに書く ms は「**下限**」。実際の表示はこれ＋文字送り＋プレイヤーの読む時間になる。
   * 素材を差し替えたら**実尺を測り直して ms を更新する**こと（smoke-test 21章が検算する）。
   *
   *   se_slam_01  0.56s → 960ms   （差し戻し成立の4枚 ＋ #3-5）
   *   se_hit_01   1.00s → 1400ms  （#3-5・BGMを切って単独で鳴る）
   *   se_boom_01  1.10s → 1500ms  （#5下コマ・本作で唯一の激昂）
   */
  AFTERGLOW_MARGIN: 400,
  afterglowKoma: {
    '#3-1': { ms: 960,  se: 'se_slam_01', why: '「差し戻し！」成立。se_slam_01(0.56s)が鳴り切る前に絵が消えないように' },
    '#3-2': { ms: 960,  se: 'se_slam_01', why: '「差し戻し！」成立。4枚を同じ扱いにする——1枚だけ短いと決め台詞の重みが揃わない' },
    '#3-3': { ms: 960,  se: 'se_slam_01', why: '「差し戻し！」成立。#3-3は「静の1枚」で集中線と書き文字は出さないが、**表示時間は揃える**（絵の作りの話と、音が鳴り切るかは別）' },
    '#3-4': { ms: 960,  se: 'se_slam_01', why: '「差し戻し！」成立。se_slam_01(0.56s)が鳴り切る前に絵が消えないように' },
    '#3-5': { ms: 1400, se: 'se_hit_01',  why: '本作最大のコマ。se_hit_01(1.00s)がBGMを切って単独で鳴る。同じ行の se_slam_01(0.56s)より長いほうに合わせる' },
    '#5':   { ms: 1500, se: 'se_boom_01', why: '本作で唯一の激昂。se_boom_01(1.10s)の直後に夕暮れの脱力パートが来るので、余韻が次のBGMに被ると落差が濁る' },
    /* ★つる指示（2026-09-01 実機）。ここまでの6枚は「**SEが鳴り切る前に絵を消さない**」ための表だったが、
       #2-3 は理由が違う——**直後に台詞が1行も無い唯一の大ゴマ**で、絵を出した次のノードが層切替のため
       一瞬で消えていた（S8で実測したクリック相当の露出：#2-3=2 に対し #2-5=8／#3-3=21／#3-5=35）。
       つるが「表示されなかった」と報告した実物。台本は触らず、ここで最低表示時間だけ与える。 */
    '#2-3': { ms: 1200,               why: '直後に台詞が無い唯一の大ゴマ。回想のモノクロ1枚を読むには最低これだけ要る（尺への影響は1回・1.2秒）' },
  },

  /* ---- ⑩ 自動セーブの復帰点（台本7章 v2.0・11点） ---------------------- */
  savePoints: ['S2', 'S3', 'S3b', 'S4', 'S5', 'S5b', 'S6', 'S7', 'S7.5', 'S8', 'S9'],
};
