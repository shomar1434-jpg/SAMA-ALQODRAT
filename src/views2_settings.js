import { Store } from './data2.js';
import { $, $$, esc } from './utils.js';
import { AD, reloadAD } from './views2_admin.js';
import { getTheme, ic, setTheme, toast } from './views2_head.js';
import { route, titleBar } from './views2_main.js';
import { closeModal, confirmBox, modal, swRow } from './views2_programs.js';

/* ---------- الإعدادات ---------- */
export function pageSettings(){
  const m=$('#main'); const s=AD.settings; const cloud=Store.mode==='cloud'; const th=getTheme();
  m.innerHTML = titleBar(`${ic('settings')}الإعدادات`, 'سياسة الحضور <em>والمظهر</em>', 'رمز اليوم، مهلة التأخر، رابط الباركود، والوضع الفاتح أو الداكن.')+
   `<div class="grid g2"><form class="card pad grid rv" style="--i:1" id="sf">
     <h3 class="ctitle">${ic('qr')}سياسة الحضور</h3>
     ${swRow('require_code','طلب رمز اليوم مع الباركود',s.require_code,'طبقة حماية إضافية: يظهر الرمز على شاشة القاعة فقط، فيمنع التحضير من خارج المركز بصورة الباركود.')}
     <div class="field"><label>حد الشهادة ووزن التأخر ورسائل التنبيه</label><a class="btn sm" href="#admin-rules" style="justify-self:start">${ic('pie')} آلية الاحتساب</a></div>
     <div class="field"><label>مهلة التأخر (دقيقة بعد بداية المحاضرة)</label><input class="inp" type="number" name="late_minutes" min="0" value="${s.late_minutes}"></div>
     <div class="field"><label>فتح تسجيل الحضور قبل المحاضرة (دقيقة)</label><input class="inp" type="number" name="early_minutes" min="0" value="${s.early_minutes}"></div>
     <div class="field"><label>الرابط الأساسي للنظام المنشور</label><input class="inp" name="checkin_url" dir="ltr" value="${esc(s.checkin_url||'')}" placeholder="https://sama-qudrat.example.com/"><span class="hint">تُبنى منه روابط البرامج وباركوداتها (الرابط + #رمز البرنامج). اتركه فارغًا لاستخدام رابط هذه الصفحة. ثبّته بعد النشر، فتغييره يغيّر الباركودات المطبوعة.</span></div>
     ${cloud?'':`<div class="field"><label>رمز دخول المدير</label><input class="inp" name="admin_pin" value="${esc(s.admin_pin)}"></div>`}
     <button class="btn pri">${ic('check')} حفظ الإعدادات</button></form>
     <div class="grid" style="align-content:start">
       <div class="card pad rv" style="--i:2"><h3 class="ctitle" style="margin-bottom:10px">${ic(th==='dark'?'moon':'sun')}المظهر</h3>
         <div class="seg" style="margin:0" id="thSeg">${[['light','فاتح','sun'],['dark','داكن','moon'],['auto','حسب الجهاز','settings']].map(([v,l,i])=>`<button data-th="${v}" class="${th===v?'on':''}">${ic(i)}${l}</button>`).join('')}</div>
         <p class="hint" style="margin:10px 0 0">يُحفظ اختيار المظهر في هذا الجهاز. الحركة تتوقف تلقائيًا عند تفعيل «تقليل الحركة» في الجهاز.</p></div>
       <div class="card pad rv" style="--i:3"><h3 class="ctitle" style="margin-bottom:8px">${ic('database')}قاعدة البيانات</h3>
         ${cloud?`<span class="pill dot ok">متصل بـ Supabase</span><p class="hint">البيانات محفوظة سحابيًا ومحمية بالصلاحيات: المتدرب يسجّل ويحضر فقط، والمدير وحده يطّلع على البيانات.</p>`
          :`<span class="pill dot o">بيانات تجريبية</span><p class="hint">البرامج حقيقية من دليل المركز، أما الدفعات والمتدربون والحضور فتجريبية ومحفوظة في هذا المتصفح فقط. للتشغيل الفعلي يُربط النظام بـ Supabase.</p>
           <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="rDemo">${ic('refresh')} توليد بيانات جديدة</button><button class="btn sm danger soft" id="rEmpty">${ic('trash')} مسح الدفعات والمتدربين</button></div>`}
       </div>
       <div class="card pad rv" style="--i:4"><h3 class="ctitle" style="margin-bottom:4px">${ic('lock')}رمز اليوم</h3><p class="hint" style="margin:0 0 8px">يتغيّر تلقائيًا كل يوم ويظهر على شاشة الباركود.</p><div class="num" style="font-size:36px;line-height:1.3;font-weight:700;letter-spacing:10px;color:var(--brand-strong)" dir="ltr" id="sc">····</div></div>
     </div></div>`;
  Store.todayCode().then(c=>$('#sc').textContent=c).catch(()=>{});
  $$('#thSeg button').forEach(b=>b.onclick=()=>{ setTheme(b.dataset.th); pageSettings(); });
  $('#sf').onsubmit=async e=>{ e.preventDefault(); const fd=new FormData(e.target);
    const o={ require_code:!!fd.get('require_code'), late_minutes:+fd.get('late_minutes'), early_minutes:+fd.get('early_minutes'), checkin_url:fd.get('checkin_url').trim() };
    if(!cloud){ const pin=fd.get('admin_pin').trim(); if(pin.length<4) return toast('رمز الدخول 4 خانات على الأقل'); o.admin_pin=pin; }
    try{ await Store.saveSettings(o); await reloadAD(); toast('حُفظت الإعدادات'); }catch(x){ toast(x.message); } };
  if(!cloud){
    $('#rDemo').onclick=()=>{ modal(`<div class="alert t-warning"><span class="aic">${ic('refresh')}</span><div><b style="font-weight:600;font-size:16px">توليد بيانات تجريبية جديدة</b><div class="hint">تُستبدل كل البيانات الحالية ببيانات تجريبية جديدة.</div></div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn" id="mc">إلغاء</button><button class="btn pri" id="mo">${ic('refresh')} توليد</button></div>`);
      $('#mc').onclick=closeModal; $('#mo').onclick=async()=>{ await Store.resetDemo(false); closeModal(); toast('وُلّدت بيانات جديدة'); route(); }; };
    $('#rEmpty').onclick=()=>confirmBox('مسح الدفعات والمتدربين','تُحذف كل الدفعات وكشوفها والمتدربون وسجلات الحضور، ويبقى دليل البرامج والباقات.', async()=>{ await Store.clearPeople(); toast('مُسحت البيانات'); route(); });
  }
}

