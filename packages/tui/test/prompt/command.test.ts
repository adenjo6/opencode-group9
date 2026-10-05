import { describe, expect, test } from "bun:test"
import { parseSlashCommand } from "../../src/prompt/command"

describe("parseSlashCommand", () => {
  test("ignores input that is not a slash command", () => {
    expect(parseSlashCommand("hello /probe")).toBeUndefined()
  })

  test("splits the name from the arguments", () => {
    expect(parseSlashCommand(`/probe "hello world" x`)).toEqual({
      name: "probe",
      arguments: `"hello world" x`,
      hasArguments: true,
    })
  })

  test("keeps later lines as part of the arguments", () => {
    expect(parseSlashCommand("/probe a  b\nsecond line\nthird")).toEqual({
      name: "probe",
      arguments: "a  b\nsecond line\nthird",
      hasArguments: true,
    })
  })

  test("treats a multi-line input with no first-line arguments as arguments", () => {
    expect(parseSlashCommand("/probe\nbody")).toEqual({ name: "probe", arguments: "\nbody", hasArguments: true })
  })

  test("reports whether anything follows the name", () => {
    expect(parseSlashCommand("/probe")).toEqual({ name: "probe", arguments: "", hasArguments: false })
    expect(parseSlashCommand("/probe ")).toEqual({ name: "probe", arguments: "", hasArguments: true })
  })
})
