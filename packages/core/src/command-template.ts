export * as CommandTemplate from "./command-template"

import { Effect, Schema } from "effect"

// The command template language lives here and nowhere else:
// - `$1`, `$2`, ... take one parsed argument each; the highest one takes the rest.
// - `$ARGUMENTS` takes the argument string exactly as typed.
// - `` !`command` `` is replaced with the command's output by a ShellStrategy.
// - A template without placeholders gets the arguments appended after a blank line.
export const SHELL_REGEX = /!`([^`]+)`/g
const PLACEHOLDER_REGEX = /\$(?:ARGUMENTS|\d+)/g
// `[Image N]` stays one token, quotes group words, anything else splits on whitespace.
const ARGUMENT_REGEX = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
const QUOTE_REGEX = /^["']|["']$/g

export const Binding = Schema.Struct({
  placeholder: Schema.String,
  value: Schema.String,
}).annotate({ identifier: "CommandTemplateBinding" })
export type Binding = typeof Binding.Type

export const ShellBlock = Schema.Struct({
  command: Schema.String,
  status: Schema.Literals(["pending", "ran"]),
  output: Schema.optional(Schema.String),
}).annotate({ identifier: "CommandTemplateShellBlock" })
export type ShellBlock = typeof ShellBlock.Type

export const Expansion = Schema.Struct({
  text: Schema.String,
  arguments: Schema.Array(Binding),
  appended: Schema.Boolean,
  shell: Schema.Array(ShellBlock),
}).annotate({ identifier: "CommandExpansion" })
export type Expansion = typeof Expansion.Type

export type ShellResult = { readonly status: "pending" } | { readonly status: "ran"; readonly output: string }

/**
 * Decides what a `` !`command` `` block becomes. Filling placeholders is pure,
 * but running a shell command is slow, has side effects and may not repeat, so
 * the caller picks the behavior: preview defers, send runs.
 */
export type ShellStrategy<E = never, R = never> = (command: string) => Effect.Effect<ShellResult, E, R>

/** Leaves every block as written, so expansion has no side effects. */
export const deferShell: ShellStrategy = () => Effect.succeed({ status: "pending" })

export function parseArguments(input: string) {
  return (input.match(ARGUMENT_REGEX) ?? []).map((argument) => argument.replace(QUOTE_REGEX, ""))
}

/** The placeholders a template uses, in the order an interface should list them. */
export function hints(template: string) {
  const numbered = [...new Set(template.match(/\$\d+/g) ?? [])].sort()
  if (template.includes("$ARGUMENTS")) return [...numbered, "$ARGUMENTS"]
  return numbered
}

export function expand<E, R>(input: { template: string; arguments: string; shell: ShellStrategy<E, R> }) {
  return Effect.gen(function* () {
    const args = parseArguments(input.arguments)
    const placeholders = hints(input.template)
    const last = Math.max(
      0,
      ...placeholders.filter((item) => item !== "$ARGUMENTS").map((item) => Number(item.slice(1))),
    )
    const fill = (placeholder: string) => {
      if (placeholder === "$ARGUMENTS") return input.arguments
      const position = Number(placeholder.slice(1))
      if (position - 1 >= args.length) return ""
      if (position === last) return args.slice(position - 1).join(" ")
      return args[position - 1]
    }
    // One pass over the template: argument text is inserted once and never scanned
    // again. A function replacement also keeps `$&`, `$$` and friends literal.
    const filled = input.template.replaceAll(PLACEHOLDER_REGEX, fill)
    const appended = placeholders.length === 0 && input.arguments.trim() !== ""
    const pieces = (appended ? filled + "\n\n" + input.arguments : filled).split(SHELL_REGEX)
    // split() with a capture group alternates text and shell commands: odd indexes are commands.
    const commands = pieces.filter((_, index) => index % 2 === 1)
    const results = yield* Effect.forEach(commands, input.shell, { concurrency: "unbounded" })
    const text = pieces
      .map((piece, index) => {
        if (index % 2 === 0) return piece
        const result = results[(index - 1) / 2]
        return result.status === "ran" ? result.output : "!`" + piece + "`"
      })
      .join("")
      .trim()
    return {
      text,
      arguments: placeholders.map((placeholder) => ({ placeholder, value: fill(placeholder) })),
      appended,
      shell: commands.map((command, index) => {
        const result = results[index]
        return result.status === "ran"
          ? { command, status: "ran" as const, output: result.output }
          : { command, status: "pending" as const }
      }),
    } satisfies Expansion
  })
}
