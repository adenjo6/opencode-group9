import { ProviderV2 } from "@opencode-ai/core/provider"

const WEBSEARCH = "websearch"
const APPLY_PATCH = "apply_patch"
const EDIT = "edit"
const WRITE = "write"

export type ToolChoice = "apply_patch" | "edit_write"

export type EditDecision = {
  variant: ToolChoice
  source: "override" | "default"
}

export function webSearchEnabled(providerID: ProviderV2.ID, flags = { exa: false, parallel: false }) {
  return (
    providerID === ProviderV2.ID.opencode ||
    providerID === ProviderV2.ID.make("opencode-go") ||
    flags.exa ||
    flags.parallel
  )
}

export function selectTools<Tool extends { id: string }>(
  tools: readonly Tool[],
  input: {
    providerID: ProviderV2.ID
    modelID: string
    flags?: { exa: boolean; parallel: boolean }
    tool_choice?: ToolChoice
  },
) {
  const edit = editDecision(input.modelID, input.tool_choice)
  return {
    tools: tools.filter((tool) => included(tool.id, webSearchEnabled(input.providerID, input.flags), edit.variant)),
    edit,
  }
}

export function editDecision(modelID: string, tool_choice?: ToolChoice): EditDecision {
  if (tool_choice) return { variant: tool_choice, source: "override" }
  return { variant: defaultToolChoice(modelID), source: "default" }
}

function included(id: string, websearch: boolean, tool_choice: ToolChoice) {
  if (id === WEBSEARCH) return websearch
  if (id === APPLY_PATCH) return tool_choice === "apply_patch"
  if (id === EDIT || id === WRITE) return tool_choice === "edit_write"
  return true
}

// gpt-4 and oss models keep edit and write. Other gpt-* models use apply_patch.
function defaultToolChoice(modelID: string): ToolChoice {
  if (modelID.includes("gpt-") && !modelID.includes("oss") && !modelID.includes("gpt-4")) return "apply_patch"
  return "edit_write"
}

export * as ToolSelection from "./selection"
