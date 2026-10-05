import type { CommandExpansion } from "@opencode-ai/sdk/v2"
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { useProject } from "../../context/project"
import { useSDK } from "../../context/sdk"
import { useTheme } from "../../context/theme"
import { SplitBorder } from "../../ui/border"

const DEBOUNCE_MS = 150
const MAX_LINES = 8

// Shows what a slash command will send for the arguments typed so far. The
// server expands it with the same code the send path uses, without creating a
// session; shell blocks are left as written and marked as running on send.
export function CommandPreview(props: { name?: string; arguments: string }) {
  const sdk = useSDK()
  const project = useProject()
  const { theme } = useTheme()
  const [expansion, setExpansion] = createSignal<CommandExpansion>()

  createEffect(() => {
    const name = props.name
    const args = props.arguments
    if (!name) {
      setExpansion(undefined)
      return
    }
    // Drop responses for input that has changed since the request was made.
    let stale = false
    const timer = setTimeout(() => {
      void sdk.client.command
        .preview({ command: name, arguments: args, workspace: project.workspace.current() })
        .then((result) => {
          if (!stale) setExpansion(result.data)
        })
    }, DEBOUNCE_MS)
    onCleanup(() => {
      stale = true
      clearTimeout(timer)
    })
  })

  return (
    <Show when={props.name ? expansion() : undefined}>
      {(value) => {
        const lines = () => value().text.split("\n")
        return (
          <box
            width="100%"
            border={["left"]}
            borderColor={theme.border}
            customBorderChars={SplitBorder.customBorderChars}
          >
            <box
              paddingLeft={2}
              paddingRight={2}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={theme.backgroundPanel}
              flexDirection="column"
            >
              <text fg={theme.textMuted}>/{props.name} will send</text>
              <text fg={theme.text}>{lines().slice(0, MAX_LINES).join("\n")}</text>
              <Show when={lines().length > MAX_LINES}>
                <text fg={theme.textMuted}>… {lines().length - MAX_LINES} more lines</text>
              </Show>
              <Show when={value().arguments.length > 0 || value().appended || value().shell.length > 0}>
                <box paddingTop={1} flexDirection="column">
                  <For each={value().arguments}>
                    {(binding) => (
                      <text>
                        <span style={{ fg: theme.accent }}>{binding.placeholder}</span>
                        <span style={{ fg: binding.value ? theme.text : theme.textMuted }}>
                          {" "}
                          {binding.value || "(empty)"}
                        </span>
                      </text>
                    )}
                  </For>
                  <Show when={value().appended}>
                    <text fg={theme.textMuted}>No placeholders: arguments are appended</text>
                  </Show>
                  <For each={value().shell}>
                    {(block) => (
                      <text>
                        <span style={{ fg: theme.warning }}>!`{block.command}`</span>
                        <span style={{ fg: theme.textMuted }}>
                          {block.status === "pending" ? " runs on send" : " ran for preview"}
                        </span>
                      </text>
                    )}
                  </For>
                </box>
              </Show>
            </box>
          </box>
        )
      }}
    </Show>
  )
}
