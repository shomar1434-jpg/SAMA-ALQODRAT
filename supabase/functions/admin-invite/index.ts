// دعوة مسؤول جديد من داخل لوحة الإدارة (الخطوة Z2)
// 1) تُسجَّل الدعوة بصلاحيات المتصل نفسه عبر admin_add (الخادم يتحقق أنه مالك أو مدير كامل، وإعادة التحقق لمنح «الكامل»).
// 2) يُرسَل بريد دعوة من Supabase إلى المدعوّ برابط يعيده إلى لوحة الإدارة ليختار كلمة مروره.
// 3) إن تعذّر البريد (خادم البريد الافتراضي لا يرسل إلا لأعضاء فريق Supabase، أو تجاوز الحد) يُنشأ الحساب بكلمة مرور مؤقتة
//    تظهر للمالك مرة واحدة، ويُلزم صاحبها بتغييرها عند أول دخول. مفتاح الخدمة يبقى هنا على الخادم ولا يصل إلى المتصفح.
import { createClient } from "jsr:@supabase/supabase-js@2";

// CORS: موقع المركز وحده (وخادم التطوير المحلي)؛ ALLOWED_ORIGINS في بيئة الدالة يضيف نطاقًا آخر عند الحاجة
const ORIGINS = ["https://shomar1434-jpg.github.io", ...String(Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean)];
const originOk = (o: string) => ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const CORS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const withCors = (req: Request, res: Response) => {
  const o = req.headers.get("Origin") || "";
  try { res.headers.set("Access-Control-Allow-Origin", originOk(o) ? o : ORIGINS[0]); } catch (_) { /* ترويسات ثابتة (تحويل) */ }
  return res;
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const ALLOWED_REDIRECT = /^https:\/\/shomar1434-jpg\.github\.io\/SAMA-ALQODRAT\/admin\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

function tempPassword(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", b = new Uint32Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => A[n % A.length]).join("");
}

Deno.serve(async (req) => withCors(req, await handle(req)));

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "طريقة غير مدعومة" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let body: { email?: string; name?: string; role?: string; redirect?: string; action?: string; user_id?: string };
  try { body = await req.json(); } catch { return json({ error: "طلب غير صالح" }, 400); }
  const email = String(body.email || "").trim().toLowerCase(), name = String(body.name || "").trim(), role = body.role === "full" ? "full" : "staff";
  const redirect = ALLOWED_REDIRECT.test(String(body.redirect || "")) ? String(body.redirect) : undefined;

  // التفويض يُحسم في قاعدة البيانات بصلاحيات المتصل لا بمفتاح الخدمة
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });

  // إعادة تعيين كلمة مرور مسؤول (المالك وحده؛ يُحسم في admin_password_reset_target): كلمة مؤقتة تظهر مرة واحدة ويُلزم صاحبها بتغييرها
  if (body.action === "reset_password") {
    const t = await asCaller.rpc("admin_password_reset_target", { p_id: String(body.user_id || "") });
    if (t.error) return json({ error: /permission denied/i.test(t.error.message) ? "إعادة تعيين كلمات المرور للمالك الأساسي وحده" : t.error.message }, 400);
    const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const cur = await svc.auth.admin.getUserById(String(body.user_id));
    const pass = tempPassword();
    const up = await svc.auth.admin.updateUserById(String(body.user_id), { password: pass, user_metadata: { ...(cur.data?.user?.user_metadata || {}), must_change_password: true } });
    if (up.error) return json({ error: "تعذّرت إعادة التعيين: " + up.error.message }, 400);
    return json({ ok: true, mode: "password", temp_password: pass, email: t.data });
  }
  const added = await asCaller.rpc("admin_add", { p_email: email, p_name: name, p_role: role });
  if (added.error) return json({ error: /permission denied/i.test(added.error.message) ? "إدارة المسؤولين لمدير النظام فقط" : added.error.message }, /permission denied/i.test(added.error.message) ? 403 : 400);
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
}
