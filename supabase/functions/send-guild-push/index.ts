import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if ((req.headers.get("Authorization") || "") !== `Bearer ${serviceRoleKey}`) return new Response("Unauthorized", { status: 401 });
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return Response.json({ error: "Missing VAPID secrets" }, { status: 500 });
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const { data: queue, error: queueError } = await supabase.from("guild_notification_queue")
    .select("id,user_id,notification_type,title,body,payload,attempts").is("sent_at", null)
    .order("created_at", { ascending: true }).limit(100);
  if (queueError) return Response.json({ error: queueError.message }, { status: 500 });

  let sent = 0, expired = 0, failed = 0;
  for (const item of queue || []) {
    const { data: subscriptions, error: subError } = await supabase.from("guild_push_subscriptions")
      .select("id,endpoint,p256dh,auth_key").eq("user_id", item.user_id);
    if (subError) { failed++; await supabase.from("guild_notification_queue").update({ attempts: (item.attempts || 0) + 1 }).eq("id", item.id); continue; }
    let transient = false;
    for (const sub of subscriptions || []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title: item.title, body: item.body, data: { url: "/Myweb1/" }, tag: `${item.notification_type}-${item.id}` }));
        sent++;
      } catch (error) {
        const code = Number((error as { statusCode?: number })?.statusCode || 0);
        if (code === 404 || code === 410) {
          await supabase.from("guild_push_subscriptions").delete().eq("id", sub.id); expired++;
        } else { transient = true; console.error("Push send failed", item.id, code, error); }
      }
    }
    if (transient && (item.attempts || 0) < 3) {
      await supabase.from("guild_notification_queue").update({ attempts: (item.attempts || 0) + 1 }).eq("id", item.id);
    } else {
      await supabase.from("guild_notification_queue").update({ sent_at: new Date().toISOString(), attempts: (item.attempts || 0) + (transient ? 1 : 0) }).eq("id", item.id);
    }
  }
  return Response.json({ processed: queue?.length || 0, sent, expired, failed });
});
