import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { fetchBlockedUserIds } from "../lib/blocking";

export function useBlockedUserIds() {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setBlockedIds(new Set());
      setLoading(false);
      return new Set<string>();
    }
    setLoading(true);
    const ids = await fetchBlockedUserIds(user.id);
    setBlockedIds(ids);
    setLoading(false);
    return ids;
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { blockedIds, loading, refresh };
}
