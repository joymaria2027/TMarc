import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Send } from "lucide-react";

type Msg = {
  id: string;
  order_id: string;
  sender_user_id: string;
  sender_role: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export default function OrderChat({
  orderId,
  senderRole,
}: {
  orderId: string;
  senderRole: "customer" | "merchant" | "admin";
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("order_messages")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    setMessages((data as any) || []);
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
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    // mark inbound unread as read
    const unread = messages.filter((m) => !m.read_at && m.sender_user_id !== user?.id).map((m) => m.id);
    if (unread.length > 0 && user) {
      supabase.from("order_messages").update({ read_at: new Date().toISOString() }).in("id", unread).then(() => {});
    }
  }, [messages, user]);

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
    if (error) return toast.error(error.message);
    setText("");
  };

  return (
    <div className="border rounded-md flex flex-col h-72 bg-background">
      <ScrollArea className="flex-1 p-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No messages yet. Start the conversation.</p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const mine = m.sender_user_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <div className="text-[10px] opacity-70 mb-0.5 uppercase">{m.sender_role}</div>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className="text-[10px] opacity-60 mt-1">
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </ScrollArea>
      <div className="border-t p-2 flex gap-2">
        <Input
          value={text}
          placeholder="Type a message…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button size="icon" onClick={send} disabled={sending || !text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
