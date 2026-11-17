import { Store } from './data2.js';
import { $, esc, fmtNum, uid, matchQ } from './utils.js';
import { titleBar } from './views2_main.js';
import { ic, toast, emptyBox } from './views2_head.js';
import { matchResponse } from './assistant_logic.js';
import { interestsTab } from './interest_views.js';

const state = { query: '', selected: null, tab: 'lib' };

const tabsHtml = () => `<div class="tabs" role="tablist" style="margin:0 0 14px">${[['lib', 'book', 'مكتبة الردود'], ['int', 'users', 'المهتمون والطلب']].map(([k, i, t]) => `<button class="tab" role="tab" data-ast="${k}" aria-selected="${state.tab === k}">${ic(i)}${t}</button>`).join('')}</div>`;
const bindTabs = () => document.querySelectorAll('[data-ast]').forEach(b => b.onclick = () => { state.tab = b.dataset.ast; pageAssistant(); });
export async function pageAssistant() {
  const main = $('#main');
  if (state.tab === 'int') {
    main.innerHTML = titleBar(`${ic('chat')} المساعد الذكي`, 'المهتمون والطلب', 'من طلب الإشعار من المساعد، وعدد الاستفسارات عن كل برنامج وباقة، وحملات الإبلاغ والعروض من واتساب المركز.') + tabsHtml() + '<div id="asInt"></div>';
    bindTabs(); await interestsTab($('#asInt'), pageAssistant); return;
  }
  main.innerHTML = titleBar(`${ic('chat')} المساعد الذكي`, 'مكتبة الردود', 'أضف الردود وحسّن صياغتها والكلمات التي تساعد المساعد على اختيارها.', '<button class="btn pri" id="asAdd">إضافة رد</button>') + tabsHtml() +
    '<div class="grid g2"><section class="card pad"><label for="asSearch">البحث في الردود</label><input class="inp" type="search" id="asSearch" placeholder="العنوان أو التصنيف أو نص الرد"><p class="hint" id="asCount"></p><div id="asList"></div></section><section class="card pad" id="asEditor"></section></div>' +
    '<section class="card pad" style="margin-top:16px"><h3>معاينة إجابة المساعد</h3><form id="asPreview"><label for="asQuestion">اكتب سؤالًا</label><div style="display:flex;gap:8px"><input class="inp" id="asQuestion" maxlength="650" required><button class="btn">عرض الرد</button></div></form><div id="asResult" aria-live="polite" style="white-space:pre-wrap;margin-top:12px"></div></section>';
  let rows;
  try { rows = await Store.assistantResponses(); }
  catch (error) { main.innerHTML = emptyBox('تعذّر تحميل مكتبة الردود', esc(error.message)); return; }
  if (!main.isConnected || !$('#asList')) return;
  bindTabs();
  const search = $('#asSearch');
  search.value = state.query;
  const list = () => {
    const query = state.query.trim();
    const filtered = rows.filter(row => matchQ(query, row.title, row.category, row.answer, ...row.keywords));
    $('#asCount').textContent = `${fmtNum(filtered.length)} ردًا`;
    $('#asList').innerHTML = filtered.map(row => `<button type="button" class="btn" data-response="${esc(row.id)}" style="display:block;width:100%;text-align:right;margin:6px 0"><b>${esc(row.title)}</b><br><span class="hint">${esc(row.category)} · ${row.active ? 'مفعّل' : 'معطّل'}</span></button>`).join('') || '<p class="hint">لا توجد ردود مطابقة.</p>';
    $('#asList').querySelectorAll('[data-response]').forEach(button => button.onclick = () => select(button.dataset.response));
  };
  const select = id => {
    const form = $('#asForm');
    if (form?.dataset.dirty === 'true' && !confirm('توجد تعديلات غير محفوظة. هل تريد الانتقال دون حفظها؟')) return;
    state.selected = id;
    editor(rows.find(row => row.id === id));
  };
  const editor = row => {
    const item = row || { id: uid(), title: '', category: 'عام', keywords: [], answer: '', actions: [], active: true };
    $('#asEditor').innerHTML = `<h3>${row ? 'تحسين الرد' : 'رد جديد'}</h3><form id="asForm" class="grid" novalidate>
      <div class="field"><label for="asTitle">عنوان الرد</label><input class="inp" id="asTitle" maxlength="120" value="${esc(item.title)}" required></div>
      <div class="field"><label for="asCategory">التصنيف</label><input class="inp" id="asCategory" maxlength="80" value="${esc(item.category)}" required></div>
      <div class="field"><label for="asKeywords">الأسئلة والكلمات المفتاحية، كل عبارة في سطر</label><textarea class="inp" id="asKeywords" rows="4">${esc(item.keywords.join('\n'))}</textarea></div>
      <div class="field"><label for="asAnswer">نص الرد</label><textarea class="inp" id="asAnswer" rows="7" maxlength="8000" required>${esc(item.answer)}</textarea></div>
      <div class="field"><label for="asActions">أسئلة المتابعة، كل سؤال في سطر</label><textarea class="inp" id="asActions" rows="3">${esc(item.actions.join('\n'))}</textarea></div>
      <label><input type="checkbox" id="asActive" ${item.active ? 'checked' : ''}> تفعيل الرد للمساعد</label>
      <p class="errtxt" id="asError" role="alert"></p><p id="asSaved" class="hint" role="status"></p><button class="btn pri" id="asSave">حفظ الرد</button></form>`;
    const form = $('#asForm');
    form.oninput = () => { form.dataset.dirty = 'true'; };
    form.onchange = () => { form.dataset.dirty = 'true'; };
    form.onsubmit = async event => {
      event.preventDefault();
      const button = $('#asSave');
      if (button.disabled) return;
      button.disabled = true;
      $('#asError').textContent = '';
      const split = value => value.split(/\n|،/).map(x => x.trim()).filter(Boolean);
      const input = { ...item, title: $('#asTitle').value, category: $('#asCategory').value, keywords: split($('#asKeywords').value), answer: $('#asAnswer').value, actions: split($('#asActions').value), active: $('#asActive').checked };
      try {
        const saved = await Store.saveAssistantResponse(input);
        const index = rows.findIndex(row => row.id === saved.id);
        if (index < 0) rows.push(saved); else rows[index] = saved;
        state.selected = saved.id;
        editor(saved); list();
        $('#asSaved').textContent = 'تم حفظ الرد';
        toast('تم حفظ الرد');
      } catch (error) { $('#asError').textContent = error.message; }
      finally { button.disabled = false; }
    };
  };
  search.oninput = () => { state.query = search.value; list(); };
  $('#asAdd').onclick = () => select(null);
  $('#asPreview').onsubmit = event => {
    event.preventDefault();
    const reply = matchResponse(rows, $('#asQuestion').value);
    $('#asResult').textContent = reply ? `مساعد سما الذكي\n${reply.answer}` : 'لا يتوفر رد مطابق في المكتبة.';
  };
  list();
  editor(rows.find(row => row.id === state.selected) || rows[0]);
}
