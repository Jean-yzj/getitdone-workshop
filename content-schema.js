// 全部可編輯文案的 schema（單一資料來源）
// 每筆: key, label, kind, default, optional hint
// kind: text | textarea | richtext | bool
//   text/textarea  : 純文字（HTML 自動轉義）
//   richtext       : 允許 HTML（模板會用 {{{key}}} 不轉義）
//   bool           : 顯示開關，default='1' 顯示，''=隱藏（模板用 {{#if key}}...{{/if}} 包裹）

export const CONTENT_SCHEMA = [
  // ───── Hero ─────
  { section: 'Hero 主視覺', key: 'hero_tag', label: '上方標籤', kind: 'text',
    default: 'GET IT DONE WORKSHOP · 限額 20-30 人' },
  { section: 'Hero 主視覺', key: 'hero_title_line1', label: '主標第 1 行', kind: 'text',
    default: '今天一定要' },
  { section: 'Hero 主視覺', key: 'hero_title_line2', label: '主標第 2 行（粗描邊）', kind: 'text',
    default: '把事情解決' },
  { section: 'Hero 主視覺', key: 'hero_subtitle', label: '副標', kind: 'richtext',
    hint: '可用 <br> 換行', default: '把 5 小時花在那件你拖了很久的事上。<br>不是社交、不是學習，是真的坐下來，把它做完。' },
  { section: 'Hero 主視覺', key: 'hero_btn_primary', label: '主按鈕文字', kind: 'text',
    default: '誠實報名 →' },
  { section: 'Hero 主視覺', key: 'hero_btn_ghost', label: '次要按鈕文字', kind: 'text',
    default: '先看看活動' },
  { section: 'Hero 主視覺', key: 'hero_card_title', label: '右側卡片標題', kind: 'text',
    default: '陪你一起，把事情解決' },
  { section: 'Hero 主視覺', key: 'hero_card_sub', label: '右側卡片副標', kind: 'text',
    default: '誠實寫下、專注 5 小時、彼此歡呼' },
  { section: 'Hero 主視覺', key: 'hero_stat1_num', label: '數字 1', kind: 'text', default: '5' },
  { section: 'Hero 主視覺', key: 'hero_stat1_label', label: '數字 1 標籤', kind: 'text', default: 'HOURS' },
  { section: 'Hero 主視覺', key: 'hero_stat2_num', label: '數字 2', kind: 'text', default: '1' },
  { section: 'Hero 主視覺', key: 'hero_stat2_label', label: '數字 2 標籤', kind: 'text', default: 'THING' },
  { section: 'Hero 主視覺', key: 'hero_stat3_num', label: '數字 3', kind: 'text', default: '20+' },
  { section: 'Hero 主視覺', key: 'hero_stat3_label', label: '數字 3 標籤', kind: 'text', default: 'PEOPLE' },

  // ───── Why ─────
  { section: '為什麼辦這場', key: 'why_eyebrow', label: '小標', kind: 'text', default: '為什麼辦這場' },
  { section: '為什麼辦這場', key: 'why_title', label: '主標', kind: 'text', default: '人類拖延的真相' },
  { section: '為什麼辦這場', key: 'why_sub', label: '副標', kind: 'text', default: '不是因為事情太難，是因為一直沒人陪我們開始。' },
  { section: '為什麼辦這場', key: 'why_card_1_visible', label: '顯示引言 1', kind: 'bool', default: '1' },
  { section: '為什麼辦這場', key: 'why_card_1', label: '引言 1', kind: 'richtext',
    hint: '可用 <strong>...</strong> 加粗', default: '一封想傳很久的訊息，<strong>打開又關掉了 20 次</strong>。' },
  { section: '為什麼辦這場', key: 'why_card_2_visible', label: '顯示引言 2', kind: 'bool', default: '1' },
  { section: '為什麼辦這場', key: 'why_card_2', label: '引言 2', kind: 'richtext',
    default: '一份寫到一半的履歷，<strong>停在某個段落整整三個月</strong>。' },
  { section: '為什麼辦這場', key: 'why_card_3_visible', label: '顯示引言 3', kind: 'bool', default: '1' },
  { section: '為什麼辦這場', key: 'why_card_3', label: '引言 3', kind: 'richtext',
    default: '一本買了的書，<strong>書封都還沒拆</strong>。' },
  { section: '為什麼辦這場', key: 'why_card_4_visible', label: '顯示引言 4', kind: 'bool', default: '1' },
  { section: '為什麼辦這場', key: 'why_card_4', label: '引言 4', kind: 'richtext',
    default: '一句想說的話，<strong>憋在心裡半年沒說出口</strong>。' },
  { section: '為什麼辦這場', key: 'belief_eyebrow', label: '信念區小標', kind: 'text', default: 'CORE BELIEF' },
  { section: '為什麼辦這場', key: 'belief_title', label: '信念主標', kind: 'richtext',
    hint: '可用 <br> 換行', default: '我們腦袋會浮現的事，<br>本身都在我們的能力範圍內。' },
  { section: '為什麼辦這場', key: 'belief_sub', label: '信念副標', kind: 'richtext',
    default: '沒有人會突然想到要去造火箭。<br>我們缺的，只是那一瞬間的勇氣。' },

  // ───── Schedule ─────
  { section: '活動流程', key: 'schedule_eyebrow', label: '小標', kind: 'text', default: 'SCHEDULE' },
  { section: '活動流程', key: 'schedule_title', label: '主標', kind: 'text', default: '五小時，怎麼走完' },
  { section: '活動流程', key: 'schedule_sub', label: '副標', kind: 'text', default: '節奏被設計過，讓你不會卡關太久，也不會無聊。' },
  // 8 rows
  ...[1,2,3,4,5,6,7,8].flatMap((i) => {
    const defaults = [
      { time: '13:00', item: '報到 + 寫任務卡', desc: '入場領卡，誠實寫下今天要完成的事', dur: '20 min' },
      { time: '13:20', item: '開場 + 自我介紹', desc: '主持人破題，每人 30 秒念出自己的任務', dur: '20 min' },
      { time: '13:40', item: '第一段衝刺', desc: '全員專注做事，現場安靜，可戴耳機', dur: '70 min' },
      { time: '14:50', item: '能量補給 + 卡關互助', desc: '茶水、伸展、卡關的人可以舉手聊聊', dur: '30 min' },
      { time: '15:20', item: '第二段衝刺', desc: '最後一程，60 / 75 / 85 分提醒時間', dur: '90 min' },
      { time: '16:50', item: '完成度分享', desc: '一人 1 分鐘，分享你寫了什麼、做到幾成', dur: '40 min' },
      { time: '17:30', item: '集體歡呼 + 合照', desc: '無論完成度，每個人都被全員歡呼一次', dur: '20 min' },
      { time: '17:50', item: '下一步約定 / 散場', desc: '寫下未完成的下一步，自願交換聯絡', dur: '10 min' },
    ][i - 1];
    return [
      { section: '活動流程', key: `sched_${i}_visible`, label: `顯示第 ${i} 段`, kind: 'bool', default: '1' },
      { section: '活動流程', key: `sched_${i}_time`, label: `第 ${i} 段 · 時間`, kind: 'text', default: defaults.time },
      { section: '活動流程', key: `sched_${i}_item`, label: `第 ${i} 段 · 項目`, kind: 'text', default: defaults.item },
      { section: '活動流程', key: `sched_${i}_desc`, label: `第 ${i} 段 · 說明`, kind: 'text', default: defaults.desc },
      { section: '活動流程', key: `sched_${i}_dur`, label: `第 ${i} 段 · 長度`, kind: 'text', default: defaults.dur },
    ];
  }),

  // ───── Rules ─────
  { section: '七條規則', key: 'rules_eyebrow', label: '小標', kind: 'text', default: 'GROUND RULES' },
  { section: '七條規則', key: 'rules_title', label: '主標', kind: 'text', default: '七條規則' },
  { section: '七條規則', key: 'rules_sub', label: '副標', kind: 'text', default: '為了讓每個人都能真的把事情做完，我們約好這幾件事。' },
  ...[1,2,3,4,5,6,7].flatMap((i) => {
    const defaults = [
      { t: '任務必須具體', b: '不是「我要變更好」，而是「投 3 家履歷」。' },
      { t: '5 小時只做這件事', b: '不開無關分頁，不做別的工作。' },
      { t: '手機只能為任務用', b: '要打電話、查資料、傳訊息都可以。' },
      { t: '卡關不要硬撐', b: '舉手找人聊 5 分鐘，比卡 30 分鐘有效。' },
      { t: '完成度不是目的', b: '誠實開始，本身就是最大的勝利。' },
      { t: '不評論別人的任務', b: '別人的小事可能比你的大事更難。' },
      { t: '遲到不補時間', b: '尊重所有準時到場的人。' },
    ][i - 1];
    return [
      { section: '七條規則', key: `rule_${i}_visible`, label: `顯示規則 ${i}`, kind: 'bool', default: '1' },
      { section: '七條規則', key: `rule_${i}_title`, label: `規則 ${i} · 標題`, kind: 'text', default: defaults.t },
      { section: '七條規則', key: `rule_${i}_body`, label: `規則 ${i} · 說明`, kind: 'text', default: defaults.b },
    ];
  }),

  // ───── Sign-up section ─────
  { section: '報名區塊文案', key: 'signup_eyebrow', label: '小標', kind: 'text', default: 'REGISTER' },
  { section: '報名區塊文案', key: 'signup_title', label: '主標', kind: 'text', default: '誠實地，報名一次' },
  { section: '報名區塊文案', key: 'signup_sub', label: '副標', kind: 'text', default: '填寫約 3-5 分鐘。我們會在 3-5 個工作天內審核並寄出確認信。' },
  { section: '報名區塊文案', key: 'form_card_title', label: '表單卡片大標', kind: 'text', default: '那件你拖了很久的事，是什麼？' },
  { section: '報名區塊文案', key: 'form_card_sub', label: '表單卡片副標', kind: 'text', default: '寫下來，我們陪你把它做完。' },

  // Form labels / helpers
  { section: '表單欄位文字', key: 'form_q1_label', label: '欄位 · 稱呼', kind: 'text', default: '怎麼稱呼你？' },
  { section: '表單欄位文字', key: 'form_q1_ph', label: '欄位 · 稱呼 placeholder', kind: 'text', default: '本名、暱稱、想被叫的名字都行' },
  { section: '表單欄位文字', key: 'form_q2_label', label: '欄位 · Email', kind: 'text', default: '你的 Email' },
  { section: '表單欄位文字', key: 'form_q2_help', label: '欄位 · Email 說明', kind: 'text', default: '確認信、付款方式、場地細節會寄到這裡' },
  { section: '表單欄位文字', key: 'form_q3_label', label: '欄位 · 手機', kind: 'text', default: '手機號碼' },
  { section: '表單欄位文字', key: 'form_q3_help', label: '欄位 · 手機說明', kind: 'text', default: '選填。活動當天若有突發狀況會聯絡你' },
  { section: '表單欄位文字', key: 'form_q4_label', label: '欄位 · 任務', kind: 'text', default: '那件你想完成的事是什麼？' },
  { section: '表單欄位文字', key: 'form_q4_help', label: '欄位 · 任務說明', kind: 'text', default: '具體越好。不必宏大，但必須是「真的拖了很久」。' },
  { section: '表單欄位文字', key: 'form_q4_examples', label: '欄位 · 任務範例（可改）', kind: 'richtext',
    hint: '可改範例條目，每行用 <br> 分隔', default: `<span class="ok">✓</span> 把履歷寫完然後投出 3 家<br>
            <span class="ok">✓</span> 把 LINE 上那封想了三個月沒傳的訊息傳出去<br>
            <span class="ok">✓</span> 整理電腦桌面、把不要的檔案刪掉<br>
            <span class="ng">✘</span> 我想變成更好的人（太抽象）<br>
            <span class="ng">✘</span> 創業（5 小時不夠）` },
  { section: '表單欄位文字', key: 'form_q4_ph', label: '欄位 · 任務 placeholder', kind: 'text', default: '誠實寫下那件事⋯⋯' },
  { section: '表單欄位文字', key: 'form_q5_label', label: '欄位 · 拖了多久', kind: 'text', default: '這件事拖了多久？' },
  { section: '表單欄位文字', key: 'form_q6_label', label: '欄位 · 為什麼沒做', kind: 'text', default: '為什麼一直沒做？' },
  { section: '表單欄位文字', key: 'form_q7_label', label: '欄位 · 環境需求', kind: 'text', default: '需要什麼樣的環境？' },
  { section: '表單欄位文字', key: 'form_q8_label', label: '欄位 · 協助需求', kind: 'text', default: '需要哪種協助？' },
  { section: '表單欄位文字', key: 'pledge_label', label: '請確認你願意：（標題）', kind: 'text', default: '請確認你願意：' },
  { section: '表單欄位文字', key: 'pledge_1', label: '承諾 1', kind: 'text', default: '我願意全程參加 5 小時，不會中途離開' },
  { section: '表單欄位文字', key: 'pledge_2', label: '承諾 2', kind: 'text', default: '我願意把手機只用在跟任務有關的事' },
  { section: '表單欄位文字', key: 'pledge_3', label: '承諾 3', kind: 'text', default: '我願意在卡關時舉手求助，不獨自硬撐' },
  { section: '表單欄位文字', key: 'pledge_4', label: '承諾 4', kind: 'text', default: '我願意尊重其他人的任務，不評論不打擾' },
  { section: '表單欄位文字', key: 'form_q9_label', label: '欄位 · 來源', kind: 'text', default: '從哪裡知道這場活動？' },
  { section: '表單欄位文字', key: 'form_q10_label', label: '欄位 · 補充', kind: 'text', default: '還有什麼想讓我們知道的嗎？' },
  { section: '表單欄位文字', key: 'form_q10_help', label: '欄位 · 補充說明', kind: 'text', default: '選填。特殊飲食、無障礙需求、會緊張的地方都可以說' },
  { section: '表單欄位文字', key: 'form_submit_legal', label: '送出旁說明', kind: 'text', default: '送出後 3-5 個工作天內會收到審核確認信' },
  { section: '表單欄位文字', key: 'form_submit_btn', label: '送出按鈕', kind: 'text', default: '誠實送出 →' },

  // ───── FAQ ─────
  { section: '常見問題', key: 'faq_eyebrow', label: '小標', kind: 'text', default: 'FAQ' },
  { section: '常見問題', key: 'faq_title', label: '主標', kind: 'text', default: '常見問題' },
  ...[1,2,3,4,5,6].flatMap((i) => {
    const defaults = [
      { q: '我寫的任務真的太小，這樣好嗎？', a: '完全沒問題。「傳一封訊息」、「整理桌面」、「打那通電話」都是好任務。被你拖了很久的事，本身就值得 5 個小時。' },
      { q: '如果我做不到 100%，會不會很丟臉？', a: '不會。完成度不是這場活動的目的。誠實面對、真的開始，才是。我們會為每個人歡呼，無論完成度。' },
      { q: '5 小時都不能做別的工作嗎？', a: '對。這 5 小時是為了你寫下的那件事。如果你的任務需要工作上的事，請在報名時就寫清楚。' },
      { q: '會有人來教我怎麼做嗎？', a: '不會。這不是課程，是工作坊。主持人會引導節奏、提醒時間、處理卡關，但不會教你做你的事——那件事本來就是你會的。' },
      { q: '能不能退費？', a: '活動前 5 天內可全額退費。5 天內因報名費已用於採購物資與場地保留，恕不退費，但可轉讓給朋友。' },
      { q: '會錄影或拍照公開嗎？', a: '只有合照會徵詢全員同意後拍攝，不會錄製過程。任務內容你不主動分享，我們也不會問。' },
    ][i - 1];
    return [
      { section: '常見問題', key: `faq_${i}_visible`, label: `顯示 FAQ ${i}`, kind: 'bool', default: '1' },
      { section: '常見問題', key: `faq_${i}_q`, label: `Q ${i}`, kind: 'text', default: defaults.q },
      { section: '常見問題', key: `faq_${i}_a`, label: `A ${i}`, kind: 'textarea', default: defaults.a },
    ];
  }),

  // ───── Footer ─────
  { section: '頁尾', key: 'footer_h4', label: '名稱', kind: 'text', default: '今天一定要把事情解決工作坊' },
  { section: '頁尾', key: 'footer_tagline_en', label: '英文標語', kind: 'text', default: 'Get It Done · 5 hours · 1 thing · together' },
  { section: '頁尾', key: 'footer_quote', label: '尾句金句', kind: 'text', default: '「事情本身不難，我們缺的，只是那一瞬間的勇氣。」' },
  { section: '頁尾', key: 'footer_email_label', label: '聯絡前綴', kind: 'text', default: '📩 聯絡：' },
  { section: '頁尾', key: 'footer_email', label: '聯絡 Email', kind: 'text', default: 'hello@getitdone.tw' },
  { section: '頁尾', key: 'footer_legal', label: '版權', kind: 'text', default: '© 2026 Get It Done Workshop · Made with quiet courage' },

  // ───── Success page ─────
  { section: '成功頁', key: 'success_title_1', label: '主標 1', kind: 'text', default: '謝謝你' },
  { section: '成功頁', key: 'success_title_2', label: '主標 2（強調）', kind: 'text', default: '誠實地填完。' },
  { section: '成功頁', key: 'success_body', label: '說明文', kind: 'richtext', hint: '可用 <br> 換行',
    default: '我們會在 3-5 個工作天內審核並寄出確認信。<br>記得查收（也記得看垃圾信件夾）。' },
  { section: '成功頁', key: 'success_quote', label: '尾句金句', kind: 'richtext',
    default: '「我們缺的，<br>只是那一瞬間的勇氣。」' },
  { section: '成功頁', key: 'success_back', label: '回首頁連結', kind: 'text', default: '← 回到首頁' },

  // ───── Meta / SEO ─────
  { section: 'SEO / 分享預覽', key: 'meta_title', label: '瀏覽器標題', kind: 'text', default: '今天一定要把事情解決工作坊 ｜ Get It Done' },
  { section: 'SEO / 分享預覽', key: 'meta_description', label: 'meta description', kind: 'textarea',
    default: '今天一定要把事情解決工作坊：用 5 小時，把那件你拖了很久的事完成。20-30 人 · 實體場地 · NT$300。' },
  { section: 'SEO / 分享預覽', key: 'og_title', label: 'OG title（社群分享）', kind: 'text', default: '今天一定要把事情解決工作坊' },
  { section: 'SEO / 分享預覽', key: 'og_description', label: 'OG description', kind: 'text', default: '用 5 小時，把那件你拖了很久的事完成。' },
];

export const CONTENT_DEFAULTS = Object.fromEntries(CONTENT_SCHEMA.map((f) => [f.key, f.default]));
