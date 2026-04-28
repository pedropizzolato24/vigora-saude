import { describe, it, expect } from "vitest";

const obj = { name: "test" } as any;

describe("Simple TS test", () => {
  it("should work with as any", () => {
    expect(obj.name).toBe("test");
  });
});
