import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { displayName } from "@/pages/layout/helpers"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { HomeController } from "./home-controller"
import { homeSessionSearchKey, type HomeSessionRecord, type HomeSessionsController } from "./home-sessions-controller"
import { loadHomeSessionSearch } from "./home-session-search"

type HomeSessionSearchSource = Pick<HomeSessionsController, "session">

export function createHomeSessionSearchController(home: HomeController, sessions: HomeSessionSearchSource) {
  const command = useCommand()
  const language = useLanguage()
  const [state, setState] = createStore({
    value: "",
    focused: false,
    highlighted: "",
    loading: false,
    results: [] as HomeSessionRecord[],
  })
  let root: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined
  let list: HTMLDivElement | undefined
  const query = createMemo(() => state.value.trim())
  const results = () => state.results
  const active = createMemo(() => {
    const records = results()
    if (records.some((record) => homeSessionSearchKey(record) === state.highlighted)) return state.highlighted
    return records[0] ? homeSessionSearchKey(records[0]) : ""
  })
  const open = createMemo(() => state.focused && query().length > 0)
  const placeholder = createMemo(() => {
    const project = home.project.selected()
    if (project) return language.t("home.sessions.search.placeholder.scoped", { scope: displayName(project) })
    if (home.server.list().length > 1) return language.t("home.sessions.search.placeholder")
    return language.t("home.sessions.search.placeholder")
  })

  let request = 0
  let controller: AbortController | undefined
  createEffect(() => {
    const value = query()
    const selected = home.project.selected()
    const focused = home.server.focused()
    const servers = selected && focused ? [focused] : home.server.list()
    const generation = ++request
    controller?.abort()
    if (!value || servers.length === 0) {
      setState({ loading: false, results: [] })
      return
    }

    setState({ loading: true, results: [] })
    const timeout = setTimeout(() => {
      controller = new AbortController()
      void loadHomeSessionSearch({
        value,
        selected,
        servers,
        signal: controller.signal,
        context: home.server.context,
        projects: home.project.forServer,
      })
        .then((records) => {
          if (generation !== request || controller?.signal.aborted) return
          setState({ loading: false, results: records })
        })
        .catch(() => {
          if (generation !== request || controller?.signal.aborted) return
          setState({ loading: false, results: [] })
        })
    }, 150)
    onCleanup(() => clearTimeout(timeout))
  })

  onCleanup(() => controller?.abort())

  onCleanup(
    makeEventListener(document, "pointerdown", (event) => {
      if (!open()) return
      const target = event.target
      if (!(target instanceof Node) || root?.contains(target)) return
      close()
    }),
  )

  command.register("home.search", () => [
    {
      id: "home.sessions.search.focus",
      title: placeholder(),
      keybind: "mod+f",
      hidden: true,
      onSelect: focus,
    },
  ])

  function focus() {
    input?.focus()
    setState("focused", true)
  }

  function close() {
    setState({ value: "", focused: false })
  }

  function select(record: HomeSessionRecord, options?: { background?: boolean }) {
    sessions.session.open(record.session, options, record.server)
    if (!options?.background) close()
  }

  return {
    query: {
      value: () => state.value,
      placeholder,
      open,
      focus,
      input: (value: string) => setState({ value, highlighted: "" }),
      close,
    },
    result: {
      loading: () => state.loading,
      list: results,
      active,
      noResultsLabel: () => language.t("home.sessions.search.noResults", { query: query() }),
      highlight: (record: HomeSessionRecord) => setState("highlighted", homeSessionSearchKey(record)),
      move: (delta: number) => {
        const records = results()
        if (records.length === 0) return
        const index = records.findIndex((record) => homeSessionSearchKey(record) === active())
        const next = ((index === -1 ? 0 : index) + delta + records.length) % records.length
        setState("highlighted", homeSessionSearchKey(records[next]))
        list?.querySelector<HTMLElement>(`[data-key="${state.highlighted}"]`)?.scrollIntoView({ block: "nearest" })
      },
      select,
      selectActive: () => {
        const record = results().find((item) => homeSessionSearchKey(item) === active())
        if (record) select(record)
      },
    },
    element: {
      setRoot: (element: HTMLDivElement) => (root = element),
      setInput: (element: HTMLInputElement) => (input = element),
      setList: (element: HTMLDivElement) => (list = element),
    },
  }
}

export type HomeSessionSearchController = ReturnType<typeof createHomeSessionSearchController>
