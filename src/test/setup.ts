// Vitest setup, loaded for every test file (test.setupFiles). Registering
// the jest-dom matchers here is harmless in the node env — it only extends
// `expect`. The DOM cleanup after each test is guarded on `document` so it
// no-ops in node-environment (pure-logic) tests and only runs for the
// jsdom component tests.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
