export function webSearchProviderLabel(provider: unknown) {
  if (provider === "parallel") return "Parallel Web Search"
  if (provider === "exa") return "Exa Web Search"
  return "Web Search"
}

export function toolDisplayMetadata(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {}
  if (!("status" in state) || state.status === "pending") return {}
  if (!("structured" in state) || !state.structured || typeof state.structured !== "object") return {}
  if (Array.isArray(state.structured)) return {}
  return state.structured as Record<string, unknown>
}

// Edit tool metadata carries the matching strategy; only non-exact matches get a label.
export function editMatchLabel(match: unknown) {
  if (!match || typeof match !== "object") return undefined
  if (!("strategy" in match) || typeof match.strategy !== "string") return undefined
  if (!("fidelity" in match) || typeof match.fidelity !== "string") return undefined
  if (match.fidelity === "exact") return undefined
  return `${match.fidelity} match (${match.strategy})`
}
