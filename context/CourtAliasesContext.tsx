import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type CourtAliasesContextValue = {
  getDisplayName: (courtId: string, fallback: string) => string;
  refresh: () => Promise<void>;
};

const CourtAliasesContext = createContext<CourtAliasesContextValue | undefined>(
  undefined
);

export function CourtAliasesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [aliasMap, setAliasMap] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setAliasMap({});
      return;
    }
    const { data } = await supabase
      .from("user_court_aliases")
      .select("court_id, custom_name")
      .eq("user_id", user.id);
    setAliasMap(
      Object.fromEntries((data ?? []).map((r) => [r.court_id, r.custom_name]))
    );
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getDisplayName = useCallback(
    (courtId: string, fallback: string) => aliasMap[courtId] ?? fallback,
    [aliasMap]
  );

  return (
    <CourtAliasesContext.Provider value={{ getDisplayName, refresh }}>
      {children}
    </CourtAliasesContext.Provider>
  );
}

export function useCourtAliasesContext(): CourtAliasesContextValue {
  const ctx = useContext(CourtAliasesContext);
  if (!ctx) {
    return {
      getDisplayName: (_: string, fallback: string) => fallback,
      refresh: async () => {},
    };
  }
  return ctx;
}
