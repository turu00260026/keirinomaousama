/* vouchers.js — 伝票データ（04_spec.md 8章の表そのまま）
 * 手書き。台詞は一切ここに書かない（台詞の正は 02_scenario.md → scenes.js）。
 * ここにあるのは「判定に必要なデータ」だけ。
 */
/* 「有効な証人」は **台本の `▼呼び出し：〜の証言` ディレクティブが正**（裁定Q）。
   ここに witness[] を持つと二重定義になるので置かない。資料としての一覧は 04_spec 8-1。 */
window.VOUCHERS = [
  {
    id: 'V1', scene: 'S3', index: 1,
    title: '宿泊費（ハーメルンの宿）',
    lines: [{ label: '宿泊費　ハーメルンの宿　一泊', amount: 8000 },
            { label: '室内飲食代', amount: 3200 }],
    correct: 'reject',
    evidence: [
      { id: 'E1a', label: 'カンバンの証言：当日の空室記録（標準室 11室空き）', correct: true },
      { id: 'E1b', label: 'タクトの証言：隣室でうるさかった', wrongKind: 'witness' },
      { id: 'E1c', label: '討伐日報（メルドの村・オーク討伐）', wrongKind: 'evidence' },
      { id: 'E1d', label: 'ファルムの詠唱仕様書', wrongKind: 'evidence' },
    ],
  },
  {
    id: 'V2', scene: 'S4', index: 2,
    title: '回復薬の補充費　90本',
    lines: [{ label: '回復薬　補充費　90本', amount: null },
            { label: '添付：金の孔雀亭　ご指名料／同伴料／場内指名', amount: null }],
    correct: 'reject',
    evidence: [
      { id: 'E2a', label: 'カンバンの証言：在庫記録（消費されたのは 12本）', correct: true },
      { id: 'E2b', label: 'タクトの証言：討伐は30分で終わった', wrongKind: 'witness' },
      { id: 'E2c', label: 'ハーメルンの宿の空室記録', wrongKind: 'evidence' },
      { id: 'E2d', label: '旅の報告書', wrongKind: 'evidence' },
    ],
  },
  {
    id: 'V3', scene: 'S5', index: 3,
    title: '討伐に伴う損害弁償',
    lines: [{ label: 'メルドの村　水車小屋　弁償金', amount: 46000 },
            { label: 'メルドの村　看板　修理費', amount: 9000 }],
    correct: 'approve',            // ★本作の心臓。通すべきものを通す伝票
    evidence: [],
  },
  {
    id: 'V4', scene: 'S6', index: 4,
    title: '聖剣強化費',
    lines: [{ label: '聖剣　強化費', amount: null },
            { label: '添付：ハーメルン中央通り　建物3棟　修繕費', amount: 820000 }],
    correct: 'reject',
    evidence: [
      { id: 'E4a', label: 'ファルムの証言：申請外の仕様変更・敵は不在', correct: true },
      { id: 'E4b', label: 'カンバンの在庫記録', wrongKind: 'evidence' },
      { id: 'E4c', label: '討伐日報（メルドの村・オーク討伐）', wrongKind: 'evidence' },
      { id: 'E4d', label: 'タクトの証言：討伐は30分で終わった', wrongKind: 'witness' },
    ],
  },
  {
    id: 'V5', scene: 'S8', index: 5,
    title: 'ドラゴン討伐費（諸経費）',
    lines: [{ label: 'ドラゴン討伐費', amount: 1200000 },
            { label: '内訳：宴会コンパニオン　手配料', amount: 60000 },
            { label: '内訳：祝勝花火　特大30発', amount: 90000 },
            { label: '内訳：馬車修理代', amount: 180000 },
            { label: '内訳：宿の壁　修繕費', amount: 50000 }],
    correct: 'reject',
    evidence: [
      { id: 'E5a', label: 'カンバンの支出記録（酒類68% 食事22% 治療費0%）＋タクトの証言（討伐30分）', correct: true },
      { id: 'E5b', label: 'ファルムの証言：ドラゴンの中の人と名刺交換', wrongKind: 'witness' },
      { id: 'E5c', label: '旅の報告書', wrongKind: 'evidence' },
      { id: 'E5d', label: 'ハーメルンの宿の空室記録', wrongKind: 'evidence' },
    ],
  },
];

/* 速射審査ラッシュ S7.5（胃ゲージ対象外）
 * item と誤判定ツッコミは scenes.js（台本から自動抽出）が持つ。ここは正解と音だけ。 */
window.RUSH = [
  { n: 1, correct: 'reject' },
  { n: 2, correct: 'approve' },   // ★承認が正解
  { n: 3, correct: 'reject' },
  { n: 4, correct: 'reject' },
  { n: 5, correct: 'approve' },   // ★承認が正解
  { n: 6, correct: 'reject' },
  { n: 7, correct: 'reject' },
];
