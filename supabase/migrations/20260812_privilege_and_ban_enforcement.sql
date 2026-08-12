-- Critical launch hardening:
-- 1) Stop clients from self-granting profiles.role = 'admin'
-- 2) Block platform-banned users on sensitive writes (not only client redirects)

-- ---------------------------------------------------------------------------
-- Privilege lock: role column
-- ---------------------------------------------------------------------------
REVOKE INSERT (role) ON public.profiles FROM anon, authenticated;
REVOKE UPDATE (role) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.profiles_enforce_role_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
BEGIN
  -- Service role / SQL editor (no authenticated JWT) may promote admins.
  IF v_jwt_role = 'service_role' OR auth.jwt() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'user';
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'profiles.role cannot be changed by clients'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_enforce_role_immutable ON public.profiles;
CREATE TRIGGER trg_profiles_enforce_role_immutable
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_enforce_role_immutable();

COMMENT ON FUNCTION public.profiles_enforce_role_immutable() IS
  'Force role=user on client inserts; block client role changes. Admins are set via service_role/SQL only.';

-- ---------------------------------------------------------------------------
-- Ban helper for RLS / RPC checks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_is_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_user_banned(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.current_user_is_banned() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_banned() TO authenticated;

-- ---------------------------------------------------------------------------
-- Messages: also block platform bans (chat suspension already enforced)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Send message if in conversation" ON public.messages;

CREATE POLICY "Send message if in conversation"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND NOT public.current_user_is_banned()
    AND NOT public.user_chat_is_suspended((SELECT auth.uid()))
    AND (
      EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
          AND cp.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.conversations c
        JOIN public.court_subscriptions cs
          ON cs.court_id = c.court_id
         AND cs.user_id = (SELECT auth.uid())
        WHERE c.id = messages.conversation_id
          AND c.type = 'court'
      )
    )
  );

COMMENT ON POLICY "Send message if in conversation" ON public.messages IS
  'Participant or court subscriber; sender must not be platform-banned or chat-suspended.';

-- ---------------------------------------------------------------------------
-- Friend requests + content reports
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert friend requests as sender" ON public.friend_requests;
CREATE POLICY "Users can insert friend requests as sender"
  ON public.friend_requests FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND NOT public.current_user_is_banned()
  );

DROP POLICY IF EXISTS "Users insert own reports" ON public.content_reports;
CREATE POLICY "Users insert own reports"
  ON public.content_reports FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND NOT public.current_user_is_banned()
  );

-- ---------------------------------------------------------------------------
-- DM RPC: security definer bypasses RLS — enforce ban inside the function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_conv_id uuid;
  v_user_a uuid;
  v_user_b uuid;
BEGIN
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.is_user_banned(v_my_id) THEN
    RAISE EXCEPTION 'Account suspended';
  END IF;
  IF p_other_user_id IS NULL OR v_my_id = p_other_user_id THEN
    RETURN NULL;
  END IF;

  v_user_a := least(v_my_id, p_other_user_id);
  v_user_b := greatest(v_my_id, p_other_user_id);

  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1
    ON cp1.conversation_id = c.id AND cp1.user_id = v_user_a
  JOIN public.conversation_participants cp2
    ON cp2.conversation_id = c.id AND cp2.user_id = v_user_b
  WHERE c.type = 'dm'
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (type) VALUES ('dm') RETURNING id INTO v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_user_a);
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_user_b);
  END IF;

  RETURN v_conv_id;
END;
$$;

-- Accept friend request also bypasses RLS — block banned receivers.
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_id uuid := auth.uid();
  v_sender_id uuid;
BEGIN
  IF v_receiver_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.is_user_banned(v_receiver_id) THEN
    RAISE EXCEPTION 'Account suspended';
  END IF;

  SELECT sender_id INTO v_sender_id
  FROM public.friend_requests
  WHERE id = p_request_id
    AND receiver_id = v_receiver_id
    AND status = 'pending';

  IF v_sender_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.friend_requests SET status = 'accepted' WHERE id = p_request_id;

  INSERT INTO public.friendships (user_id, friend_id) VALUES (v_receiver_id, v_sender_id);
  INSERT INTO public.friendships (user_id, friend_id) VALUES (v_sender_id, v_receiver_id);
END;
$$;
