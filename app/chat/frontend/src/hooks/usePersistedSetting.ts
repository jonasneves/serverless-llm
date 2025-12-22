import { useEffect, useState } from 'react';

type SerializeFn<T> = (value: T) => string | null;
type DeserializeFn<T> = (rawValue: string | null, fallback: T) => T;

const defaultSerialize = <T,>(value: T): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const defaultDeserialize = <T,>(rawValue: string | null, fallback: T): T => {
  if (rawValue === null) return fallback;
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
};

interface Options<T> {
  serialize?: SerializeFn<T>;
  deserialize?: DeserializeFn<T>;
}

export function usePersistedSetting<T>(
  key: string,
  initialValue: T,
  options: Options<T> = {},
) {
  const serialize = options.serialize ?? defaultSerialize<T>;
  const deserialize = options.deserialize ?? defaultDeserialize<T>;

  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const stored = window.localStorage.getItem(key);
      return deserialize(stored, initialValue);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const serialized = serialize(value);
      if (serialized === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, serialized);
      }
    } catch {
      // Ignore storage exceptions (e.g., private browsing mode)
    }
  }, [key, serialize, value]);

  return [value, setValue] as const;
}
