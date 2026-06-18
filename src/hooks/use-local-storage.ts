
"use client";

import { useState, useEffect, useCallback } from 'react';

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // 1. Initialize state with the initialValue. This ensures the server and initial client render match.
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // 2. useEffect will only run on the client, after hydration.
  useEffect(() => {
    try {
      // Read the stored value from localStorage
      const item = window.localStorage.getItem(key);
      // If a value is stored, parse it and update the state.
      if (item) {
        // Handle cases where localStorage has old data that's not valid JSON
        // Also handle the case where the value is the string "undefined"
        if (item === "undefined") {
          console.warn(`Removing invalid "undefined" string from localStorage key “${key}”`);
          window.localStorage.removeItem(key);
        } else {
          try {
            setStoredValue(JSON.parse(item));
          } catch (parseError) {
            console.warn(`Invalid JSON in localStorage for key “${key}”:`, parseError);
            // Clear the invalid data
            window.localStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      // If any error occurs, we'll just use the initial value.
      console.error(`Error reading localStorage key “${key}”:`, error);
    }
  }, [key]);

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, storedValue]);
  
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
        if (e.key === key) {
            if (e.newValue) {
              try {
                setStoredValue(JSON.parse(e.newValue));
              } catch (parseError) {
                console.warn(`Invalid JSON in storage event for key “${key}”:`, parseError);
              }
            } else {
              // If newValue is null, use initial value
              setStoredValue(initialValue);
            }
        }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
        window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue]);

  return [storedValue, setValue];
}

export default useLocalStorage;
