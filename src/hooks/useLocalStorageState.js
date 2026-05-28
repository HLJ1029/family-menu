import { useEffect, useState } from "react";

export function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") {
      return resolveInitialValue(initialValue);
    }

    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue === null ? resolveInitialValue(initialValue) : JSON.parse(storedValue);
    } catch {
      return resolveInitialValue(initialValue);
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage failures so private browsing modes do not break the app.
    }
  }, [key, value]);

  return [value, setValue];
}

function resolveInitialValue(initialValue) {
  return typeof initialValue === "function" ? initialValue() : initialValue;
}
