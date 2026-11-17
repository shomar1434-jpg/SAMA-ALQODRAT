// ربط قناة يوتيوب المركز ومزامنة بثوثها (الخطوة BC، قرار المالك 17 نوفمبر)
// - POST {action:"auth_url", return_to}: المالك وحده (yt_begin_link بصلاحية المتصل) ← رابط موافقة Google (youtube.readonly، offline).
// - GET ?code&state: عودة Google؛ يُبادَل الرمز برمز تحديث يُحفظ في yt_auth (لا يقرؤه إلا مفتاح الخدمة)، ويُعاد المالك إلى لوحة الإدارة.
// - POST {action:"sync", force?}: أي مستخدم مسجّل (بوابة أو إدارة)، مرة كل دقيقة على الأكثر (والإجبار للإدارة): يجلب بثوث القناة
//   (ومنها غير المدرجة) ويحدّث yt_videos ثم يسندها إلى المحاضرات (yt_upsert_videos ← yt_assign).
// - POST {action:"unlink"}: المالك وحده.
// المتغيرات: GOOGLE_CLIENT_ID وGOOGLE_CLIENT_SECRET في أسرار الدوال؛ ومفتاح الخدمة لا يغادر الخادم.
import { createClient } from "jsr:@supabase/supabase-js@2";

// CORS: موقع المركز وحده (وخادم التطوير المحلي)؛ ALLOWED_ORIGINS في بيئة الدالة يضيف نطاقًا آخر عند الحاجة
const ORIGINS = ["https://shomar1434-jpg.github.io", ...String(Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean)];
const originOk = (o: string) => ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const CORS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};
const withCors = (req: Request, res: Response) => {
  const o = req.headers.get("Origin") || "";
  try { res.headers.set("Access-Control-Allow-Origin", originOk(o) ? o : ORIGINS[0]); } catch (_) { /* ترويسات ثابتة (تحويل) */ }
  return res;
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const ALLOWED_RETURN = /^https:\/\/shomar1434-jpg\.github\.io\/SAMA-ALQODRAT\/admin\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;
const URL_ = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CID = Deno.env.get("GOOGLE_CLIENT_ID") || "", CSEC = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const REDIRECT = `${URL_}/functions/v1/youtube`;
const svc = () => createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function accessToken(refresh: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token: refresh, grant_type: "refresh_token" }) });
  const j = await r.json(); if (!r.ok || !j.access_token) throw new Error("تعذّر تجديد صلاحية القناة؛ أعد ربطها من لوحة الإدارة");
  return j.access_token;
}
async function yt(path: string, token: string) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || "تعذّر الاتصال بيوتيوب"); return j;
}
const page = (title: string, msg: string, back?: string) => new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:system-ui;padding:32px;text-align:center"><h2>${title}</h2><p>${msg}</p>${back ? `<p><a href="${back}">العودة إلى لوحة الإدارة</a></p><script>setTimeout(()=>location.href=${JSON.stringify(back)},1500)</script>` : ""}</body></html>`,
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => withCors(req, await handle(req)));

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);

  // عودة Google بعد الموافقة
  if (req.method === "GET") {
    const code = u.searchParams.get("code") || "", state = u.searchParams.get("state") || "";
    const db = svc(); const { data: a } = await db.from("yt_auth").select("*").eq("id", 1).single();
    if (!a || !state || a.state !== state || !a.state_expires || Date.parse(a.state_expires) < Date.now()) return page("انتهت صلاحية الطلب", "ابدأ ربط القناة من جديد من لوحة الإدارة.");
    const back = (a.return_to || "") + "#admin-studio";
    if (!code) { await db.from("yt_auth").update({ state: null }).eq("id", 1); return page("لم يكتمل الربط", "لم تُمنح الموافقة على قراءة القناة.", back); }
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: CID, client_secret: CSEC, redirect_uri: REDIRECT, grant_type: "authorization_code" }) });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) return page("تعذّر الربط", "لم يُصدر Google رمز تحديث. أزل صلاحية التطبيق من حساب Google ثم أعد المحاولة.", back);
    let ch = { id: "", title: "" };
    try { const c = await yt("channels?part=snippet&mine=true", j.access_token); ch = { id: c.items?.[0]?.id || "", title: c.items?.[0]?.snippet?.title || "" }; } catch { /* يُكمل بلا اسم */ }
    await db.from("yt_auth").update({ refresh_token: j.refresh_token, state: null, state_expires: null, linked_at: new Date().toISOString() }).eq("id", 1);
    await db.rpc("yt_upsert_videos", { p: [], p_channel: ch.id, p_title: ch.title });
    await db.from("audit_logs").insert({ actor: a.linked_by, actor_role: "owner", action: "youtube.link", entity: ch.id || "1", detail: { channel: ch.title } });
    return page("رُبطت القناة", ch.title ? `قناة «${ch.title}». تُجلب البثوث آليًا الآن.` : "تُجلب البثوث آليًا الآن.", back);
  }
  if (req.method !== "POST") return json({ error: "طريقة غير مدعومة" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  let body: { action?: string; return_to?: string; force?: boolean };
  try { body = await req.json(); } catch { return json({ error: "طلب غير صالح" }, 400); }

  if (body.action === "auth_url") {
    if (!CID || !CSEC) return json({ error: "أضف GOOGLE_CLIENT_ID وGOOGLE_CLIENT_SECRET إلى أسرار الدوال في Supabase أولًا" }, 400);
    const ret = String(body.return_to || ""); if (!ALLOWED_RETURN.test(ret)) return json({ error: "رابط العودة غير مسموح" }, 400);
    const s = await asCaller.rpc("yt_begin_link", { p_return: ret });
    if (s.error) return json({ error: s.error.message }, 403);
    const q = new URLSearchParams({ client_id: CID, redirect_uri: REDIRECT, response_type: "code", scope: "https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: String(s.data) });
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
  }
  if (body.action === "unlink") {
    const s = await asCaller.rpc("yt_unlink"); if (s.error) return json({ error: s.error.message }, 403);
    return json({ ok: true });
  }
  if (body.action === "sync") {
    const { data: who } = await asCaller.auth.getUser(); if (!who?.user) return json({ error: "سجّل الدخول" }, 401);
    const force = !!body.force && !!(await asCaller.rpc("is_admin")).data;
    const db = svc(); const due = await db.rpc("yt_sync_due", { p_force: force });
    if (!due.data) return json({ ok: true, skipped: true });
    const { data: a } = await db.from("yt_auth").select("refresh_token").eq("id", 1).single();
    try {
      const tok = await accessToken(a!.refresh_token);
      const items: unknown[] = []; let pageToken = "";
      for (let i = 0; i < 2; i++) {
        const j = await yt(`liveBroadcasts?part=snippet,status&mine=true&broadcastType=all&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`, tok);
        for (const b of j.items || []) items.push({ video_id: b.id, title: b.snippet?.title || "", privacy: b.status?.privacyStatus || "", life_cycle: b.status?.lifeCycleStatus || "",
          scheduled_start: b.snippet?.scheduledStartTime || "", actual_start: b.snippet?.actualStartTime || "", actual_end: b.snippet?.actualEndTime || "",
          thumb: b.snippet?.thumbnails?.medium?.url || "" });
        pageToken = j.nextPageToken || ""; if (!pageToken) break;
      }
      const r = await db.rpc("yt_upsert_videos", { p: items }); if (r.error) throw new Error(r.error.message);
      return json(r.data);
    } catch (e) { return json({ error: (e as Error).message }, 502); }
  }
  return json({ error: "إجراء غير معروف" }, 400);
}
