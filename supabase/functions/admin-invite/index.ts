// دعوة مسؤول جديد من داخل لوحة الإدارة (الخطوة Z2)
// 1) تُسجَّل الدعوة بصلاحيات المتصل نفسه عبر admin_add (الخادم يتحقق أنه مالك أو مدير كامل، وإعادة التحقق لمنح «الكامل»).
// 2) يُرسَل بريد دعوة من Supabase إلى المدعوّ برابط يعيده إلى لوحة الإدارة ليختار كلمة مروره.
// 3) إن تعذّر البريد (خادم البريد الافتراضي لا يرسل إلا لأعضاء فريق Supabase، أو تجاوز الحد) يُنشأ الحساب بكلمة مرور مؤقتة
//    تظهر للمالك مرة واحدة، ويُلزم صاحبها بتغييرها عند أول دخول. مفتاح الخدمة يبقى هنا على الخادم ولا يصل إلى المتصفح.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const ALLOWED_REDIRECT = /^https:\/\/shomar1434-jpg\.github\.io\/SAMA-ALQODRAT\/admin\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

function tempPassword(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", b = new Uint32Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => A[n % A.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "طريقة غير مدعومة" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let body: { email?: string; name?: string; role?: string; redirect?: string };
  try { body = await req.json(); } catch { return json({ error: "طلب غير صالح" }, 400); }
  const email = String(body.email || "").trim().toLowerCase(), name = String(body.name || "").trim(), role = body.role === "full" ? "full" : "staff";
  const redirect = ALLOWED_REDIRECT.test(String(body.redirect || "")) ? String(body.redirect) : undefined;

  // التفويض يُحسم في قاعدة البيانات بصلاحيات المتصل لا بمفتاح الخدمة
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const added = await asCaller.rpc("admin_add", { p_email: email, p_name: name, p_role: role });
  if (added.error) return json({ error: added.error.message }, 400);
  if (added.data && added.data.pending === false) return json({ ok: true, mode: "existing" });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: redirect, data: { name } });
  if (!inv.error) return json({ ok: true, mode: "email" });

  // بديل بلا بريد: حساب مؤكَّد بكلمة مرور مؤقتة يغيّرها صاحبها عند أول دخول
  const pass = tempPassword(), meta = { name, must_change_password: true };
  let uid: string | undefined;
  const created = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true, user_metadata: meta });
  if (created.error) {
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    uid = list.data?.users.find((u) => (u.email || "").toLowerCase() === email)?.id;
    if (!uid) return json({ error: "تعذّر إنشاء الحساب: " + created.error.message }, 400);
    const upd = await admin.auth.admin.updateUserById(uid, { password: pass, email_confirm: true, user_metadata: meta });
    if (upd.error) return json({ error: "تعذّر تحديث الحساب: " + upd.error.message }, 400);
  }
  return json({ ok: true, mode: "password", temp_password: pass, email_error: inv.error.message });
});
