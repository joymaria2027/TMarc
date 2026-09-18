import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

type Payload = { eventType?: string; new?: any; old?: any };

const { handlers, channels, mockSupabase, mockToast, mockUser } = vi.hoisted(() => {
  const handlers: Record<string, ((p: Payload) => void)[]> = {};
  const channels: string[] = [];
  const removedChannels: unknown[] = [];

  const mockSupabase = {
    channel: vi.fn((name: string) => {
      channels.push(name);
      const fakeChannel = {
        on: vi.fn((_event: string, filter: { event: string }, cb: (p: Payload) => void) => {
          if (!handlers[filter.event]) handlers[filter.event] = [];
          handlers[filter.event].push(cb);
          return fakeChannel;
        }),
        subscribe: vi.fn(() => fakeChannel),
      };
      return fakeChannel;
    }),
    removeChannel: vi.fn((ch: unknown) => {
      removedChannels.push(ch);
    }),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "notif-1",
            user_id: "user-123",
            title: "Welcome",
            message: "Welcome to DeliveryAce",
            type: "general",
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    })),
  };

  const mockToast = {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  };

  const mockUser = { current: { id: "user-123" } as { id: string } | null };

  return { handlers, channels, removedChannels, mockSupabase, mockToast, mockUser };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("sonner", () => ({ toast: mockToast }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

import { useUserNotifications, _resetNotificationStoreForTesting } from "../useUserNotifications";

describe("useUserNotifications hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetNotificationStoreForTesting();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    channels.length = 0;
    mockUser.current = { id: "user-123" };
  });

  it("creates only one Supabase channel even when multiple hooks mount concurrently", async () => {
    const hook1 = renderHook(() => useUserNotifications());
    const hook2 = renderHook(() => useUserNotifications());

    await waitFor(() => {
      expect(hook1.result.current.notifications.length).toBeGreaterThanOrEqual(1);
    });

    // Despite two concurrent hook instances (e.g. desktop + mobile navs), exactly 1 channel was created
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
    expect(channels[0]).toContain("user-notifs-user-123-");

    hook1.unmount();
    hook2.unmount();
  });

  it("shares state between consumers and updates when a new notification is inserted", async () => {
    const hook1 = renderHook(() => useUserNotifications());
    const hook2 = renderHook(() => useUserNotifications());

    await waitFor(() => {
      expect(hook1.result.current.notifications.length).toBe(1);
    });

    // Simulate Realtime INSERT
    const newNotif = {
      id: "notif-2",
      user_id: "user-123",
      title: "Wholesale application approved",
      message: "You can now order wholesale.",
      type: "wholesale_approved",
      is_read: false,
      created_at: new Date().toISOString(),
    };

    act(() => {
      handlers["INSERT"]?.forEach((fn) => fn({ new: newNotif }));
    });

    // Both hooks reflect the new notification without duplicate state or duplicate toasts
    expect(hook1.result.current.notifications).toHaveLength(2);
    expect(hook2.result.current.notifications).toHaveLength(2);
    expect(hook1.result.current.unreadCount).toBe(2);
    expect(hook2.result.current.unreadCount).toBe(2);

    // Toast fired exactly once
    expect(mockToast.success).toHaveBeenCalledTimes(1);
    expect(mockToast.success).toHaveBeenCalledWith("Wholesale application approved", {
      description: "You can now order wholesale.",
    });

    hook1.unmount();
    hook2.unmount();
  });

  it("synchronizes markAsRead across all consumers", async () => {
    const hook1 = renderHook(() => useUserNotifications());
    const hook2 = renderHook(() => useUserNotifications());

    await waitFor(() => {
      expect(hook1.result.current.notifications.length).toBeGreaterThanOrEqual(1);
    });

    await act(async () => {
      await hook1.result.current.markAsRead("notif-1");
    });

    expect(hook1.result.current.notifications.find((n) => n.id === "notif-1")?.is_read).toBe(true);
    expect(hook2.result.current.notifications.find((n) => n.id === "notif-1")?.is_read).toBe(true);
    expect(hook1.result.current.unreadCount).toBe(0);
    expect(hook2.result.current.unreadCount).toBe(0);

    hook1.unmount();
    hook2.unmount();
  });
});
