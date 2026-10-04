import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { CommandTemplate } from "@opencode-ai/core/command-template"
import { it } from "./lib/effect"

// Stands in for a real shell so expansion tests stay pure: it reports the
// command it was handed instead of running it.
const echoShell: CommandTemplate.ShellStrategy = (command) => Effect.succeed({ status: "ran", output: `<${command}>` })

const expandText = (template: string, args: string, shell: CommandTemplate.ShellStrategy = echoShell) =>
  CommandTemplate.expand({ template, arguments: args, shell }).pipe(Effect.map((expansion) => expansion.text))

describe("CommandTemplate.expand", () => {
  const cases = [
    { template: "Compare $1 with $2", arguments: `"hello world" 'x y'`, text: "Compare hello world with x y" },
    { template: "From $1 to $2: $3", arguments: "a b c d e", text: "From a to b: c d e" },
    { template: "Echo: $ARGUMENTS", arguments: `"hello world" x`, text: `Echo: "hello world" x` },
    { template: "Review the code", arguments: "focus on tests", text: "Review the code\n\nfocus on tests" },
    { template: "Review the code", arguments: "   ", text: "Review the code" },
    { template: "Need $1 and $2", arguments: "only", text: "Need only and" },
    { template: "$1, $1 and $2", arguments: "a b c", text: "a, a and b c" },
    { template: "A $1 B $10", arguments: "a b c", text: "A a B" },
    { template: "Say !`echo hi`", arguments: "", text: "Say <echo hi>" },
    { template: "Say !`echo $1`", arguments: "'hello there'", text: "Say <echo hello there>" },
    {
      template: "First: $1 / All: $ARGUMENTS",
      arguments: `"x $ARGUMENTS"`,
      text: `First: x $ARGUMENTS / All: "x $ARGUMENTS"`,
    },
    { template: "Echo: $ARGUMENTS", arguments: "a$&b $$ $'", text: "Echo: a$&b $$ $'" },
    { template: "Echo: $ARGUMENTS", arguments: "!`printf pwned`", text: "Echo: !`printf pwned`" },
    { template: "Review", arguments: "!`printf pwned`", text: "Review\n\n!`printf pwned`" },
    { template: "Run $0 now", arguments: "a b", text: "Run $0 now\n\na b" },
    { template: "Run $0 with $1", arguments: "a b", text: "Run $0 with a b" },
  ]

  for (const item of cases) {
    it.effect(`${JSON.stringify(item.template)} with ${JSON.stringify(item.arguments)}`, () =>
      Effect.gen(function* () {
        expect(yield* expandText(item.template, item.arguments)).toBe(item.text)
      }),
    )
  }

  it.effect("defers shell blocks and reports them pending", () =>
    Effect.gen(function* () {
      const expansion = yield* CommandTemplate.expand({
        template: "Say !`echo hi` to $1",
        arguments: "bob",
        shell: CommandTemplate.deferShell,
      })
      expect(expansion.text).toBe("Say !`echo hi` to bob")
      expect(expansion.shell).toEqual([{ command: "echo hi", status: "pending" }])
    }),
  )

  it.effect("runs shell blocks with the strategy it is given", () =>
    Effect.gen(function* () {
      const expansion = yield* CommandTemplate.expand({
        template: "Say !`echo hi`",
        arguments: "",
        shell: () => Effect.succeed({ status: "ran", output: "hi\n" }),
      })
      expect(expansion.text).toBe("Say hi")
      expect(expansion.shell).toEqual([{ command: "echo hi", status: "ran", output: "hi\n" }])
    }),
  )

  it.effect("reports which argument filled each placeholder", () =>
    Effect.gen(function* () {
      const expansion = yield* CommandTemplate.expand({
        template: "From $2 to $1: $3 ($ARGUMENTS)",
        arguments: `"a b" c d e`,
        shell: CommandTemplate.deferShell,
      })
      expect(expansion.arguments).toEqual([
        { placeholder: "$1", value: "a b" },
        { placeholder: "$2", value: "c" },
        { placeholder: "$3", value: "d e" },
        { placeholder: "$ARGUMENTS", value: `"a b" c d e` },
      ])
      expect(expansion.appended).toBe(false)
    }),
  )

  it.effect("reports appended arguments", () =>
    Effect.gen(function* () {
      const expansion = yield* CommandTemplate.expand({
        template: "Review the code",
        arguments: "carefully",
        shell: CommandTemplate.deferShell,
      })
      expect(expansion.arguments).toEqual([])
      expect(expansion.appended).toBe(true)
    }),
  )
})

describe("CommandTemplate.hints", () => {
  it.effect("lists numbered placeholders once, then $ARGUMENTS", () =>
    Effect.sync(() => {
      expect(CommandTemplate.hints("$2 then $1, $1 and $ARGUMENTS")).toEqual(["$1", "$2", "$ARGUMENTS"])
      expect(CommandTemplate.hints("$10 $2 $1")).toEqual(["$1", "$2", "$10"])
      expect(CommandTemplate.hints("$0 is not a placeholder")).toEqual([])
      expect(CommandTemplate.hints("no placeholders")).toEqual([])
    }),
  )
})

describe("CommandTemplate.parseArguments", () => {
  it.effect("keeps quoted words and image references together", () =>
    Effect.sync(() => {
      expect(CommandTemplate.parseArguments(`"a b" 'c d' e [Image 1]\nf`)).toEqual([
        "a b",
        "c d",
        "e",
        "[Image 1]",
        "f",
      ])
      expect(CommandTemplate.parseArguments("   ")).toEqual([])
    }),
  )
})
