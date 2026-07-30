import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const REMINDER_HOUR = 6;
const REMINDER_MINUTE_FROM = 30;
const REMINDER_MINUTE_TO = 34;
const DEFAULT_TIMEZONE = "Europe/Ljubljana";
const NOTIFICATION = JSON.stringify({
  title: "Makro kuharica",
  body: "Ali si se danes že stehtal/a?",
});

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string;
  last_notified_on: string | null;
};

function getLocalTime(now: Date, timezone: string) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return getLocalTime(now, DEFAULT_TIMEZONE);
  }

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return Response.json({ error: "Missing required environment variables." }, { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, timezone, last_notified_on")
    .eq("enabled", true);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const subscription of (data || []) as PushSubscriptionRow[]) {
    const local = getLocalTime(now, subscription.timezone || DEFAULT_TIMEZONE);
    const isReminderWindow =
      local.hour === REMINDER_HOUR &&
      local.minute >= REMINDER_MINUTE_FROM &&
      local.minute <= REMINDER_MINUTE_TO;

    if (!isReminderWindow || subscription.last_notified_on === local.date) continue;

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        NOTIFICATION,
        { TTL: 60 * 60 }
      );

      const { error: updateError } = await supabase
        .from("push_subscriptions")
        .update({ last_notified_on: local.date, updated_at: now.toISOString() })
        .eq("id", subscription.id);

      if (updateError) throw updateError;
      sent += 1;
    } catch (sendError) {
      const statusCode =
        typeof sendError === "object" && sendError && "statusCode" in sendError
          ? Number(sendError.statusCode)
          : 0;

      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
        removed += 1;
      } else {
        console.error("Push failed", subscription.id, sendError);
        failed += 1;
      }
    }
  }

  return Response.json({ checked: data?.length || 0, sent, removed, failed });
});
