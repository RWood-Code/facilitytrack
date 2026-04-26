import { createContext, useContext, useState, useEffect } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import type { AppUser } from "@workspace/api-client-react";

export type AppRole = "superuser" | "admin" | "user";

export function isAdminOrHigher(role: AppRole | string | undefined): boolean {
  return role === "superuser" || role === "admin";
}

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const { data: user, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      retryOnMount: false,
    },
  });

  useEffect(() => {
    if (!isLoading) setReady(true);
  }, [isLoading]);

  return (
    <AuthContext.Provider value={{ user: ready ? (user ?? null) : null, isLoading: !ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
