import type { LocalProject } from "@/context/layout"
import { ServerConnection } from "@/context/server"
import { toLegacySummary } from "@/context/global-sync/home-session-index"
import { compareSessionTime, displayName, projectForSession } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import type { HomeController } from "./home-controller"
import type { HomeSessionRecord } from "./home-sessions-controller"

export function loadHomeSessionSearch(input: {
  value: string
  selected?: LocalProject
  servers: ServerConnection.Any[]
  signal: AbortSignal
  context: HomeController["server"]["context"]
  projects: HomeController["project"]["forServer"]
}) {
  return Promise.all(
    input.servers.map((server) =>
      input
        .context(server)
        .sdk.client.v2.session.list(
          {
            search: input.value,
            roots: true,
            limit: 50,
            order: "desc",
            ...(input.selected?.id
              ? { project: input.selected.id }
              : input.selected
                ? { directory: input.selected.worktree }
                : {}),
          },
          { signal: input.signal },
        )
        .then((response) => {
          const projects = input.projects(server)
          const projectByID = new Map(
            projects.flatMap((project) => (project.id ? [[project.id, project] as const] : [])),
          )
          return (response.data?.data ?? []).flatMap((item) => {
            if (item.parentID || typeof item.time.archived === "number") return []
            const session = { ...toLegacySummary(item), match: item.match }
            const directory = pathKey(session.directory)
            const project =
              projects.find(
                (candidate) =>
                  pathKey(candidate.worktree) === directory ||
                  candidate.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
              ) ?? projectForSession(session, projects, projectByID)
            if (!project) return []
            return [{ session, project, projectName: displayName(project), server }]
          })
        })
        .catch(() => []),
    ),
  ).then((groups) => {
    const merged = new Map<string, HomeSessionRecord>(
      groups.flat().map((record) => [`${ServerConnection.key(record.server)}\0${record.session.id}`, record]),
    )
    return [...merged.values()].sort((a, b) => compareSessionTime(a.session, b.session))
  })
}
