// Vitest setup, loaded for every test file (test.setupFiles). Registering
// the jest-dom matchers here is harmless in the node env — it only extends
// `expect`. The DOM-dependent bits below are guarded on `document` so they
// no-op in node-environment (pure-logic) tests and only run for jsdom
// component tests.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  // jsdom's default localStorage is a method-less stub unless a storage
  // origin is configured, so install a simple, deterministic in-memory
  // implementation. Per-file (setupFiles run once per test file); tests
  // clear it in their own beforeEach as needed.
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: memoryStorage,
    configurable: true,
  });
}

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
