import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";

export function useUrlState(key: string, defaultValue: string) {
  const [location, setLocation] = useLocation();
  const [pathname, search = ""] = location.split("?");
  const value = useMemo(
    () => new URLSearchParams(search).get(key) || defaultValue,
    [key, search, defaultValue]
  );
  const setValue = useCallback(
    (nextValue: string) => {
      const params = new URLSearchParams(search);
      if (nextValue === defaultValue) params.delete(key);
      else params.set(key, nextValue);
      const query = params.toString();
      setLocation(query ? `${pathname}?${query}` : pathname);
    },
    [defaultValue, key, pathname, search, setLocation]
  );
  return [value, setValue] as const;
}
