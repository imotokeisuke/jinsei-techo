import { firebaseConfig, COLLECTION_PREFIX } from './firebase-config.js';

/* ==========================================================
   人生手帳 app.js
   - state: メモリ上のアプリ状態（描画は常にこれを元に行う）
   - ローカルキャッシュ (localStorage) から即時描画 → 体感速度を担保
   - Firestore onSnapshot でリアルタイム同期し、機種変してもデータが残る
========================================================== */

const LS_KEY = 'jinseiTecho_cache_v1';

const state = {
  meta: {
    appTitle: '人生手帳',
    diaryCategories: ['気づき', '感謝', '仕事'],
    lifeCategories: { '仕事': ['働き方', 'キャリア'], '家族': [], '健康': [] }
  },
  diary: [],     // { id, date, title, body, categories:[], createdAt, updatedAt }
  notebook: []   // { id, majorCategory, minorCategory, title, history:[{date, content}], createdAt, updatedAt }
};

let currentTab = 'diary';
let diarySearch = '';
let diaryFilterCat = null;
let notebookSearch = '';
let notebookFilterMajor = null;
let notebookFilterMinor = null;
let mindmapSelectedMajor = null;
let calCursor = new Date();
let db = null;
let fsApi = null;

/* ---------------- ユーティリティ ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const todayStr = () => formatDate(new Date());
function formatDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(dateStr).getDay()];
  return `${y}年${parseInt(m)}月${parseInt(d)}日（${dow}）`;
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------------- ローカルキャッシュ ---------------- */
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* 容量オーバー等は無視 */ }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(state.meta, parsed.meta || {});
      state.diary = parsed.diary || [];
      state.notebook = parsed.notebook || [];
    }
  } catch (e) { /* 破損キャッシュは無視 */ }
}

/* ---------------- Firebase 初期化＆同期 ---------------- */
async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    toast('Firebase未設定：ローカル保存のみで動作中');
    return;
  }
  try {
    const [{ initializeApp }, firestoreMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    fsApi = firestoreMod;
    const app = initializeApp(firebaseConfig);
    db = fsApi.initializeFirestore(app, {
      localCache: fsApi.persistentLocalCache({ tabManager: fsApi.persistentSingleTabManager() })
    });

    const metaRef = fsApi.doc(db, COLLECTION_PREFIX + 'meta', 'config');
    fsApi.onSnapshot(metaRef, snap => {
      if (snap.exists()) {
        const d = snap.data();
        state.meta.appTitle = d.appTitle || state.meta.appTitle;
        state.meta.diaryCategories = d.diaryCategories || state.meta.diaryCategories;
        state.meta.lifeCategories = d.lifeCategories || state.meta.lifeCategories;
      } else {
        fsApi.setDoc(metaRef, state.meta).catch(() => {});
      }
      saveLocal();
      renderHeader();
      renderCurrentTab();
    });

    const diaryCol = fsApi.collection(db, COLLECTION_PREFIX + 'diary');
    fsApi.onSnapshot(diaryCol, snap => {
      state.diary = snap.docs.map(d => d.data());
      saveLocal();
      if (currentTab === 'diary') renderCurrentTab();
    });

    const notebookCol = fsApi.collection(db, COLLECTION_PREFIX + 'notebook');
    fsApi.onSnapshot(notebookCol, snap => {
      state.notebook = snap.docs.map(d => d.data());
      saveLocal();
      if (currentTab === 'notebook' || currentTab === 'mylife') renderCurrentTab();
    });
  } catch (e) {
    console.error(e);
    toast('オンライン同期に接続できません（オフラインで利用中）');
  }
}

async function fsSet(collName, docObj) {
  saveLocal();
  if (db && fsApi) {
    try {
      await fsApi.setDoc(fsApi.doc(db, COLLECTION_PREFIX + collName, docObj.id), docObj);
    } catch (e) { console.error(e); toast('同期エラー：オフラインで保存しました'); }
  }
}
async function fsDelete(collName, id) {
  saveLocal();
  if (db && fsApi) {
    try { await fsApi.deleteDoc(fsApi.doc(db, COLLECTION_PREFIX + collName, id)); }
    catch (e) { console.error(e); }
  }
}
async function fsSetMeta() {
  saveLocal();
  if (db && fsApi) {
    try { await fsApi.setDoc(fsApi.doc(db, COLLECTION_PREFIX + 'meta', 'config'), state.meta); }
    catch (e) { console.error(e); }
  }
}

/* ==========================================================
   タブ切り替え
========================================================== */
function switchTab(tab) {
  currentTab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
  $('#fab').style.display = tab === 'mylife' ? 'none' : 'flex';
  renderCurrentTab();
}
function renderCurrentTab() {
  if (currentTab === 'diary') renderDiaryTab();
  else if (currentTab === 'notebook') renderNotebookTab();
  else renderMyLifeTab();
}

/* ==========================================================
   ヘッダー（タイトル編集）
========================================================== */
function renderHeader() {
  $('#appTitleText').textContent = state.meta.appTitle;
  $('#appTitleInput').value = state.meta.appTitle;
}
function startEditTitle() {
  $('#appTitleText').style.display = 'none';
  $('#titleEditBtn').style.display = 'none';
  $('#appTitleInput').style.display = 'block';
  const inp = $('#appTitleInput');
  inp.focus(); inp.select();
}
function finishEditTitle() {
  const val = $('#appTitleInput').value.trim() || '人生手帳';
  state.meta.appTitle = val;
  $('#appTitleText').style.display = '';
  $('#titleEditBtn').style.display = '';
  $('#appTitleInput').style.display = 'none';
  renderHeader();
  fsSetMeta();
}

/* ==========================================================
   育つ木ウィジェット（日記のモチベーション施策）
========================================================== */
function getTreeStage(count) {
  if (count >= 60) return { stage: 5, label: 'オレンジが実る木', sub: `${count}件の記録。豊かに実った日々です`, next: null };
  if (count >= 30) return { stage: 4, label: '花咲く木', sub: `${count}件の記録。花が咲きはじめました`, next: 60 - count };
  if (count >= 15) return { stage: 3, label: '若木', sub: `${count}件の記録。枝葉が茂ってきました`, next: 30 - count };
  if (count >= 5) return { stage: 2, label: '芽吹き', sub: `${count}件の記録。葉が増えてきました`, next: 15 - count };
  if (count >= 1) return { stage: 1, label: 'ふたば', sub: `${count}件の記録。芽が出ました`, next: 5 - count };
  return { stage: 0, label: 'たね', sub: 'はじめての日記を書いてみましょう', next: 1 };
}
function treeSVG(stage) {
  const leaf = (x, y, r, rot) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.62}" fill="#8FBC8F" transform="rotate(${rot} ${x} ${y})"/>`;
  const flower = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="#FFD1E3"/>`;
  const fruit = (x, y) => `<circle cx="${x}" cy="${y}" r="4" fill="#FF9142"/>`;
  let trunk, crown = '';
  if (stage === 0) {
    return `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="86" rx="26" ry="6" fill="#FFE0C2"/><path d="M50 86 C 46 74, 46 66, 50 60" stroke="#C98A54" stroke-width="4" fill="none" stroke-linecap="round"/>${leaf(50, 58, 7, 0)}</svg>`;
  }
  const trunkH = 22 + stage * 6;
  trunk = `<path d="M50 88 C 47 ${88 - trunkH * 0.5}, 47 ${88 - trunkH * 0.8}, 50 ${88 - trunkH}" stroke="#C98A54" stroke-width="${5 + stage}" fill="none" stroke-linecap="round"/>`;
  const topY = 88 - trunkH;
  const leaves = [];
  const n = 4 + stage * 2;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const rad = 12 + stage * 2.4;
    leaves.push(leaf(50 + Math.cos(angle) * rad, topY + Math.sin(angle) * rad * 0.7, 8 + stage * 0.7, (angle * 180 / Math.PI)));
  }
  crown = leaves.join('');
  let deco = '';
  if (stage >= 4) {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.4;
      const rad = 12 + stage * 2.4;
      deco += flower(50 + Math.cos(angle) * rad, topY + Math.sin(angle) * rad * 0.7);
    }
  }
  if (stage >= 5) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.9;
      const rad = 10 + stage * 2.0;
      deco += fruit(50 + Math.cos(angle) * rad, topY + Math.sin(angle) * rad * 0.7 + 4);
    }
  }
  return `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="90" rx="28" ry="5" fill="#FFE0C2"/>${trunk}${crown}${deco}</svg>`;
}
function renderTreeWidget() {
  const info = getTreeStage(state.diary.length);
  $('#treeSvgWrap').innerHTML = treeSVG(info.stage);
  $('#treeStageLabel').textContent = info.label;
  $('#treeSubLabel').textContent = info.sub;
  $('#treeNextLabel').textContent = info.next ? `次の変化まであと ${info.next} 件` : '';
}

/* ---------------- 足あとカレンダー（葉っぱスタンプ） ---------------- */
function leafStampSVG() {
  return `<svg viewBox="0 0 24 24"><path d="M4 20 C 4 10, 10 4, 20 4 C 20 14, 14 20, 4 20 Z" fill="#FF9F5A"/><path d="M5 19 C 10 14, 14 10, 19 5" stroke="#E8703A" stroke-width="1.2" fill="none"/></svg>`;
}
function openCalendarModal() {
  calCursor = new Date();
  const tpl = document.getElementById('calendarTemplate');
  $('#modalArea').innerHTML = '';
  $('#modalArea').appendChild(tpl.content.cloneNode(true));
  renderCalendar();
  openModal();
  $('#calPrev').onclick = () => calMove(-1);
  $('#calNext').onclick = () => calMove(1);
  $('#calClose').onclick = closeModal;
}
function renderCalendar() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  $('#calTitle').textContent = `${y}年${m + 1}月`;
  const stampedDates = new Set(state.diary.map(e => e.date));
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = todayStr();
  let html = '';
  ['日', '月', '火', '水', '木', '金', '土'].forEach(d => html += `<div class="cal-dow">${d}</div>`);
  for (let i = 0; i < startDow; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDate(new Date(y, m, d));
    const stamped = stampedDates.has(dateStr);
    html += `<div class="cal-cell ${stamped ? 'stamped' : ''} ${dateStr === today ? 'today' : ''}">
      <span>${d}</span>${stamped ? `<div class="leaf-stamp">${leafStampSVG()}</div>` : ''}
    </div>`;
  }
  $('#calGrid').innerHTML = html;
}
function calMove(delta) {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + delta, 1);
  renderCalendar();
}

/* ==========================================================
   日記タブ
========================================================== */
function renderDiaryTab() {
  const cats = state.meta.diaryCategories;
  $('#diaryCatChips').innerHTML =
    `<button class="chip ${!diaryFilterCat ? 'active' : ''}" data-cat="">すべて</button>` +
    cats.map(c => `<button class="chip ${diaryFilterCat === c ? 'active' : ''}" data-cat="${escapeHtml(c)}">#${escapeHtml(c)}</button>`).join('');

  let list = [...state.diary].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (diaryFilterCat) list = list.filter(e => (e.categories || []).includes(diaryFilterCat));
  if (diarySearch.trim()) {
    const q = diarySearch.trim().toLowerCase();
    list = list.filter(e => (e.title + e.body).toLowerCase().includes(q));
  }

  const listEl = $('#diaryList');
  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <div>まだ日記がありません。<br>右下の＋ボタンから今日の一日を記録してみましょう。</div>
    </div>`;
  } else {
    listEl.innerHTML = list.map(e => `
      <div class="entry-item" data-id="${e.id}">
        <div class="entry-top-row"><span class="entry-date">${formatDateLabel(e.date)}</span></div>
        <div class="entry-title">${escapeHtml(e.title) || '（無題）'}</div>
        <div class="entry-body">${escapeHtml(e.body)}</div>
        ${(e.categories || []).length ? `<div class="entry-tags">${e.categories.map(c => `<span class="tag">#${escapeHtml(c)}</span>`).join('')}</div>` : ''}
      </div>`).join('');
  }
  renderTreeWidget();
}

function openDiaryForm(entry) {
  const cats = state.meta.diaryCategories;
  const selected = new Set(entry ? entry.categories : []);
  $('#modalArea').innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${entry ? '日記を編集' : '今日の日記を書く'}</div>
      <div class="form-group">
        <label class="form-label">日付</label>
        <input type="date" id="f_date" class="form-input" value="${entry ? entry.date : todayStr()}">
      </div>
      <div class="form-group">
        <label class="form-label">タイトル</label>
        <input type="text" id="f_title" class="form-input" placeholder="今日の見出し" value="${escapeHtml(entry?.title || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">日記</label>
        <textarea id="f_body" class="form-textarea" placeholder="今日あったこと、感じたこと...">${escapeHtml(entry?.body || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">カテゴリー</label>
        <div class="tag-select-row" id="f_cats">
          ${cats.map(c => `<button type="button" class="tag-option ${selected.has(c) ? 'selected' : ''}" data-cat="${escapeHtml(c)}">#${escapeHtml(c)}</button>`).join('')}
          <button type="button" class="tag-option add-new" id="f_add_cat">＋新しいカテゴリー</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="f_cancel">キャンセル</button>
        ${entry ? '<button class="btn btn-danger" id="f_delete">削除</button>' : ''}
        <button class="btn btn-primary" id="f_save">保存</button>
      </div>
    </div>`;
  openModal();
  const chosenCats = new Set(selected);
  $('#f_cats').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.tag-option');
    if (!btn) return;
    if (btn.id === 'f_add_cat') {
      const name = await showPrompt('新しいカテゴリー名を入力してください', '例：仕事');
      if (name) {
        const clean = name.replace(/^#/, '');
        if (!state.meta.diaryCategories.includes(clean)) {
          state.meta.diaryCategories.push(clean);
          fsSetMeta();
        }
        chosenCats.add(clean);
        openDiaryFormRefreshTags(chosenCats);
      }
      return;
    }
    const c = btn.dataset.cat;
    if (chosenCats.has(c)) chosenCats.delete(c); else chosenCats.add(c);
    btn.classList.toggle('selected');
  });
  function openDiaryFormRefreshTags(chosen) {
    $('#f_cats').innerHTML = `
      ${state.meta.diaryCategories.map(c => `<button type="button" class="tag-option ${chosen.has(c) ? 'selected' : ''}" data-cat="${escapeHtml(c)}">#${escapeHtml(c)}</button>`).join('')}
      <button type="button" class="tag-option add-new" id="f_add_cat">＋新しいカテゴリー</button>`;
  }
  $('#f_cancel').onclick = closeModal;
  if (entry) $('#f_delete').onclick = async () => {
    const ok = await showConfirm('この日記を削除しますか？元に戻せません。');
    if (ok) {
      state.diary = state.diary.filter(d => d.id !== entry.id);
      fsDelete('diary', entry.id);
      closeModal(); renderDiaryTab(); toast('削除しました');
    }
  };
  $('#f_save').onclick = () => {
    const date = $('#f_date').value || todayStr();
    const title = $('#f_title').value.trim();
    const body = $('#f_body').value.trim();
    if (!title && !body) { toast('タイトルか本文を入力してください'); return; }
    const now = new Date().toISOString();
    if (entry) {
      Object.assign(entry, { date, title, body, categories: [...chosenCats], updatedAt: now });
      fsSet('diary', entry);
    } else {
      const newEntry = { id: uid(), date, title, body, categories: [...chosenCats], createdAt: now, updatedAt: now };
      state.diary.push(newEntry);
      fsSet('diary', newEntry);
    }
    closeModal(); renderDiaryTab(); toast('保存しました');
  };
}

/* ==========================================================
   人生手帳タブ
========================================================== */
function renderNotebookTab() {
  const lc = state.meta.lifeCategories;
  const majors = Object.keys(lc);
  $('#notebookMajorChips').innerHTML =
    `<button class="chip ${!notebookFilterMajor ? 'active' : ''}" data-major="">すべて</button>` +
    majors.map(m => `<button class="chip ${notebookFilterMajor === m ? 'active' : ''}" data-major="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('');

  const minorList = notebookFilterMajor ? (lc[notebookFilterMajor] || []) : [];
  $('#notebookMinorChips').style.display = notebookFilterMajor && minorList.length ? 'flex' : 'none';
  $('#notebookMinorChips').innerHTML =
    `<button class="chip ghost ${!notebookFilterMinor ? 'active' : ''}" data-minor="">小カテゴリー：すべて</button>` +
    minorList.map(m => `<button class="chip ghost ${notebookFilterMinor === m ? 'active' : ''}" data-minor="${escapeHtml(m)}">#${escapeHtml(m)}</button>`).join('');

  let list = [...state.notebook].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (notebookFilterMajor) list = list.filter(e => e.majorCategory === notebookFilterMajor);
  if (notebookFilterMinor) list = list.filter(e => e.minorCategory === notebookFilterMinor);
  if (notebookSearch.trim()) {
    const q = notebookSearch.trim().toLowerCase();
    list = list.filter(e => (e.title + latestContent(e)).toLowerCase().includes(q));
  }

  const listEl = $('#notebookList');
  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div>まだ記録がありません。<br>右下の＋ボタンから、人生で大事にしたい学びや思考を書き留めてみましょう。</div></div>`;
  } else {
    listEl.innerHTML = list.map(e => `
      <div class="entry-item" data-id="${e.id}">
        <div class="entry-top-row"><span class="entry-date">${formatDateLabel(latestDate(e))}更新</span></div>
        <div class="entry-title">${escapeHtml(e.title)}</div>
        <div class="entry-body">${escapeHtml(latestContent(e))}</div>
        <div class="entry-tags">
          <span class="tag">${escapeHtml(e.majorCategory)}</span>
          ${e.minorCategory ? `<span class="tag minor">#${escapeHtml(e.minorCategory)}</span>` : ''}
          ${e.history.length > 1 ? `<span class="tag minor">変遷 ${e.history.length}件</span>` : ''}
        </div>
      </div>`).join('');
  }
}
function latestContent(e) { return e.history[e.history.length - 1]?.content || ''; }
function latestDate(e) { return e.history[e.history.length - 1]?.date || e.date; }

function openNotebookDetail(entry) {
  $('#modalArea').innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${escapeHtml(entry.title)}</div>
      <div class="entry-tags" style="margin-bottom:10px;">
        <span class="tag">${escapeHtml(entry.majorCategory)}</span>
        ${entry.minorCategory ? `<span class="tag minor">#${escapeHtml(entry.minorCategory)}</span>` : ''}
      </div>
      <div class="section-title" style="margin-top:4px;">思考の変遷</div>
      <div class="timeline" id="nb_timeline"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="nb_close">閉じる</button>
        <button class="btn btn-danger" id="nb_delete">削除</button>
        <button class="btn btn-primary" id="nb_append">今の思考を追記</button>
      </div>
    </div>`;
  $('#nb_timeline').innerHTML = entry.history.map((h, i) => `
    <div class="timeline-item">
      ${i === entry.history.length - 1 ? '<span class="timeline-latest-badge">最新</span><br>' : ''}
      <span class="timeline-date">${formatDateLabel(h.date)}</span>
      <div class="timeline-content">${escapeHtml(h.content)}</div>
    </div>`).join('');
  openModal();
  $('#nb_close').onclick = closeModal;
  $('#nb_delete').onclick = async () => {
    const ok = await showConfirm('この項目を削除しますか？これまでの変遷もすべて削除されます。');
    if (ok) {
      state.notebook = state.notebook.filter(n => n.id !== entry.id);
      fsDelete('notebook', entry.id);
      closeModal(); renderNotebookTab(); toast('削除しました');
    }
  };
  $('#nb_append').onclick = () => openNotebookAppendForm(entry);
}

function openNotebookAppendForm(entry) {
  $('#modalArea').innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">「${escapeHtml(entry.title)}」に追記</div>
      <div class="form-group">
        <label class="form-label">今の思考・気づき</label>
        <textarea id="f_content" class="form-textarea" placeholder="以前の考えからどう変わりましたか？"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="f_cancel">キャンセル</button>
        <button class="btn btn-primary" id="f_save">追記する</button>
      </div>
    </div>`;
  openModal();
  $('#f_cancel').onclick = () => openNotebookDetail(entry);
  $('#f_save').onclick = () => {
    const content = $('#f_content').value.trim();
    if (!content) { toast('内容を入力してください'); return; }
    entry.history.push({ date: todayStr(), content });
    entry.updatedAt = new Date().toISOString();
    fsSet('notebook', entry);
    closeModal(); renderNotebookTab(); toast('追記しました');
  };
}

function openNotebookForm() {
  const lc = state.meta.lifeCategories;
  let chosenMajor = null, chosenMinor = null;
  $('#modalArea').innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">人生手帳に追加</div>
      <div class="form-group">
        <label class="form-label">大カテゴリー</label>
        <div class="tag-select-row" id="f_majors">
          ${Object.keys(lc).map(m => `<button type="button" class="tag-option" data-major="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('')}
          <button type="button" class="tag-option add-new" id="f_add_major">＋新しい大カテゴリー</button>
        </div>
      </div>
      <div class="form-group" id="f_minor_group" style="display:none;">
        <label class="form-label">小カテゴリー（任意）</label>
        <div class="tag-select-row" id="f_minors"></div>
      </div>
      <div class="form-group">
        <label class="form-label">タイトル</label>
        <input type="text" id="f_title" class="form-input" placeholder="例：仕事において大切にしたいこと">
      </div>
      <div class="form-group">
        <label class="form-label">内容</label>
        <textarea id="f_content" class="form-textarea" placeholder="今、大事だと思っていること..."></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="f_cancel">キャンセル</button>
        <button class="btn btn-primary" id="f_save">保存</button>
      </div>
    </div>`;
  openModal();

  function renderMinors() {
    const group = $('#f_minor_group');
    if (!chosenMajor) { group.style.display = 'none'; return; }
    group.style.display = 'block';
    const minors = lc[chosenMajor] || [];
    $('#f_minors').innerHTML = minors.map(m => `<button type="button" class="tag-option ${chosenMinor === m ? 'selected' : ''}" data-minor="${escapeHtml(m)}">#${escapeHtml(m)}</button>`).join('')
      + `<button type="button" class="tag-option add-new" id="f_add_minor">＋新しい小カテゴリー</button>`;
    $('#f_minors').onclick = async (ev) => {
      const btn = ev.target.closest('.tag-option');
      if (!btn) return;
      if (btn.id === 'f_add_minor') {
        const name = await showPrompt('新しい小カテゴリー名を入力してください', '例：働き方');
        if (name) {
          const clean = name.replace(/^#/, '');
          if (!lc[chosenMajor].includes(clean)) lc[chosenMajor].push(clean);
          chosenMinor = clean;
          fsSetMeta();
          renderMinors();
        }
        return;
      }
      chosenMinor = (chosenMinor === btn.dataset.minor) ? null : btn.dataset.minor;
      renderMinors();
    };
  }

  function renderMajorChips() {
    $('#f_majors').innerHTML =
      Object.keys(lc).map(m => `<button type="button" class="tag-option ${chosenMajor === m ? 'selected' : ''}" data-major="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('') +
      `<button type="button" class="tag-option add-new" id="f_add_major">＋新しい大カテゴリー</button>`;
  }
  $('#f_majors').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.tag-option');
    if (!btn) return;
    if (btn.id === 'f_add_major') {
      const name = await showPrompt('新しい大カテゴリー名を入力してください', '例：仕事');
      if (name) {
        const clean = name;
        if (!lc[clean]) lc[clean] = [];
        chosenMajor = clean; chosenMinor = null;
        fsSetMeta();
        refreshMajors();
      }
      return;
    }
    chosenMajor = (chosenMajor === btn.dataset.major) ? null : btn.dataset.major;
    chosenMinor = null;
    refreshMajors();
  });
  function refreshMajors() {
    renderMajorChips();
    renderMinors();
  }

  $('#f_cancel').onclick = closeModal;
  $('#f_save').onclick = () => {
    const title = $('#f_title').value.trim();
    const content = $('#f_content').value.trim();
    if (!chosenMajor) { toast('大カテゴリーを選択してください'); return; }
    if (!title || !content) { toast('タイトルと内容を入力してください'); return; }
    const now = new Date().toISOString();
    const newEntry = {
      id: uid(), majorCategory: chosenMajor, minorCategory: chosenMinor || '',
      title, history: [{ date: todayStr(), content }], createdAt: now, updatedAt: now
    };
    state.notebook.push(newEntry);
    fsSet('notebook', newEntry);
    closeModal(); renderNotebookTab(); toast('保存しました');
  };
}

/* ==========================================================
   マイライフタブ（マインドマップ：大カテゴリー→小カテゴリー）
========================================================== */
function renderMyLifeTab() {
  const lc = state.meta.lifeCategories;
  const majors = Object.keys(lc);
  const countFor = (major, minor) => state.notebook.filter(e => e.majorCategory === major && (!minor || e.minorCategory === minor)).length;

  const W = 340, H = 360, cx = W / 2, cy = H / 2 - 6;
  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;">`;

  const palette = ['#FFA366', '#8FBC8F', '#F2B880', '#7FB3B3', '#E29BC0', '#C9A66B', '#9AB0D9'];
  const R1 = 96, R2 = 56, GAP_ANGLE = 0.6;

  majors.forEach((major, i) => {
    const angle = (i / Math.max(majors.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const mx = cx + Math.cos(angle) * R1, my = cy + Math.sin(angle) * R1;
    const count = countFor(major);
    const r = Math.min(28, 14 + Math.sqrt(count) * 5.5);
    const color = palette[i % palette.length];
    const selected = mindmapSelectedMajor === major;

    svg += `<line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" stroke="${color}" stroke-width="2.5" opacity="0.45"/>`;

    const minors = lc[major] || [];
    const totalSpread = Math.min(1.9, GAP_ANGLE * Math.max(minors.length - 1, 0));
    minors.forEach((minor, j) => {
      const mAngle = angle + (minors.length > 1 ? (j - (minors.length - 1) / 2) * (totalSpread / (minors.length - 1)) : 0);
      const radius = R2 + (j % 2 === 1 ? 20 : 0);
      const nx = cx + Math.cos(mAngle) * radius, ny = cy + Math.sin(mAngle) * radius;
      const mc = countFor(major, minor);
      const nr = Math.min(18, 8 + Math.sqrt(mc) * 3.2);
      const labelY = ny + (Math.sin(mAngle) >= 0 ? nr + 11 : -nr - 7);
      svg += `<line x1="${mx}" y1="${my}" x2="${nx}" y2="${ny}" stroke="${color}" stroke-width="1.5" opacity="0.35"/>`;
      svg += `<g class="mm-node" data-major="${escapeHtml(major)}" data-minor="${escapeHtml(minor)}" style="cursor:pointer;">
        <circle cx="${nx}" cy="${ny}" r="${nr}" fill="#fff" stroke="${color}" stroke-width="2"/>
        <text x="${nx}" y="${labelY}" text-anchor="middle" font-size="9" fill="#8A7565" font-family="'Zen Kaku Gothic New'">${escapeHtml(minor)}</text>
      </g>`;
    });

    svg += `<g class="mm-node" data-major="${escapeHtml(major)}" data-minor="" style="cursor:pointer;">
      <circle cx="${mx}" cy="${my}" r="${r}" fill="${selected ? color : '#fff'}" stroke="${color}" stroke-width="3"/>
      <text x="${mx}" y="${my + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${selected ? '#fff' : '#4A3728'}" font-family="'Zen Maru Gothic'">${escapeHtml(major)}</text>
    </g>`;
  });

  svg += `<circle cx="${cx}" cy="${cy}" r="30" fill="#FF8C42"/>`;
  svg += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="'Zen Maru Gothic'">自分</text>`;
  svg += `</svg>`;
  $('#mindmapSvgWrap').innerHTML = svg;

  $$('.mm-node', $('#mindmapSvgWrap')).forEach(node => {
    node.onclick = () => {
      mindmapSelectedMajor = node.dataset.major;
      notebookFilterMajor = node.dataset.major;
      notebookFilterMinor = node.dataset.minor || null;
      renderMyLifeTab();
      renderMindmapFilteredList();
    };
  });

  // サマリー
  const total = state.notebook.length;
  let topMajor = '-', topCount = 0;
  majors.forEach(m => { const c = countFor(m); if (c > topCount) { topCount = c; topMajor = m; } });
  const recentlyUpdated = [...state.notebook].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  $('#mylifeSummary').innerHTML = `
    <div class="summary-card"><div class="summary-num">${total}</div><div class="summary-label">記録の総数</div></div>
    <div class="summary-card"><div class="summary-num">${escapeHtml(topMajor)}</div><div class="summary-label">最も多いカテゴリー</div></div>
    <div class="summary-card" style="grid-column:1/3;"><div class="summary-num" style="font-size:15px;">${recentlyUpdated ? escapeHtml(recentlyUpdated.title) : '-'}</div><div class="summary-label">直近更新した項目</div></div>
  `;
  renderMindmapFilteredList();
}
function renderMindmapFilteredList() {
  const wrap = $('#mylifeFilteredList');
  if (!mindmapSelectedMajor) { wrap.innerHTML = ''; return; }
  let list = state.notebook.filter(e => e.majorCategory === mindmapSelectedMajor);
  if (notebookFilterMinor) list = list.filter(e => e.minorCategory === notebookFilterMinor);
  wrap.innerHTML = `<div class="section-title">${escapeHtml(mindmapSelectedMajor)}${notebookFilterMinor ? ' ／ #' + escapeHtml(notebookFilterMinor) : ''}の記録</div>` +
    (list.length === 0 ? `<div class="empty-state" style="padding:24px;">まだ記録がありません</div>` :
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(e => `
        <div class="entry-item" data-id="${e.id}" data-jump="notebook">
          <div class="entry-title">${escapeHtml(e.title)}</div>
          <div class="entry-body">${escapeHtml(latestContent(e))}</div>
        </div>`).join(''));
}

/* ==========================================================
   モーダル共通
========================================================== */
function openModal() { $('#modalOverlay').classList.add('open'); }
function closeModal() { $('#modalOverlay').classList.remove('open'); setTimeout(() => { $('#modalArea').innerHTML = ''; }, 250); }

/* ---------------- ミニダイアログ（confirm/promptの自作代替） ----------------
   iOS PWA（ホーム画面に追加してstandalone表示した場合）では
   window.confirm / window.prompt が正しく表示されないことがあるため、
   同じ見た目のトーンで自前のダイアログを用意している。 */
function closeMini() { $('#miniOverlay').classList.remove('open'); setTimeout(() => { $('#miniCard').innerHTML = ''; }, 200); }

function showConfirm(message, okLabel = '削除する') {
  return new Promise((resolve) => {
    $('#miniCard').innerHTML = `
      <div class="mini-message">${escapeHtml(message)}</div>
      <div class="mini-actions">
        <button class="btn btn-secondary" id="mini_cancel">キャンセル</button>
        <button class="btn btn-danger" id="mini_ok">${escapeHtml(okLabel)}</button>
      </div>`;
    $('#miniOverlay').classList.add('open');
    $('#mini_cancel').onclick = () => { closeMini(); resolve(false); };
    $('#mini_ok').onclick = () => { closeMini(); resolve(true); };
  });
}

function showPrompt(message, placeholder = '') {
  return new Promise((resolve) => {
    $('#miniCard').innerHTML = `
      <div class="mini-message">${escapeHtml(message)}</div>
      <input type="text" class="form-input" id="mini_input" placeholder="${escapeHtml(placeholder)}" style="margin-bottom:14px;">
      <div class="mini-actions">
        <button class="btn btn-secondary" id="mini_cancel">キャンセル</button>
        <button class="btn btn-primary" id="mini_ok">追加</button>
      </div>`;
    $('#miniOverlay').classList.add('open');
    const inp = $('#mini_input');
    setTimeout(() => inp.focus(), 250);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#mini_ok').click(); });
    $('#mini_cancel').onclick = () => { closeMini(); resolve(null); };
    $('#mini_ok').onclick = () => { const v = inp.value.trim(); closeMini(); resolve(v || null); };
  });
}

/* ==========================================================
   イベント初期化
========================================================== */
function initEvents() {
  $$('.tab-btn').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  $('#titleEditBtn').onclick = startEditTitle;
  $('#appTitleInput').addEventListener('blur', finishEditTitle);
  $('#appTitleInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#appTitleInput').blur(); });

  $('#calendarBtn').onclick = openCalendarModal;
  $('#modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });

  $('#fab').onclick = () => {
    if (currentTab === 'diary') openDiaryForm(null);
    else if (currentTab === 'notebook') openNotebookForm();
  };

  $('#diarySearchInput').addEventListener('input', (e) => { diarySearch = e.target.value; renderDiaryTab(); });
  $('#diaryCatChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    diaryFilterCat = btn.dataset.cat || null; renderDiaryTab();
  });
  $('#diaryList').addEventListener('click', (e) => {
    const item = e.target.closest('.entry-item'); if (!item) return;
    const entry = state.diary.find(d => d.id === item.dataset.id);
    if (entry) openDiaryForm(entry);
  });

  $('#notebookSearchInput').addEventListener('input', (e) => { notebookSearch = e.target.value; renderNotebookTab(); });
  $('#notebookMajorChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    notebookFilterMajor = btn.dataset.major || null; notebookFilterMinor = null; renderNotebookTab();
  });
  $('#notebookMinorChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    notebookFilterMinor = btn.dataset.minor || null; renderNotebookTab();
  });
  $('#notebookList').addEventListener('click', (e) => {
    const item = e.target.closest('.entry-item'); if (!item) return;
    const entry = state.notebook.find(n => n.id === item.dataset.id);
    if (entry) openNotebookDetail(entry);
  });

  $('#mylifeFilteredList').addEventListener('click', (e) => {
    const item = e.target.closest('.entry-item'); if (!item) return;
    const entry = state.notebook.find(n => n.id === item.dataset.id);
    if (entry) { switchTab('notebook'); setTimeout(() => openNotebookDetail(entry), 180); }
  });
}

/* ==========================================================
   起動
========================================================== */
function init() {
  loadLocal();
  renderHeader();
  initEvents();
  switchTab('diary');
  initFirebase();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
document.addEventListener('DOMContentLoaded', init);
