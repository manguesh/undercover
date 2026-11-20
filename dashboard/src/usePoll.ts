import { useCallback, useEffect, useState } from "react";

export const POLL_MS = 2000;

/** Load data now and again every `intervalMs`, or once if it is 0. */
export function usePoll<T>(load: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      load().then(
        (value) => {
          if (active) {
            setData(value);
            setError(undefined);
          }
        },
        (reason: unknown) => {
          if (active) setError(String(reason));
        },
      );
    };
    refresh();
    const timer = intervalMs ? setInterval(refresh, intervalMs) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load, intervalMs, version]);

  const reload = useCallback(() => {
    setVersion((n) => n + 1);
  }, []);
  return { data, error, reload };
}
