import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { CloudApi, mergeEvents, type Pending } from "./lib/progress";
import type { ProgressEvent } from "./lib/schema";
const apiBase =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "";
function takeToken() {
  const h = location.hash;
  const match = h.match(/[?&]session=([^&]+)/);
  if (!match) return "";
  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return "";
  }
  if (token.length > 4096) return "";
  const channel = h.match(/[?&]channel=([0-9a-f-]{36})/);
  if (channel && typeof BroadcastChannel !== "undefined") {
    const bridge = new BroadcastChannel("chess-studio-auth-" + channel[1]);
    bridge.postMessage({ type: "chess-studio-session", token });
    setTimeout(() => bridge.close(), 1000);
  }
  history.replaceState(null, "", location.pathname + "#/progress");
  return token;
}
const initialToken = takeToken();
interface Studio {
  events: ProgressEvent[];
  pending: Pending[];
  loading: boolean;
  hydrated: boolean;
  cloudError: string;
  authenticated: boolean;
  configured: boolean;
  login: () => void;
  logout: () => void;
  save: (e: ProgressEvent) => void;
  retry: () => void;
  refresh: () => void;
  theme: string;
  setTheme: (v: string) => void;
  boardTheme: string;
  setBoardTheme: (v: string) => void;
  sessionId: string;
}
const Context = createContext<Studio>(null!);
export function useStudio() {
  return useContext(Context);
}
export function StudioProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(initialToken);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(!apiBase);
  const [cloudError, setCloudError] = useState("");
  const [theme, setTheme] = useState("light");
  const [boardTheme, setBoardTheme] = useState("sage");
  const [sessionId] = useState(() => crypto.randomUUID());
  const inFlight = useRef(new Set<string>());
  const api = useRef<CloudApi | undefined>(undefined);
  api.current = apiBase && token ? new CloudApi(apiBase, token) : undefined;
  const refresh = useCallback(async () => {
    const requestApi = api.current;
    if (!requestApi) return;
    setLoading(true);
    setCloudError("");
    try {
      const loaded = await requestApi.load();
      if (api.current?.token === requestApi.token)
        setEvents((v) => mergeEvents(v, loaded));
    } catch (e) {
      if (api.current?.token === requestApi.token)
        setCloudError(String((e as Error).message));
    } finally {
      if (api.current?.token === requestApi.token) setHydrated(true);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [token, refresh]);
  useEffect(() => {
    if (!apiBase || initialToken) return;
    let cancelled = false;
    void fetch(apiBase + "/auth/session", { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && typeof data.token === "string")
            setToken(data.token);
        } else if (!cancelled) setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const send = useCallback(async (event: ProgressEvent) => {
    if (inFlight.current.has(event.id)) return;
    inFlight.current.add(event.id);
    setPending((p) =>
      p.map((x) =>
        x.event.id === event.id
          ? { ...x, state: "saving", error: undefined }
          : x,
      ),
    );
    try {
      if (!api.current)
        throw Error(
          apiBase
            ? "Для синхронизации войдите через GitHub."
            : "Облачный сервер ещё не настроен. Ответ остаётся в этой вкладке.",
        );
      const requestApi = api.current;
      await requestApi.save(event);
      if (api.current?.token === requestApi.token)
        setEvents((v) => mergeEvents(v, [event]));
      setPending((p) =>
        p.map((x) => (x.event.id === event.id ? { ...x, state: "saved" } : x)),
      );
    } catch (e) {
      setPending((p) =>
        p.map((x) =>
          x.event.id === event.id
            ? { ...x, state: "error", error: (e as Error).message }
            : x,
        ),
      );
    } finally {
      inFlight.current.delete(event.id);
    }
  }, []);
  const save = useCallback(
    (event: ProgressEvent) => {
      setPending((p) =>
        p.some((x) => x.event.id === event.id)
          ? p
          : [...p, { event, state: "saving" }],
      );
      queueMicrotask(() => void send(event));
    },
    [send],
  );
  const retry = useCallback(() => {
    pending
      .filter((p) => p.state === "error")
      .forEach((p) => void send(p.event));
  }, [pending, send]);
  useEffect(() => {
    if (token) retry(); /* only retry when a new session arrives */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (pending.some((p) => p.state !== "saved")) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [pending]);
  function login() {
    if (!apiBase) return;
    const channel = crypto.randomUUID();
    const bridge =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("chess-studio-auth-" + channel)
        : undefined;
    const popup = window.open(
      `${apiBase}/auth/login?mode=popup&channel=${channel}`,
      "chess-studio-auth",
      "width=540,height=720",
    );
    if (!popup) {
      bridge?.close();
      if (pending.some((p) => p.state !== "saved")) {
        setCloudError(
          "Разрешите всплывающее окно для входа. Неподтверждённые ответы остаются в этой вкладке.",
        );
        return;
      }
      location.assign(`${apiBase}/auth/login`);
      return;
    }
    const handler = (e: MessageEvent) => {
      if (
        e.origin !== new URL(apiBase).origin ||
        e.source !== popup ||
        e.data?.type !== "chess-studio-session" ||
        typeof e.data.token !== "string"
      )
        return;
      setHydrated(false);
      setToken(e.data.token);
      window.removeEventListener("message", handler);
      popup.close();
    };
    if (bridge)
      bridge.onmessage = (e: MessageEvent) => {
        if (
          e.data?.type === "chess-studio-session" &&
          typeof e.data.token === "string"
        ) {
          setHydrated(false);
          setToken(e.data.token);
          bridge.close();
          window.removeEventListener("message", handler);
          popup.close();
        }
      };
    window.addEventListener("message", handler);
    const timer = window.setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        window.removeEventListener("message", handler);
        setTimeout(() => bridge?.close(), 3000);
      }
    }, 1000);
  }
  return (
    <Context
      value={{
        events,
        pending,
        loading,
        hydrated,
        cloudError,
        authenticated: !!token,
        configured: !!apiBase,
        login,
        logout: () => {
          setToken("");
          setHydrated(true);
          setEvents([]);
          if (apiBase)
            void fetch(apiBase + "/auth/logout", {
              method: "POST",
              credentials: "include",
            }).catch(() => {});
        },
        save,
        retry,
        refresh,
        theme,
        setTheme,
        boardTheme,
        setBoardTheme,
        sessionId,
      }}
    >
      {children}
    </Context>
  );
}
