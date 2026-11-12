/* لوحة الإدارة: الإشعارات والرسائل (#admin-notify) — رسالة من الإدارة إلى المتدربين أو أولياء الأمور أو المدربين،
   بنطاق (الكل، قسم، برنامج، متدرب)، وضبط تنبيه بدء الجلسة. تصل إلى صندوق الوارد في البوابات مع الصوت. */
import { $, $$, esc, fmtNum, fmtShort, t12, riyadhNow } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy } from './features.js';
import { SECTIONS } from './qudurat.js';
import { AUDIENCE_TXT, SOON_DEFAULT, adminRecipients } from './inbox_logic.js';

const SCOPE_TXT = { all:'الكل', section:'قسم', program:'برنامج تدريبي', trainee:'متدرب واحد' };

export function pageNotify(){
  const m = $('#main'), today = riyadhNow().date, soon = AD.settings?.soon_minutes ?? SOON_DEFAULT;
  const sent = (AD.notifications || []).filter(x => x.sender === 'admin');
  const batches = Object.values(sent.reduce((o, x) => { const k = x.batch || x.at; (o[k] = o[k] || { at:x.at, text:x.text, to:x.to, n:0, read:0 }); o[k].n++; if(x.read_at) o[k].read++; return o; }, {}))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  const progs = (AD.programs || []).filter(p => (AD.cohorts || []).some(c => c.program_id === p.id && !c.archived_at && c.end_date >= today));
  m.innerHTML = titleBar(`${ic('alert')}الإشعارات والرسائل`, 'رسائل الإدارة <em>والتنبيهات</em>',
      'تصل الرسالة إلى صندوق الوارد في بوابة المستلم مع صوت التنبيه، وتظهر إشعارًا على جهازه إن ثبّت المنصة وفعّل الإشعارات.') +
    `<div class="grid g2" style="align-items:start">
      <form class="card pad rv" id="nf" novalidate><h3 class="ctitle">${ic('activity')}رسالة جديدة</h3>
        <div class="field"><label for="nf-aud">إلى</label><select class="inp" id="nf-aud" name="audience">${Object.entries(AUDIENCE_TXT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label for="nf-scope">النطاق</label><select class="inp" id="nf-scope" name="scope">${Object.entries(SCOPE_TXT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field" id="nf-secF" hidden><label for="nf-sec">القسم</label><select class="inp" id="nf-sec" name="section">${Object.entries(SECTIONS).map(([k, v]) => `<option value="${k}">قسم ${v}</option>`).join('')}</select></div>
        <div class="field" id="nf-progF" hidden><label for="nf-prog">البرنامج</label><select class="inp" id="nf-prog" name="program_id">${progs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('') || '<option value="">لا توجد دفعات قائمة</option>'}</select></div>
        <div class="field" id="nf-trF" hidden><label for="nf-tr">السجل المدني للمتدرب</label><input class="inp num" id="nf-tr" name="nid" inputmode="numeric" maxlength="10" dir="ltr"></div>
        <div class="field"><label for="nf-text">نص الرسالة <i>*</i></label><textarea class="inp" id="nf-text" name="text" rows="5" maxlength="600" aria-describedby="nf-count"></textarea><div class="hint" id="nf-count">0 / 600</div></div>
        <p class="hint" id="nf-n" aria-live="polite"></p><div class="errtxt" id="nfE" aria-live="polite"></div>
        <button class="btn pri" id="nfGo">${ic('check')} إرسال</button></form>
      <div class="card pad rv"><h3 class="ctitle">${ic('clock')}تنبيه بدء الجلسة</h3>
        <p class="hint" style="margin-top:-4px">يصل تلقائيًا إلى المتدرب وولي أمره الموثّق ومدربي القسم قبل بداية كل جلسة، مرة واحدة لكل جلسة، ولا يصل إذا أُلغيت الجلسة.</p>
        <div class="field"><label for="soon">قبل البداية بـ (دقيقة، 0 لإيقافه)</label><input class="inp num" id="soon" type="number" min="0" max="60" value="${soon}" style="max-width:140px"></div>
        <button class="btn" id="soonGo">${ic('check')} حفظ</button>
        <h3 class="ctitle" style="margin-top:18px">${ic('activity')}آخر ما أُرسل</h3>
        ${batches.length ? `<ul class="ntf">${batches.map(b => `<li><span class="pill info">${AUDIENCE_TXT[b.to] || ''} · ${fmtNum(b.n)}</span><span>${esc(b.text.slice(0, 120))}</span><small class="hint">${fmtShort(b.at.slice(0, 10))} · ${t12(new Date(new Date(b.at).getTime() + 3 * 3600e3).toISOString().slice(11, 16))} · قرأه ${fmtNum(b.read)}</small></li>`).join('')}</ul>` : emptyBox('لم تُرسل رسائل بعد', '')}
      </div></div>`;
  const f = $('#nf'), show = () => { const sc = f.elements.scope.value, aud = f.elements.audience.value;
    $('#nf-secF').hidden = sc !== 'section'; $('#nf-progF').hidden = !(sc === 'program' && aud !== 'teacher'); $('#nf-trF').hidden = !(sc === 'trainee' && aud !== 'teacher');
    $$('#nf-scope option').forEach(o => { o.disabled = aud === 'teacher' && ['program', 'trainee'].includes(o.value); });
    if(aud === 'teacher' && ['program', 'trainee'].includes(sc)) { f.elements.scope.value = 'all'; return show(); }
    $('#nf-n').textContent = `يصل إلى ${fmtNum(recipients().length)} مستلمًا.`; };
  const recipients = () => { const nid = f.elements.nid.value.trim(), t = AD.trainees.find(x => x.national_id === nid);
    if(f.elements.scope.value === 'trainee' && !t) return [];
    return adminRecipients(AD, { audience:f.elements.audience.value, scope:f.elements.scope.value, section:f.elements.section.value, program_id:f.elements.program_id.value, trainee_id:t?.id }, today); };
  ['audience', 'scope', 'section', 'program_id'].forEach(k => f.elements[k].onchange = show); f.elements.nid.oninput = show;
  f.elements.text.oninput = () => { $('#nf-count').textContent = `${f.elements.text.value.length} / 600`; };
  show();
  f.onsubmit = async e => { e.preventDefault(); const b = $('#nfGo'), t = AD.trainees.find(x => x.national_id === f.elements.nid.value.trim()); $('#nfE').textContent = '';
    if(f.elements.scope.value === 'trainee' && !t) { $('#nfE').textContent = 'لا يوجد متدرب بهذا السجل المدني'; return; }
    setBusy(b, true, 'جارٍ الإرسال');
    try { const r = await Store.adminNotify({ audience:f.elements.audience.value, scope:f.elements.scope.value, section:f.elements.section.value, program_id:f.elements.program_id.value, trainee_id:t?.id, text:f.elements.text.value });
      toast(`أُرسلت الرسالة إلى ${fmtNum(r.count)} مستلمًا`); await reloadAD(); pageNotify(); }
    catch(err){ $('#nfE').textContent = err.message; } finally { setBusy(b, false); } };
  $('#soonGo').onclick = async () => { const v = Math.max(0, Math.min(60, Math.round(+$('#soon').value || 0)));
    await Store.saveSettings({ soon_minutes:v }); await reloadAD(); toast(v ? `يصل التنبيه قبل ${fmtNum(v)} دقائق من بدء الجلسة` : 'أُوقف تنبيه بدء الجلسة'); };
}
