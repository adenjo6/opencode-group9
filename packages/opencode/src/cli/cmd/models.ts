import { EOL } from "os"
import { Effect } from "effect"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import { ProviderV2 } from "@opencode-ai/core/provider"

export const ModelsCommand = effectCmd({
  command: "models [provider]",
  describe: "list all available models",
  builder: (yargs) =>
    yargs
      .positional("provider", {
        describe: "provider ID to filter models by",
        type: "string",
        array: false,
      })
      .option("verbose", {
        describe: "use more verbose model output (includes metadata like costs)",
        type: "boolean",
      })
      .option("refresh", {
        describe: "refresh the models cache from models.dev",
        type: "boolean",
      }),
  handler: Effect.fn("Cli.models")(function* (args) {
    const { Provider } = yield* Effect.promise(() => import("@/provider/provider"))
    if (args.refresh) {
      yield* ModelsDev.Service.use((s) => s.refresh(true))
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL)
    }

    const { Config } = yield* Effect.promise(() => import("@/config/config"))
    const { ToolSelection } = yield* Effect.promise(() => import("@/tool/selection"))
    const configured = yield* Config.Service.use((cfg) => cfg.get())
    const provider = yield* Provider.Service
    const providers = yield* provider.list()

    const print = (providerID: ProviderV2.ID, verbose?: boolean) => {
      const p = providers[providerID]
      const configuredModels = configured.provider?.[providerID]?.models
      const sorted = Object.entries(p.models).sort(([a], [b]) => a.localeCompare(b))
      for (const [modelID, model] of sorted) {
        const choice =
          configuredModels?.[modelID]?.tool_choice ??
          configuredModels?.[model.api.id]?.tool_choice ??
          Object.values(configuredModels ?? {}).find((item) => item.id === modelID || item.id === model.api.id)
            ?.tool_choice
        const decision = ToolSelection.editDecision(model.api.id, choice)
        process.stdout.write(`${providerID}/${modelID}  ${decision.variant}  ${decision.source}`)
        process.stdout.write(EOL)
        if (verbose) {
          process.stdout.write(JSON.stringify(model, null, 2))
          process.stdout.write(EOL)
        }
      }
    }

    if (args.provider) {
      const providerID = ProviderV2.ID.make(args.provider)
      if (!providers[providerID]) return yield* fail(`Provider not found: ${args.provider}`)
      print(providerID, args.verbose)
      return
    }

    const ids = Object.keys(providers).sort((a, b) => {
      const aIsOpencode = a.startsWith("opencode")
      const bIsOpencode = b.startsWith("opencode")
      if (aIsOpencode && !bIsOpencode) return -1
      if (!aIsOpencode && bIsOpencode) return 1
      return a.localeCompare(b)
    })

    for (const providerID of ids) print(ProviderV2.ID.make(providerID), args.verbose)
  }),
})
