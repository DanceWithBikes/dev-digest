"use client";

import { createContext, forwardRef, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";
import type { User } from "@devdigest/shared";

type Theme = "light" | "dark";

interface AppContextValue {
  user: User | null;
  theme: Theme;
  toasts: string[];
  sidebarOpen: boolean;
  setUser: (user: User | null) => void;
  setTheme: (theme: Theme) => void;
  pushToast: (message: string) => void;
  toggleSidebar: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProviders");
  return ctx;
}

function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    track("page_view", { path: pathname });
  }, [pathname]);
  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [toasts, setToasts] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      theme,
      toasts,
      sidebarOpen,
      setUser,
      setTheme,
      pushToast: (message) => setToasts((prev) => [...prev, message]),
      toggleSidebar: () => setSidebarOpen((open) => !open),
    }),
    [user, theme, toasts, sidebarOpen],
  );

  return (
    <AppContext.Provider value={value}>
      <PageViewTracker />
      {children}
    </AppContext.Provider>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input">>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={`rounded border px-2 py-1 ${className ?? ""}`} {...rest} />;
  },
);
