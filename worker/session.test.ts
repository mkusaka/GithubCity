import { describe, expect, test } from "vitest";

import { seal, unseal } from "./session";

describe("sealed sessions", () => {
  test("round-trips tokens and rejects altered ciphertext and wrong secrets", async () => {
    const sealed = await seal("gh-token", "test-secret");
    expect(await unseal(sealed, "test-secret")).toBe("gh-token");
    expect(await unseal(sealed, "different-secret")).toBeNull();
    const tampered = `${sealed.slice(0, -2)}AA`;
    expect(await unseal(tampered, "test-secret")).toBeNull();
  });
});
