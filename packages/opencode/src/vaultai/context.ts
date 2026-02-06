/**
 * VaultAI Context Enrichment
 *
 * Fetches context from VaultAI to enrich the system prompt.
 * This allows the LLM to know about the user's VaultAI data.
 */

import { Auth } from "../auth"
import { createVaultAIClient } from "./client"
import type { VaultAIContext } from "./types"

export namespace VaultAIContextEnrichment {
  // Cache the context to avoid repeated API calls
  let cachedContext: VaultAIContext | null = null
  let cacheTimestamp = 0
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  /**
   * Get VaultAI context, with caching
   */
  export async function getContext(): Promise<VaultAIContext | null> {
    const vaultaiAuth = await Auth.VaultAIHelper.getCurrent()
    if (!vaultaiAuth) return null

    // Check cache
    if (cachedContext && Date.now() - cacheTimestamp < CACHE_TTL) {
      return cachedContext
    }

    try {
      const client = createVaultAIClient(vaultaiAuth.instanceUrl, vaultaiAuth.sessionToken)
      const context = await client.getContext()

      if (context) {
        cachedContext = context
        cacheTimestamp = Date.now()
      }

      return context
    } catch (error) {
      console.error("[VaultAI Context] Error fetching context:", error)
      return cachedContext // Return stale cache if available
    }
  }

  /**
   * Clear cached context (call after logout or reconnect)
   */
  export function clearCache() {
    cachedContext = null
    cacheTimestamp = 0
  }

  /**
   * Format context for system prompt injection
   */
  function formatForPrompt(context: VaultAIContext): string {
    const sections: string[] = []

    sections.push(`  Connected as: ${context.user.email}`)

    // Projects
    if (context.projects.length > 0) {
      sections.push(``)
      sections.push(`  Projects (${context.projects.length}):`)
      for (const project of context.projects.slice(0, 5)) {
        sections.push(`    - ${project.name}${project.description ? `: ${project.description}` : ""}`)
      }
      if (context.projects.length > 5) {
        sections.push(`    ... and ${context.projects.length - 5} more`)
      }
    }

    // Tasks
    if (context.tasks && context.tasks.length > 0) {
      sections.push(``)
      sections.push(`  Tasks in progress (${context.tasks.length}):`)
      for (const task of context.tasks.slice(0, 5)) {
        const dueInfo = task.dueDate ? ` (due: ${new Date(task.dueDate).toLocaleDateString()})` : ""
        sections.push(`    - ${task.title}${dueInfo}`)
      }
      if (context.tasks.length > 5) {
        sections.push(`    ... and ${context.tasks.length - 5} more`)
      }
    }

    // Recent chats
    if (context.recentChats.length > 0) {
      sections.push(``)
      sections.push(`  Recent conversations (${context.recentChats.length}):`)
      for (const chat of context.recentChats.slice(0, 5)) {
        sections.push(`    - ${chat.title}`)
      }
      if (context.recentChats.length > 5) {
        sections.push(`    ... and ${context.recentChats.length - 5} more`)
      }
    }

    return sections.join("\n")
  }

  /**
   * Get full enrichment for system prompt
   */
  export async function getPromptEnrichment(): Promise<string> {
    const vaultaiAuth = await Auth.VaultAIHelper.getCurrent()
    if (!vaultaiAuth) {
      return "" // No VaultAI connected
    }

    try {
      const context = await getContext()

      const parts: string[] = []

      parts.push(`<vaultai>`)
      parts.push(`The user is connected to VaultAI (${vaultaiAuth.instanceUrl}).`)
      parts.push(`You have a "vaultai" tool to query their files, meetings, tasks, and projects.`)
      parts.push(`Use it when you need information from their VaultAI account.`)

      if (context) {
        parts.push(``)
        parts.push(formatForPrompt(context))
      }

      parts.push(`</vaultai>`)

      return parts.join("\n")
    } catch (error) {
      console.error("[VaultAI Context] Error building enrichment:", error)
      return ""
    }
  }
}
