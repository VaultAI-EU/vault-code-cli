import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const ProjectTable = sqliteTable("project", {
  id: text().primaryKey(),
  worktree: text().notNull(),
  vcs: text(),
  name: text(),
  icon_url: text(),
  icon_color: text(),
  time_created: integer().notNull(),
  time_updated: integer().notNull(),
  time_initialized: integer(),
  sandboxes: text({ mode: "json" }).notNull().$type<string[]>(),
})
