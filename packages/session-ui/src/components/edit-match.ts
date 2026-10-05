// Edit tool metadata carries the matching strategy; only non-exact matches get a badge.
// The badge shows the raw fidelity and strategy identifiers, which are code tokens and not translated.
export function editMatchLabel(match: unknown) {
  if (!match || typeof match !== "object") return undefined
  if (!("strategy" in match) || typeof match.strategy !== "string") return undefined
  if (!("fidelity" in match) || typeof match.fidelity !== "string") return undefined
  if (match.fidelity === "exact") return undefined
  return `${match.fidelity} · ${match.strategy}`
}
