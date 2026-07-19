import { expect, test } from "bun:test";

import { computerActionSchema } from "../types";

test("accepts computer click actions with keys: null", () => {
  const parsed = computerActionSchema.parse({
    type: "click",
    x: 100,
    y: 200,
    keys: null,
  });
  if (parsed.type !== "click") throw new Error("Expected click action");
  expect(parsed.keys).toBeUndefined();
});

test("accepts computer click actions with omitted keys", () => {
  const parsed = computerActionSchema.parse({
    type: "click",
    x: 100,
    y: 200,
  });
  if (parsed.type !== "click") throw new Error("Expected click action");
  expect(parsed.keys).toBeUndefined();
});
