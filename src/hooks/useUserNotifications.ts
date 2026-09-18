import { useSyncExternalStore, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface UserNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  metadata?: Record<string, any> | null;
  created_at: string;
}

interface NotificationState {
  notifications: UserNotification[];
  announcement: string;
}

let activeUserId: string | null = null;
let currentState: NotificationState = {
  notifications: [],
  announcement: "",
};
let activeChannel: RealtimeChannel | null = null;
let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function updateState(updater: (prev: NotificationState) => NotificationState) {
  currentState = updater(currentState);
  notifyListeners();
}

async function fetchNotifications(userId: string) {
  try {
    const { data, error } = await (supabase
      .from("user_notifications" as any)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30) as any);

    if (!error && data && activeUserId === userId) {
      updateState((prev) => ({
        ...prev,
        notifications: data as UserNotification[],
      }));
    }
  } catch (err) {
    console.error("Failed to fetch user notifications:", err);
  }
}

function subscribeToRealtime(userId: string) {
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
    cleanupTimeout = null;
  }

  // If already subscribed for this user, do not recreate
  if (activeUserId === userId && activeChannel) {
    return;
  }

  // Clean up any previous user's channel
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }

  activeUserId = userId;
  fetchNotifications(userId);

  // Use a unique random suffix so each channel registration is pristine and never collides with an existing topic
  const channelSuffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 9);
  const topic = `user-notifs-${userId}-${channelSuffix}`;

  activeChannel = supabase
    .channel(topic)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newNotif = payload.new as UserNotification;
        updateState((prev) => ({
          announcement: `New notification: ${newNotif.title}`,
          notifications: [newNotif, ...prev.notifications.filter((n) => n.id !== newNotif.id)],
        }));

        if (newNotif.type === "wholesale_approved") {
          toast.success(newNotif.title, { description: newNotif.message });
        } else if (newNotif.type === "wholesale_rejected") {
          toast.error(newNotif.title, { description: newNotif.message });
        } else {
          toast.info(newNotif.title, { description: newNotif.message });
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "user_notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const updated = payload.new as UserNotification;
        updateState((prev) => ({
          ...prev,
          notifications: prev.notifications.map((n) => (n.id === updated.id ? updated : n)),
        }));
      }
    )
    .subscribe();
}

function unsubscribeRealtime() {
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
    cleanupTimeout = null;
  }
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }
  activeUserId = null;
  currentState = {
    notifications: [],
    announcement: "",
  };
  notifyListeners();
}

export function _resetNotificationStoreForTesting() {
  unsubscribeRealtime();
  listeners.clear();
}

export function useUserNotifications() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      if (activeUserId !== null) {
        unsubscribeRealtime();
      }
      return;
    }

    if (activeUserId !== userId || !activeChannel) {
      subscribeToRealtime(userId);
    }
  }, [userId]);

  const state = useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0 && activeChannel) {
          cleanupTimeout = setTimeout(() => {
            if (listeners.size === 0) {
              unsubscribeRealtime();
            }
          }, 1000);
        }
      };
    },
    () => currentState,
    () => currentState
  );

  const markAsRead = useCallback(
    async (id: string) => {
      const target = state.notifications.find((n) => n.id === id);
      if (!target || target.is_read) return;

      updateState((prev) => ({
        announcement: "Notification marked as read",
        notifications: prev.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      }));

      await (supabase
        .from("user_notifications" as any)
        .update({ is_read: true })
        .eq("id", id) as any);
    },
    [state.notifications]
  );

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const hasUnread = state.notifications.some((n) => !n.is_read);
    if (!hasUnread) return;

    updateState((prev) => ({
      announcement: "All notifications marked as read",
      notifications: prev.notifications.map((n) => ({ ...n, is_read: true })),
    }));

    await (supabase
      .from("user_notifications" as any)
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false) as any);
  }, [userId, state.notifications]);

  return {
    notifications: state.notifications,
    unreadCount: state.notifications.filter((n) => !n.is_read).length,
    announcement: state.announcement,
    markAsRead,
    markAllAsRead,
  };
}
