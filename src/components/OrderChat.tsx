import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { toast } from "sonner";
import { ArrowDown, Send } from "lucide-react";
import { haptics } from "@/lib/haptics";

type Msg = {
  id: string;
  order_id: string;
  sender_user_id: string;
  sender_role: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function OrderChat({
  orderId,
  senderRole,
  onLastMessage,
}: {
  orderId: string;
  senderRole: "customer" | "merchant" | "admin";
  /** F8: lets a collapsed chat header show the last message without a tap. */
  onLastMessage?: (msg: { body: string; created_at: string; mine: boolean } | null) => void;
}) {
  const { user } = useAuth();
  // Bubble sides mirror by viewer role (customer left / merchant right from
  // merchant POV and vice versa). Identity (user.id) is only for read
  // receipts + previews — one account can hold both roles.
  const counterpart = senderRole === "customer" ? "merchant" : "customer";
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewPill, setShowNewPill] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputId = `chat-input-${orderId}`;

  const isNearBottom = () => {
    const el = viewportRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  const load = async () => {
    const { data } = await supabase
      .from("order_messages")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    setMessages((prev) => {
      const next = (data as any) || [];
      // F8: surface the last message so a collapsed header can preview it.
      const last = next.length > 0 ? next[next.length - 1] : null;
      onLastMessage?.(
        last
          ? { body: last.body, created_at: last.created_at, mine: last.sender_user_id === user?.id }
          : null,
      );
      // Only auto-scroll if user was already near bottom; otherwise show pill
      const stuckToBottom = isNearBottom();
      requestAnimationFrame(() => {
        if (stuckToBottom) {
          endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
        } else {
          setShowNewPill(true);
        }
      });
      return next;
    });
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`order-messages-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    // mark inbound unread as read — only runs while chat is mounted (explicitly opened)
    const unread = messages.filter((m) => !m.read_at && m.sender_user_id !== user?.id).map((m) => m.id);
    if (unread.length > 0 && user) {
      supabase.from("order_messages").update({ read_at: new Date().toISOString() }).in("id", unread).then(() => {});
    }
  }, [messages, user]);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    setShowNewPill(false);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !user) return;
    setSending(true);
    const { error } = await supabase.from("order_messages").insert({
      order_id: orderId,
      sender_user_id: user.id,
      sender_role: senderRole,
      body,
    });
    setSending(false);
    if (error) {
      await haptics.error();
      return toast.error(error.message);
    }
    await haptics.success();
    setText("");
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  };

  const copyText = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      await haptics.success();
      toast.success("Message copied");
    } catch {
      await haptics.error();
      toast.error("Could not copy message");
    }
  };

  const setViewportFromRoot = useCallback((root: HTMLDivElement | null) => {
    if (!root) {
      viewportRef.current = null;
      return;
    }
    // Radix ScrollArea renders [data-radix-scroll-area-viewport] inside
    const vp = root.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    viewportRef.current = vp ?? root;
  }, []);

  return (
    <div className="border rounded-md flex flex-col h-[50vh] max-h-[420px] bg-background">
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Messages with ${counterpart}`}
        className="flex-1 min-h-0"
      >
        <ScrollArea className="h-full p-3">
          <div ref={setViewportFromRoot} className="h-full">
            {messages.length === 0 ? (
              <p role="status" className="text-sm text-muted-foreground text-center py-6">
                No messages yet. Start the conversation.
              </p>
            ) : (
              <ul className="space-y-2">
                {messages.map((m) => {
                  const mine = m.sender_role === senderRole;
                  return (
                    <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            tabIndex={0}
                            role="button"
                            aria-label={`Message from ${m.sender_role}: ${m.body}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                copyText(m.body);
                                haptics.selectionChanged();
                              }
                            }}
                            className={`max-w-[75%] rounded-lg px-3 py-2 text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                            }`}
                          >
                            <div className="text-xs font-medium mb-0.5 uppercase">{m.sender_role}</div>
                            <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            <div className="text-xs mt-1">
                              <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString()}</time>
                            </div>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={() => copyText(m.body)}>Copy message</ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </li>
                  );
                })}
                <div ref={endRef} />
              </ul>
            )}
          </div>
        </ScrollArea>
      </div>
      {showNewPill && (
        <div className="flex justify-center -mb-2 z-10">
          <Button variant="secondary" size="sm" onClick={scrollToBottom} className="shadow-md">
            <ArrowDown className="h-4 w-4" aria-hidden="true" /> New messages
          </Button>
        </div>
      )}
      <form
        className="border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Message {counterpart}
        </label>
        <Input
          id={inputId}
          value={text}
          placeholder="Type a message…"
          aria-label={`Message ${counterpart}`}
          type="text"
          enterKeyHint="send"
          autoCapitalize="sentences"
          autoCorrect="on"
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button
          size="icon"
          type="submit"
          disabled={sending || !text.trim()}
          aria-label="Send message"
          aria-disabled={sending || !text.trim()}
          className="shrink-0"
        >
          <Send className="h-5 w-5" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
