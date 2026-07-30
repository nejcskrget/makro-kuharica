import { supabase } from "../supabaseClient";

const SERVICE_WORKER_URL = "/service-worker.js";

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);

  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function getPushSupport() {
  if (!window.isSecureContext) {
    return { supported: false, reason: "Obvestila delujejo samo prek varne povezave HTTPS." };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { supported: false, reason: "Ta brskalnik ne podpira PWA potisnih obvestil." };
  }
  return { supported: true, reason: null };
}

export async function registerNotificationServiceWorker() {
  const support = getPushSupport();
  if (!support.supported) return null;

  return navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
}

export async function getCurrentPushSubscription() {
  const registration = await registerNotificationServiceWorker();
  if (!registration) return null;

  return registration.pushManager.getSubscription();
}

export async function enablePushNotifications(userId) {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error("Manjka VITE_VAPID_PUBLIC_KEY. Dokončaj nastavitev Web Push v okolju za objavo.");
  }

  const support = getPushSupport();
  if (!support.supported) throw new Error(support.reason);

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Obvestila so blokirana. Omogoči jih v nastavitvah brskalnika ali naprave."
        : "Brez dovoljenja opomnika ni mogoče vključiti."
    );
  }

  const registration = await registerNotificationServiceWorker();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Ljubljana",
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    await subscription.unsubscribe();
    throw error;
  }

  return subscription;
}

export async function disablePushNotifications() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint);

  if (error) throw error;
  await subscription.unsubscribe();
}

export async function syncPushSubscription(userId) {
  if (!userId || Notification.permission !== "granted") return null;

  const subscription = await getCurrentPushSubscription();
  if (!subscription) return null;

  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Ljubljana",
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) throw error;
  return subscription;
}
