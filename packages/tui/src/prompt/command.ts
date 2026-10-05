// Splits `/name args` input the same way for submit and for the expansion
// preview, so the preview is asked about exactly the arguments that get sent.
// The command name ends at the first space; later lines stay part of the arguments.
export function parseSlashCommand(input: string) {
  if (!input.startsWith("/")) return
  const firstLineEnd = input.indexOf("\n")
  const firstLine = firstLineEnd === -1 ? input : input.slice(0, firstLineEnd)
  const [command, ...firstLineArgs] = firstLine.split(" ")
  const rest = firstLineEnd === -1 ? "" : input.slice(firstLineEnd + 1)
  return {
    name: command.slice(1),
    arguments: firstLineArgs.join(" ") + (rest ? "\n" + rest : ""),
    // True once anything follows the name, even a lone space.
    hasArguments: input.length > command.length,
  }
}
