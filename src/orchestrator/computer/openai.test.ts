import { expect, test } from "bun:test";
import { z } from "zod";

// Mirror the production nullish keys handling so we catch API shape drift.
const modifierKeys = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? undefined);

const clickSchema = z.object({
  type: z.literal("click"),
  x: z.number(),
  y: z.number(),
  keys: modifierKeys,
});

test("accepts computer click actions with keys: null", () => {
  const parsed = clickSchema.parse({
    type: "click",
    x: 100,
    y: 200,
    keys: null,
  });
  expect(parsed.keys).toBeUndefined();
});

test("accepts computer click actions with omitted keys", () => {
  const parsed = clickSchema.parse({
    type: "click",
    x: 100,
    y: 200,
  });
  expect(parsed.keys).toBeUndefined();
});
