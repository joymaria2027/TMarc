import { useEffect, useState, useCallback } from "react";
import { Bell, Check, Info, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

export default function UserNotificationBell({ className }: { className?: string }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const { data, error } = await (supabase
      .from("user_notifications" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30) as any);

    if (!error && data) {
      setNotifications(data as UserNotification[]);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription for notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user-notifs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as UserNotification;
          setNotifications(prev => [newNotif, ...prev.filter(n => n.id !== newNotif.id)]);
          setAnnouncement(`New notification: ${newNotif.title}`);

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
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as UserNotification;
          setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (id: string) => {
    const target = notifications.find(n => n.id === id);
    if (!target || target.is_read) return;

    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await (supabase
      .from("user_notifications" as any)
      .update({ is_read: true })
      .eq("id", id) as any);
    setAnnouncement("Notification marked as read");
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0 || !user) return;

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await (supabase
      .from("user_notifications" as any)
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false) as any);
    setAnnouncement("All notifications marked as read");
  };

  if (!user) return null;

  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative min-h-[44px] min-w-[44px]", className)}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground tabular-nums"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 sm:w-96 p-0 shadow-lg">
          <div className="flex items-center justify-between border-b p-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
                aria-label="Mark all notifications as read"
              >
                <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Mark all read
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y" role="region" aria-label="Notification list">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No notifications yet.
              </div>
            ) : (
              notifications.map(n => {
                const isWholesaleApproved = n.type === "wholesale_approved";
                const isWholesaleRejected = n.type === "wholesale_rejected";

                return (
                  <div
                    key={n.id}
                    className={cn(
                      "p-3.5 text-sm transition-colors cursor-pointer hover:bg-muted/50 flex items-start gap-3",
                      !n.is_read ? "bg-muted/20" : "opacity-80"
                    )}
                    onClick={() => markAsRead(n.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        markAsRead(n.id);
                      }
                    }}
                    aria-label={`${n.is_read ? "" : "Unread: "}${n.title}`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isWholesaleApproved ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                      ) : isWholesaleRejected ? (
                        <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                      ) : (
                        <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn("text-xs font-semibold truncate", !n.is_read ? "text-foreground" : "text-muted-foreground")}>
                          {n.title}
                        </p>
                        <time className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </time>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed break-words">
                        {n.message}
                      </p>
                    </div>
                    {!n.is_read && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" aria-hidden="true" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
