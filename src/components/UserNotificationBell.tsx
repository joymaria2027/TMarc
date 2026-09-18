import { useState } from "react";
import { Bell, Check, Info, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserNotifications, type UserNotification } from "@/hooks/useUserNotifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type { UserNotification };

export default function UserNotificationBell({ className }: { className?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    announcement,
    markAsRead,
    markAllAsRead,
  } = useUserNotifications();

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
