import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Shape persisted by /dashboard/settings.tsx — keep keys aligned.
export interface NotificationPrefs {
  cycleReminders: boolean;
  appointmentReminders: boolean;
  healthTips: boolean;
}

const DEFAULTS: NotificationPrefs = {
  cycleReminders: true,
  appointmentReminders: true,
  healthTips: true,
};

const storageKeyFor = (userId: string | undefined) =>
  userId ? `womanie_notification_prefs_${userId}` : 'womanie_notification_prefs';

function readPrefs(userId: string | undefined): NotificationPrefs {
  try {
    const raw = localStorage.getItem(storageKeyFor(userId));
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Reactive hook over the per-user notification preferences. Re-reads when
 * the user changes and listens for `storage` events so that flipping a
 * toggle in another tab takes effect immediately without a refresh.
 */
export function useNotificationPrefs(): NotificationPrefs {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => readPrefs(user?.id));

  useEffect(() => {
    setPrefs(readPrefs(user?.id));
  }, [user?.id]);

  useEffect(() => {
    const key = storageKeyFor(user?.id);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setPrefs(readPrefs(user?.id));
    };
    // Same-tab updates: poll on focus since `storage` only fires across tabs.
    const onFocus = () => setPrefs(readPrefs(user?.id));
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id]);

  return prefs;
}
