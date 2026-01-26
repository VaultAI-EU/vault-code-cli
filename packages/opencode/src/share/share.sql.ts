import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/session.sql"
import type { Session } from "../session"

export const SessionShareTable = sqliteTable("session_share", {
  session_id: text()
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  data: text({ mode: "json" }).notNull().$type<{
    id: string
    secret: string
    url: string
  }>(),
})

export const ShareTable = sqliteTable("share", {
  session_id: text().primaryKey(),
  data: text({ mode: "json" }).notNull().$type<Session.ShareInfo>(),
})
