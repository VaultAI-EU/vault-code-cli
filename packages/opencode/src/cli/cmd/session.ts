/**
 * Session management commands
 * 
 * Provides commands to list and manage opencode sessions.
 * The main use case is to help users find session IDs for use with --session flag.
 * 
 * Examples:
 *   opencode session list              # List all sessions in default format
 *   opencode session list --format ids  # List only session IDs (CI-friendly)
 *   opencode session list --format json  # List sessions as JSON
 *   opencode session list --limit 5     # Show only 5 most recent sessions
 */

import type { Argv } from "yargs"
import { Session } from "../../session"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"
import { EOL } from "os"

export const SessionListCommand = cmd({
  command: "list",
  describe: "list all sessions with their IDs",
  builder: (yargs: Argv) => {
    return yargs
      .option("format", {
        alias: "f",
        describe: "output format",
        type: "string",
        choices: ["default", "json", "ids"],
        default: "default",
      })
      .option("limit", {
        alias: "l",
        describe: "limit number of sessions shown",
        type: "number",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      // Collect all sessions from storage
      const sessions = []
      for await (const session of Session.list()) {
        sessions.push(session)
      }

      // Handle empty case
      if (sessions.length === 0) {
        UI.println("No sessions found")
        return
      }

      // Sort by most recently updated
      sessions.sort((a, b) => b.time.updated - a.time.updated)

      // Apply limit if specified
      if (args.limit) {
        sessions.splice(args.limit)
      }

      // JSON format - full session data
      if (args.format === "json") {
        process.stdout.write(JSON.stringify(sessions, null, 2) + EOL)
        return
      }

      // IDs format - just the session IDs (CI-friendly)
      if (args.format === "ids") {
        sessions.forEach(session => {
          process.stdout.write(session.id + EOL)
        })
        return
      }

      // Default format - git log style table
      const terminalWidth = process.stdout.columns || 80
      const idWidth = Math.min(20, Math.max(8, Math.max(...sessions.map(s => s.id.length))))
      const timeWidth = 19
      const titleWidth = terminalWidth - idWidth - timeWidth - 4

      // Header
      UI.println(
        UI.Style.TEXT_DIM + "Session ID".padEnd(idWidth) + "  " +
        "Last Updated".padEnd(timeWidth) + "  " +
        "Title"
      )

      // Session rows
      sessions.forEach(session => {
        const shortId = session.id.slice(-idWidth).padStart(idWidth)
        const time = new Date(session.time.updated).toLocaleString().padEnd(timeWidth)
        const title = session.title.length > titleWidth 
          ? session.title.slice(0, titleWidth - 3) + "..."
          : session.title.padEnd(titleWidth)
        
        UI.println(
          UI.Style.TEXT_INFO + shortId + "  " +
          UI.Style.TEXT_NORMAL + time + "  " +
          UI.Style.TEXT_HIGHLIGHT + title
        )
      })
    })
  },
})

export const SessionCommand = cmd({
  command: "session",
  describe: "manage sessions",
  builder: (yargs) =>
    yargs
      .command(SessionListCommand)
      .demandCommand(),
  async handler() {},
})
      .command({
        command: "list",
        describe: "list all sessions with their IDs",
        builder: (yargs: Argv) => {
          return yargs
            .option("format", {
              alias: "f",
              describe: "output format",
              type: "string",
              choices: ["default", "json", "ids"],
              default: "default",
            })
            .option("limit", {
              alias: "l",
              describe: "limit number of sessions shown",
              type: "number",
            })
        },
        handler: async (args) => {
          await bootstrap(process.cwd(), async () => {
            const sessions = []
            for await (const session of Session.list()) {
              sessions.push(session)
            }

            if (sessions.length === 0) {
              UI.println("No sessions found")
              return
            }

            sessions.sort((a, b) => b.time.updated - a.time.updated)

            if (args.limit) {
              sessions.splice(args.limit)
            }

            if (args.format === "json") {
              process.stdout.write(JSON.stringify(sessions, null, 2) + EOL)
              return
            }

            if (args.format === "ids") {
              sessions.forEach((session) => {
                process.stdout.write(session.id + EOL)
              })
              return
            }

            // Default format - similar to git log
            const terminalWidth = process.stdout.columns || 80
            const idWidth = Math.min(20, Math.max(8, Math.max(...sessions.map((s) => s.id.length))))
            const timeWidth = 19
            const titleWidth = terminalWidth - idWidth - timeWidth - 4

            UI.println(
              UI.Style.TEXT_DIM +
                "Session ID".padEnd(idWidth) +
                "  " +
                "Last Updated".padEnd(timeWidth) +
                "  " +
                "Title",
            )

            sessions.forEach((session) => {
              const shortId = session.id.slice(-idWidth).padStart(idWidth)
              const time = new Date(session.time.updated).toLocaleString().padEnd(timeWidth)
              const title =
                session.title.length > titleWidth
                  ? session.title.slice(0, titleWidth - 3) + "..."
                  : session.title.padEnd(titleWidth)

              UI.println(
                UI.Style.TEXT_INFO +
                  shortId +
                  "  " +
                  UI.Style.TEXT_NORMAL +
                  time +
                  "  " +
                  UI.Style.TEXT_HIGHLIGHT +
                  title,
              )
            })
          })
        },
      })
      .demandCommand(1, "You need to specify a subcommand")
      .strict()
  },
  handler: async () => {
    // This handler won't be called due to demandCommand
  },
})
