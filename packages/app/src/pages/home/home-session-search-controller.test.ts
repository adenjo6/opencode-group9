import { describe, expect, test } from "bun:test"
import { ServerConnection } from "@/context/server"
import { loadHomeSessionSearch } from "./home-session-search"

describe("loadHomeSessionSearch", () => {
  test("scopes requests, forwards cancellation, and keeps same-ID results from different servers", async () => {
    const first = { type: "http", http: { url: "http://first" } } as const
    const second = { type: "http", http: { url: "http://second" } } as const
    const controller = new AbortController()
    const calls: Array<{ server: string; query: { project?: string; search?: string }; signal?: AbortSignal }> = []
    const project = { id: "project", worktree: "/repo", expanded: true }
    const context = (server: ServerConnection.Any) => ({
      sdk: {
        client: {
          v2: {
            session: {
              list: (query: { project?: string; search?: string }, options: { signal?: AbortSignal }) => {
                calls.push({ server: ServerConnection.key(server), query, signal: options.signal })
                return Promise.resolve({
                  data: {
                    data: [
                      {
                        id: "ses_shared",
                        projectID: "project",
                        cost: 0,
                        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                        time: { created: 1, updated: server === first ? 2 : 3 },
                        title: "Unrelated",
                        location: { directory: "/repo" },
                        match: { field: "message" as const, preview: "rate limiter" },
                      },
                    ],
                    cursor: {},
                  },
                })
              },
            },
          },
        },
      },
    })

    const results = await loadHomeSessionSearch({
      value: "rate limiter",
      selected: project,
      servers: [first, second],
      signal: controller.signal,
      context,
      projects: () => [project],
    } as unknown as Parameters<typeof loadHomeSessionSearch>[0])

    expect(calls).toHaveLength(2)
    expect(calls.every((call) => call.query.project === "project" && call.signal === controller.signal)).toBe(true)
    expect(results.map((record) => ServerConnection.key(record.server!))).toEqual([
      ServerConnection.key(second),
      ServerConnection.key(first),
    ])
    expect(results.every((record) => record.session.match?.field === "message")).toBe(true)
  })

  test("retains successful results when another server request fails", async () => {
    const first = { type: "http", http: { url: "http://first" } } as const
    const second = { type: "http", http: { url: "http://second" } } as const
    const project = { id: "project", worktree: "/repo", expanded: true }
    const context = (server: ServerConnection.Any) => ({
      sdk: {
        client: {
          v2: {
            session: {
              list: () =>
                server === first
                  ? Promise.reject(new Error("offline"))
                  : Promise.resolve({
                      data: {
                        data: [
                          {
                            id: "ses_result",
                            projectID: "project",
                            cost: 0,
                            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                            time: { created: 1, updated: 1 },
                            title: "Result",
                            location: { directory: "/repo" },
                            match: { field: "title" as const },
                          },
                        ],
                        cursor: {},
                      },
                    }),
            },
          },
        },
      },
    })

    const results = await loadHomeSessionSearch({
      value: "result",
      servers: [first, second],
      signal: new AbortController().signal,
      context,
      projects: () => [project],
    } as unknown as Parameters<typeof loadHomeSessionSearch>[0])

    expect(results).toHaveLength(1)
    expect(results[0]?.session.id).toBe("ses_result")
  })
})
