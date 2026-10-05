export * as SessionSearch from "./search"

import { Database } from "../database/database"
import { Session } from "@opencode-ai/schema/session"
import { and, getTableColumns, or, sql, type SQL } from "drizzle-orm"
import { Effect } from "effect"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "./sql"

export const Match = Session.Match
export type Match = Session.Match

export type Result<T> = T & { match?: Match }

type Input = {
  conditions: SQL[]
  orderBy: SQL[]
  search?: string
  limit?: number
}

type Row = {
  row: typeof SessionTable.$inferSelect
  match?: Match
}

export function list(db: Database.Interface["db"], input: Input): Effect.Effect<Row[]> {
  const search = input.search?.trim().toLowerCase()
  if (!search) {
    const query = db
      .select()
      .from(SessionTable)
      .where(input.conditions.length > 0 ? and(...input.conditions) : undefined)
      .orderBy(...input.orderBy)
    return (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(
      Effect.orDie,
      Effect.map((rows) => rows.map((row) => ({ row }))),
    )
  }

  const title = sql<boolean>`instr(lower(${SessionTable.title}), ${search}) > 0`
  const preview = messagePreview(search)
  const query = db
    .select({
      ...getTableColumns(SessionTable),
      search_title: sql<number>`case when ${title} then 1 else 0 end`,
      search_preview: preview,
    })
    .from(SessionTable)
    .where(and(...input.conditions, or(title, sql`${preview} is not null`)!))
    .orderBy(...input.orderBy)

  return (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(
    Effect.orDie,
    Effect.map((rows) =>
      rows.map(
        (row): Row => ({
          row,
          match: row.search_title
            ? ({ field: "title" } as const)
            : ({ field: "message", preview: row.search_preview! } as const),
        }),
      ),
    ),
  )
}

function messagePreview(search: string) {
  const legacyText = sql<string>`json_extract("part"."data", '$.text')`
  const messageText = sql<string>`case
    when "session_message"."type" = 'user' then json_extract("session_message"."data", '$.text')
    when "session_message"."type" = 'assistant' then (
      select group_concat(json_extract(content.value, '$.text'), char(10))
      from json_each("session_message"."data", '$.content') content
      where json_extract(content.value, '$.type') = 'text'
    )
  end`

  return sql<string | null>`(
    select candidate.text
    from (
      select
        ${legacyText} as text,
        "part"."time_created" as created,
        "part"."id" as id
      from ${PartTable}
      inner join ${MessageTable} on "message"."id" = "part"."message_id"
      where "part"."session_id" = "session"."id"
        and json_extract("part"."data", '$.type') = 'text'
        and json_extract("message"."data", '$.role') in ('user', 'assistant')
        and (
          json_extract("message"."data", '$.role') = 'user'
          or coalesce(json_extract("message"."data", '$.summary'), 0) = 0
        )
        and coalesce(json_extract("part"."data", '$.synthetic'), 0) = 0
        and coalesce(json_extract("part"."data", '$.ignored'), 0) = 0

      union all

      select
        ${messageText} as text,
        "session_message"."time_created" as created,
        "session_message"."id" as id
      from ${SessionMessageTable}
      where "session_message"."session_id" = "session"."id"
        and "session_message"."type" in ('user', 'assistant')
    ) candidate
    where instr(lower(candidate.text), ${search}) > 0
    order by candidate.created desc, candidate.id desc
    limit 1
  )`
}
