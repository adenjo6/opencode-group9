import { describe, expect, test } from "bun:test"
import { editMatchLabel } from "./edit-match"

describe("editMatchLabel", () => {
  test("labels non-exact matches with fidelity and strategy", () => {
    expect(editMatchLabel({ strategy: "line-trimmed", fidelity: "whitespace", matched: "x" })).toBe(
      "whitespace · line-trimmed",
    )
  })

  test("hides exact matches", () => {
    expect(editMatchLabel({ strategy: "exact", fidelity: "exact", matched: "x" })).toBeUndefined()
  })

  for (const [name, match] of [
    ["undefined", undefined],
    ["null", null],
    ["missing fidelity", { strategy: "line-trimmed" }],
    ["non-string strategy", { strategy: 1, fidelity: "whitespace" }],
  ] as const) {
    test(`hides ${name}`, () => {
      expect(editMatchLabel(match)).toBeUndefined()
    })
  }
})
