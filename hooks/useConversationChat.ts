import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useProfile } from '../context/ProfileContext';
import type { Message } from '../types/chat';
import {
  checkMessageClient,
  parseMessageInsertModerationError,
} from '../lib/chatModeration';

export type SendMessageResult =
  | { ok: true }
  | { ok: false; blocked: true; reason: string }
  | { ok: false; blocked: false; error: string };

export type MessageActionResult =
  | { ok: true }
  | { ok: false; blocked?: boolean; reason?: string; error?: string };

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
};

function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  }) as T;
}

const TYPING_TIMEOUT_MS = 4000;

export function useConversationChat(conversationId: string | undefined) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [onlineUsers, setOnlineUsers] = useState<Record<string, unknown[]>>({});
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const senderCacheRef = useRef<
    Map<string, { username: string | null; profile_image_url: string | null }>
  >(new Map());

  // Fetch initial messages
  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchMessages() {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select(
          'id, conversation_id, sender_id, content, created_at, edited_at, deleted_at',
        )
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error('Error fetching messages:', error);
        setMessages([]);
      } else {
        const senderIds = [...new Set((data ?? []).map((m) => m.sender_id))];
        let senderMap: Record<string, { username: string | null; profile_image_url: string | null }> = {};

        if (senderIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, profile_image_url')
            .in('id', senderIds);

          if (profiles) {
            senderMap = Object.fromEntries(
              profiles.map((p) => [p.id, { username: p.username ?? null, profile_image_url: p.profile_image_url ?? null }])
            );
          }
        }

        const formatted: Message[] = (data ?? []).map((m) => ({
          ...m,
          sender: senderMap[m.sender_id],
        }));
        for (const m of formatted) {
          if (m.sender) {
            senderCacheRef.current.set(m.sender_id, m.sender);
          }
        }
        setMessages(formatted);
      }
      setLoading(false);
    }

    fetchMessages();
    return () => {
      mounted = false;
      senderCacheRef.current.clear();
    };
  }, [conversationId]);

  // Realtime: postgres_changes, presence, broadcast
  useEffect(() => {
    if (!conversationId || !user?.id) return;

    const channel = supabase.channel(`chat:${conversationId}`, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as MessageRow;

          let sender = senderCacheRef.current.get(newMsg.sender_id);
          if (!sender) {
            const { data: profileRow } = await supabase
              .from('profiles')
              .select('username, profile_image_url')
              .eq('id', newMsg.sender_id)
              .maybeSingle();

            if (profileRow) {
              sender = {
                username: profileRow.username ?? null,
                profile_image_url: profileRow.profile_image_url ?? null,
              };
              senderCacheRef.current.set(newMsg.sender_id, sender);
            }
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) {
              return prev;
            }
            return [...prev, { ...newMsg, sender }];
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as MessageRow;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id ? { ...m, ...updated } : m,
            ),
          );
        },
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineUsers(state);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { user_id, username } = payload as { user_id: string; username: string };
        if (user_id === user.id) return;

        setTypingUsers((prev) => ({ ...prev, [user_id]: username ?? 'Someone' }));

        if (typingTimeoutsRef.current[user_id]) {
          clearTimeout(typingTimeoutsRef.current[user_id]);
        }
        typingTimeoutsRef.current[user_id] = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[user_id];
            return next;
          });
          delete typingTimeoutsRef.current[user_id];
        }, TYPING_TIMEOUT_MS);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            username: profile?.username ?? 'Anonymous',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channelRef.current = null;
      channel.untrack();
      supabase.removeChannel(channel);
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
    };
  }, [conversationId, user?.id, profile?.username]);

  const sendMessage = useCallback(
    async (content: string): Promise<SendMessageResult> => {
      const trimmed = content.trim();
      if (!trimmed || !conversationId || !user?.id) {
        return { ok: false, blocked: false, error: 'Missing content' };
      }

      const until = profile?.chat_suspended_until;
      if (until && new Date(until).getTime() > Date.now()) {
        return {
          ok: false,
          blocked: true,
          reason:
            'Your account cannot send messages right now. If you think this is a mistake, contact support.',
        };
      }

      setSending(true);
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmed,
      });
      setSending(false);

      if (error) {
        console.error('Error sending message:', error);
        const moderation = parseMessageInsertModerationError(error);
        if (moderation.blocked) {
          return { ok: false, blocked: true, reason: moderation.reason };
        }
        const msg = error.message ?? '';
        const looksSuspended =
          /row-level security|violates|policy|permission denied/i.test(msg);
        if (looksSuspended) {
          return {
            ok: false,
            blocked: true,
            reason:
              'You may not be able to send messages right now (for example during a safety review).',
          };
        }
        return {
          ok: false,
          blocked: false,
          error: msg || 'Could not send your message. Check your connection and try again.',
        };
      }

      return { ok: true };
    },
    [conversationId, user?.id, profile?.chat_suspended_until],
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string): Promise<MessageActionResult> => {
      const trimmed = newContent.trim();
      if (!trimmed || !user?.id) {
        return { ok: false, error: 'Message cannot be empty' };
      }

      const clientCheck = checkMessageClient(trimmed);
      if (clientCheck.blocked) {
        return { ok: false, blocked: true, reason: clientCheck.reason };
      }

      setSending(true);
      const editedAt = new Date().toISOString();
      const { error } = await supabase
        .from('messages')
        .update({ content: trimmed, edited_at: editedAt })
        .eq('id', messageId)
        .eq('sender_id', user.id);
      setSending(false);

      if (error) {
        const moderation = parseMessageInsertModerationError(error);
        if (moderation.blocked) {
          return { ok: false, blocked: true, reason: moderation.reason };
        }
        return { ok: false, error: error.message };
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: trimmed, edited_at: editedAt }
            : m,
        ),
      );
      return { ok: true };
    },
    [user?.id],
  );

  const unsendMessage = useCallback(
    async (messageId: string): Promise<MessageActionResult> => {
      if (!user?.id) {
        return { ok: false, error: 'Not signed in' };
      }

      setSending(true);
      const deletedAt = new Date().toISOString();
      const { error } = await supabase
        .from('messages')
        .update({ deleted_at: deletedAt })
        .eq('id', messageId)
        .eq('sender_id', user.id);
      setSending(false);

      if (error) {
        return { ok: false, error: error.message };
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, deleted_at: deletedAt } : m,
        ),
      );
      return { ok: true };
    },
    [user?.id],
  );

  const sendTyping = useCallback(
    debounce(() => {
      if (!user?.id) return;
      const ch = channelRef.current;
      if (ch) {
        ch.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: user.id, username: profile?.username ?? 'Anonymous' },
        });
      }
    }, 300),
    [user?.id, profile?.username]
  );

  return {
    messages,
    loading,
    sending,
    typingUsers,
    onlineUsers,
    sendMessage,
    editMessage,
    unsendMessage,
    sendTyping,
  };
}
