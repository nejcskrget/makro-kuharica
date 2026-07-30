import { useCallback, useEffect, useState } from "react";
import {
  disablePushNotifications,
  enablePushNotifications,
  getCurrentPushSubscription,
  getPushSupport,
  syncPushSubscription,
} from "./pushNotifications";

export function usePushNotifications(userId) {
  const support = getPushSupport();
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(support.reason);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      if (!support.supported) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }

      try {
        const subscription = await getCurrentPushSubscription();
        if (cancelled) return;
        setStatus(subscription ? "enabled" : "disabled");

        if (subscription && userId) {
          await syncPushSubscription(userId);
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatus("disabled");
          setError(loadError.message);
        }
      }
    }

    loadStatus();
    return () => {
      cancelled = true;
    };
  }, [support.supported, userId]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePushNotifications(userId);
      setStatus("enabled");
    } catch (enableError) {
      setStatus(Notification.permission === "denied" ? "denied" : "disabled");
      setError(enableError.message);
    } finally {
      setBusy(false);
    }
  }, [userId]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disablePushNotifications();
      setStatus("disabled");
    } catch (disableError) {
      setError(disableError.message);
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, enable, disable };
}
