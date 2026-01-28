import z from "zod"
import { Tool } from "./tool"
import { Auth } from "../auth"
import { createVaultAIClient } from "../vaultai/client"

export const VaultAITool = Tool.define("vaultai", async () => {
  return {
    description: `Query your VaultAI account to get information about your files, meetings, tasks, projects, and more.

Use this tool when you need to:
- Get information from the user's VaultAI account (files, meetings, tasks, projects)
- Search documents or meetings for specific information
- Get task lists, project details, or meeting summaries
- Access any data stored in VaultAI

The query should be a natural language question about the user's VaultAI data.

Examples:
- "Liste mes réunions de cette semaine"
- "Quelles sont mes tâches en cours ?"
- "Résume ma dernière réunion avec le client"
- "Cherche les documents sur le projet X"
- "Quels fichiers PDF ai-je uploadés récemment ?"`,

    parameters: z.object({
      query: z.string().describe("Natural language query about your VaultAI data"),
    }),

    async execute(params, ctx): Promise<{ output: string; title: string; metadata: Record<string, unknown> }> {
      // Check if VaultAI is connected
      const vaultaiAuth = await Auth.VaultAIHelper.getCurrent()
      if (!vaultaiAuth) {
        return {
          output: "VaultAI is not connected. Use the /vaultai command to connect your account.",
          title: "VaultAI: Not connected",
          metadata: { connected: false },
        }
      }

      // Ask for permission
      await ctx.ask({
        permission: "vaultai",
        patterns: [params.query],
        always: ["*"],
        metadata: {
          query: params.query,
          instanceUrl: vaultaiAuth.instanceUrl,
        },
      })

      const client = createVaultAIClient(vaultaiAuth.instanceUrl, vaultaiAuth.sessionToken)

      // Verify session is still valid
      const session = await client.getSession()
      if (!session.user) {
        return {
          output: "VaultAI session expired. Please reconnect using /vaultai.",
          title: "VaultAI: Session expired",
          metadata: { connected: false, expired: true },
        }
      }

      try {
        // Use smartQuery for direct SDK execution
        const result = await client.smartQuery(params.query)

        if (!result.success) {
          return {
            output: `Erreur VaultAI: ${result.error || "Erreur inconnue"}`,
            title: `VaultAI: ${result.description}`,
            metadata: { connected: true, error: true },
          }
        }

        // Format the result
        let formattedOutput: string

        if (result.result === null || result.result === undefined) {
          formattedOutput = "Aucun résultat trouvé."
        } else if (Array.isArray(result.result)) {
          if (result.result.length === 0) {
            formattedOutput = "Aucun élément trouvé."
          } else {
            // Format array results as a readable list
            formattedOutput = result.result.map((item: any, idx: number) => {
              if (typeof item === "object") {
                // Format task/project/meeting objects nicely
                const title = item.title || item.name || item.id || "Sans titre"
                const status = item.status ? ` [${item.status}]` : ""
                const priority = item.priority ? ` (${item.priority})` : ""
                const dueDate = item.dueDate ? ` - Échéance: ${new Date(item.dueDate).toLocaleDateString("fr-FR")}` : ""
                const desc = item.description 
                  ? `\n   ${item.description.substring(0, 100)}${item.description.length > 100 ? "..." : ""}` 
                  : ""
                return `${idx + 1}. ${title}${status}${priority}${dueDate}${desc}`
              }
              return `${idx + 1}. ${item}`
            }).join("\n")
          }
        } else if (typeof result.result === "object") {
          formattedOutput = JSON.stringify(result.result, null, 2)
        } else {
          formattedOutput = String(result.result)
        }

        return {
          output: `**${result.description}**\n\n${formattedOutput}`,
          title: `VaultAI: ${result.description}`,
          metadata: {
            connected: true,
            user: session.user.email,
            itemCount: Array.isArray(result.result) ? result.result.length : 1,
          },
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("VaultAI request was cancelled")
        }

        return {
          output: `Error querying VaultAI: ${error instanceof Error ? error.message : "Unknown error"}`,
          title: "VaultAI: Error",
          metadata: { connected: true, error: true },
        }
      }
    },
  }
})
