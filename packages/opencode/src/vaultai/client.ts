/**
 * VaultAI Client (Simplified)
 *
 * HTTP client for communicating with VaultAI instances.
 * Uses /api/chat for all queries - VaultAI's AI has access to the full SDK.
 */

import type {
  VaultAIInstanceInfo,
  VaultAISession,
  VaultAIContext,
  VaultAIUser,
  OAuthProvider,
  HistoryResponse,
} from "./types"

// Query patterns mapped to SDK code
// This allows direct execution without relying on AI to generate code
const QUERY_PATTERNS: Array<{ patterns: RegExp[]; code: string; description: string }> = [
  // Tasks
  {
    patterns: [/tâches?\s*(en cours|actives?|in.?progress)/i, /tasks?\s*(in.?progress|active|current)/i],
    code: `const tasks = await vault.tasks.list({ status: "in_progress" }); return tasks;`,
    description: "Tâches en cours",
  },
  {
    patterns: [/tâches?|tasks?|todo/i, /mes\s+tâches/i, /my\s+tasks/i],
    code: `const tasks = await vault.tasks.list(); return tasks;`,
    description: "Toutes les tâches",
  },
  {
    patterns: [/tâches?\s*(aujourd'?hui|du jour|today)/i, /tasks?\s*due\s*today/i],
    code: `const tasks = await vault.tasks.listDueToday(); return tasks;`,
    description: "Tâches du jour",
  },
  {
    patterns: [/tâches?\s*(en retard|overdue|late)/i, /overdue\s*tasks?/i],
    code: `const tasks = await vault.tasks.listOverdue(); return tasks;`,
    description: "Tâches en retard",
  },
  // Projects
  {
    patterns: [/projets?|projects?/i, /mes\s+projets/i, /my\s+projects/i],
    code: `const projects = await vault.projects.list(); return projects;`,
    description: "Projets",
  },
  // Meetings
  {
    patterns: [/réunions?|meetings?/i, /mes\s+réunions/i, /my\s+meetings/i],
    code: `const meetings = await vault.meetings.list(); return meetings;`,
    description: "Réunions",
  },
  // Files
  {
    patterns: [/fichiers?|files?|documents?/i, /mes\s+fichiers/i, /my\s+files/i],
    code: `const files = await vault.files.list(); return files;`,
    description: "Fichiers",
  },
  // Chats/History
  {
    patterns: [/conversations?|chats?|historique/i, /mes\s+conversations/i],
    code: `const chats = await vault.chats.list(); return chats;`,
    description: "Conversations",
  },
]

/**
 * Match a query to a known pattern and return the corresponding SDK code
 */
function matchQueryToCode(query: string): { code: string; description: string } | null {
  for (const pattern of QUERY_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(query)) {
        return { code: pattern.code, description: pattern.description }
      }
    }
  }
  return null
}

/**
 * Generate code for a search query
 */
function generateSearchCode(query: string): string {
  // Extract search terms by removing common question words
  const searchTerms = query
    .replace(/^(cherche|search|trouve|find|où|where|quoi|what|comment|how|montre|show|liste|list)\s*/i, "")
    .replace(/\?$/g, "")
    .trim()

  return `const results = await vault.search.all("${searchTerms.replace(/"/g, '\\"')}"); return results;`
}

export class VaultAIClient {
  private baseURL: string
  private sessionToken: string | null = null

  constructor(baseURL: string, sessionToken?: string) {
    this.baseURL = baseURL.replace(/\/$/, "")
    this.sessionToken = sessionToken ?? null
  }

  setSessionToken(token: string) {
    this.sessionToken = token
  }

  getBaseURL(): string {
    return this.baseURL
  }

  get instanceUrl(): string {
    return this.baseURL
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private async authFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    if (this.sessionToken) {
      headers["Cookie"] = `better-auth.session_token=${this.sessionToken}`
    }

    return fetch(`${this.baseURL}${path}`, { ...options, headers })
  }

  private async fetchJSON<T>(path: string, options?: RequestInit): Promise<T | null> {
    try {
      const response = await this.authFetch(path, options)
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }

  // ============================================================================
  // INSTANCE & AUTH
  // ============================================================================

  async getInstanceInfo(): Promise<VaultAIInstanceInfo | null> {
    try {
      const response = await fetch(`${this.baseURL}/api/cli/instance-info`)
      if (!response.ok) return null
      const data = await response.json()
      if (data.type !== "vaultai") return null
      return data as VaultAIInstanceInfo
    } catch {
      return null
    }
  }

  getOAuthLoginURL(provider: OAuthProvider): string {
    return `${this.baseURL}/api/auth/cli/${provider}`
  }

  async getSession(): Promise<VaultAISession> {
    if (!this.sessionToken) return { user: null }

    try {
      const response = await this.authFetch("/api/cli/session")

      if (!response.ok) {
        console.error(`[VaultAI getSession] HTTP ${response.status}: ${response.statusText}`)
        const text = await response.text()
        console.error(`[VaultAI getSession] Response body: ${text}`)
        return { user: null }
      }

      const data = await response.json()
      return data ?? { user: null }
    } catch (error) {
      console.error("[VaultAI getSession] Error:", error)
      return { user: null }
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession()
    return session.user !== null
  }

  async loginWithCredentials(
    email: string,
    password: string,
  ): Promise<{ token: string | null; user: VaultAIUser | null; error?: string; twoFactorRequired?: boolean }> {
    try {
      const response = await fetch(`${this.baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return { token: null, user: null, error: errorData.message || "Invalid credentials" }
      }

      const data = await response.json()

      // Check if 2FA is required
      if (data.twoFactorRedirect) {
        // Extract the 2FA session token from cookies
        const setCookie = response.headers.get("set-cookie")
        const twoFactorMatch = setCookie?.match(/better-auth\.two_factor=([^;]+)/)
        if (twoFactorMatch) {
          this.sessionToken = twoFactorMatch[1]
        }
        return { token: null, user: null, twoFactorRequired: true }
      }

      const token = data.token || data.session?.token

      if (!token) {
        const setCookie = response.headers.get("set-cookie")
        const tokenMatch = setCookie?.match(/better-auth\.session_token=([^;]+)/)
        if (tokenMatch) {
          this.sessionToken = tokenMatch[1]
          const session = await this.getSession()
          return { token: tokenMatch[1], user: session.user }
        }
        return { token: null, user: null, error: "No session token received" }
      }

      this.sessionToken = token
      const session = await this.getSession()
      return { token, user: session.user }
    } catch (error) {
      return { token: null, user: null, error: error instanceof Error ? error.message : "Login failed" }
    }
  }

  async verifyTotp(code: string): Promise<{ token: string | null; user: VaultAIUser | null; error?: string }> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      // Include the 2FA session token if we have one
      if (this.sessionToken) {
        headers["Cookie"] = `better-auth.two_factor=${this.sessionToken}`
      }

      const response = await fetch(`${this.baseURL}/api/auth/two-factor/verify-totp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ code }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return { token: null, user: null, error: errorData.message || "Invalid code" }
      }

      // Extract session token from response
      const setCookie = response.headers.get("set-cookie")
      const tokenMatch = setCookie?.match(/better-auth\.session_token=([^;]+)/)

      if (tokenMatch) {
        this.sessionToken = tokenMatch[1]
        const session = await this.getSession()
        return { token: tokenMatch[1], user: session.user }
      }

      const data = await response.json()
      const token = data.token || data.session?.token

      if (token) {
        this.sessionToken = token
        const session = await this.getSession()
        return { token, user: session.user }
      }

      return { token: null, user: null, error: "No session token received after 2FA" }
    } catch (error) {
      return { token: null, user: null, error: error instanceof Error ? error.message : "2FA verification failed" }
    }
  }

  async verifyBackupCode(code: string): Promise<{ token: string | null; user: VaultAIUser | null; error?: string }> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      // Include the 2FA session token if we have one
      if (this.sessionToken) {
        headers["Cookie"] = `better-auth.two_factor=${this.sessionToken}`
      }

      const response = await fetch(`${this.baseURL}/api/auth/two-factor/verify-backup-code`, {
        method: "POST",
        headers,
        body: JSON.stringify({ code }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return { token: null, user: null, error: errorData.message || "Invalid backup code" }
      }

      // Extract session token from response
      const setCookie = response.headers.get("set-cookie")
      const tokenMatch = setCookie?.match(/better-auth\.session_token=([^;]+)/)

      if (tokenMatch) {
        this.sessionToken = tokenMatch[1]
        const session = await this.getSession()
        return { token: tokenMatch[1], user: session.user }
      }

      const data = await response.json()
      const token = data.token || data.session?.token

      if (token) {
        this.sessionToken = token
        const session = await this.getSession()
        return { token, user: session.user }
      }

      return { token: null, user: null, error: "No session token received after backup code verification" }
    } catch (error) {
      return {
        token: null,
        user: null,
        error: error instanceof Error ? error.message : "Backup code verification failed",
      }
    }
  }

  // ============================================================================
  // CONTEXT (for dashboard/enrichment)
  // ============================================================================

  async getContext(): Promise<VaultAIContext | null> {
    if (!this.sessionToken) return null

    try {
      // Fetch session, history, projects, and tasks in parallel
      const [session, historyData, projectsResult, tasksResult] = await Promise.all([
        this.getSession(),
        this.fetchJSON<HistoryResponse>("/api/history?limit=10").catch(() => null),
        this.executeCode(`const projects = await vault.projects.list(); return projects;`).catch(() => ({
          success: false,
          result: [],
        })),
        this.executeCode(`const tasks = await vault.tasks.list({ status: "in_progress" }); return tasks;`).catch(
          () => ({ success: false, result: [] }),
        ),
      ])

      if (!session.user) return null

      // Parse projects from execute result
      const projects =
        projectsResult.success && Array.isArray(projectsResult.result)
          ? projectsResult.result.map((p: any) => ({
              id: p.id,
              name: p.name || p.title || "Untitled",
              description: p.description || null,
              createdAt: p.createdAt || p.created_at || new Date().toISOString(),
            }))
          : []

      // Parse tasks from execute result
      const tasks =
        tasksResult.success && Array.isArray(tasksResult.result)
          ? tasksResult.result.map((t: any) => ({
              id: t.id,
              title: t.title || t.name || "Untitled",
              description: t.description || null,
              status: t.status || "in_progress",
              priority: t.priority || null,
              dueDate: t.dueDate || t.due_date || null,
              projectId: t.projectId || t.project_id || null,
            }))
          : []

      // Parse chats from history
      const recentChats = historyData?.chatsWithoutProject
        ? historyData.chatsWithoutProject.map((chat: any) => ({
            id: chat.id,
            title: chat.title || "New chat",
            projectId: chat.projectId,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            isFavorite: chat.is_favorite || false,
          }))
        : []

      return {
        user: session.user,
        projects,
        tasks,
        recentChats,
        mcpServers: [],
        quotas: {
          tokensUsed: 0,
          tokensLimit: null,
          messagesUsed: recentChats.length,
          messagesLimit: null,
        },
      }
    } catch (error) {
      console.error("[VaultAI getContext] Error:", error)
      return null
    }
  }

  async getHistory(options?: { limit?: number; offset?: number }) {
    const params = new URLSearchParams()
    if (options?.limit) params.set("limit", String(options.limit))
    if (options?.offset) params.set("offset", String(options.offset))
    return this.fetchJSON<HistoryResponse>(`/api/history?${params}`)
  }

  // ============================================================================
  // MODELS
  // ============================================================================

  /**
   * Get available models from VaultAI
   */
  async getModels(): Promise<Array<{ id: string; name: string; isActive: boolean; isDefault: boolean }>> {
    const data =
      await this.fetchJSON<Array<{ id: string; name: string; isActive: boolean; isDefault: boolean }>>(
        "/api/models?active=true",
      )
    return data ?? []
  }

  /**
   * Get the default model ID
   */
  async getDefaultModelId(): Promise<string | null> {
    const models = await this.getModels()
    // Find default model first
    const defaultModel = models.find((m) => m.isDefault)
    if (defaultModel) return defaultModel.id
    // Fallback to first active model
    if (models.length > 0) return models[0].id
    return null
  }

  // ============================================================================
  // SMART QUERY (Direct SDK execution with pattern matching)
  // ============================================================================

  /**
   * Smart query that matches the user's question to SDK code and executes it directly
   * This bypasses the AI and gets data directly from VaultAI
   */
  async smartQuery(query: string): Promise<{
    success: boolean
    result: any
    description: string
    error?: string
  }> {
    // Try to match the query to a known pattern
    const match = matchQueryToCode(query)

    let code: string
    let description: string

    if (match) {
      code = match.code
      description = match.description
    } else {
      // Fallback: use search
      code = generateSearchCode(query)
      description = `Recherche: ${query}`
    }

    // Execute the code directly
    const result = await this.executeCode(code)

    return {
      success: result.success,
      result: result.result,
      description,
      error: result.error,
    }
  }

  // ============================================================================
  // CHAT API (Fallback - uses AI to interpret complex queries)
  // ============================================================================

  /**
   * Query VaultAI using the chat API (for complex queries that don't match patterns)
   */
  async chatQuery(
    message: string,
    options?: {
      chatId?: string
      modelId?: string
      signal?: AbortSignal
    },
  ): Promise<Response> {
    // Get model ID - use provided or fetch default
    let modelId: string | undefined = options?.modelId
    if (!modelId) {
      const defaultModelId = await this.getDefaultModelId()
      if (!defaultModelId) {
        throw new Error("No active models available in VaultAI")
      }
      modelId = defaultModelId
    }

    // Generate a proper UUID for new chats
    const chatId = options?.chatId || crypto.randomUUID()

    return this.authFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", content: message }],
        modelId,
        data: JSON.stringify({
          selectedTools: ["executeTools", "ragSearch", "meetingSearch"],
        }),
      }),
      signal: options?.signal,
    })
  }

  // ============================================================================
  // EXECUTE CODE (Direct SDK execution)
  // ============================================================================

  /**
   * Execute JavaScript code with the VaultAI SDK
   * This is the direct way to get data without going through the AI
   */
  async executeCode(code: string): Promise<{ success: boolean; result: any; error?: string }> {
    try {
      const response = await this.authFetch("/api/execute-code", {
        method: "POST",
        body: JSON.stringify({ code }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, result: null, error: `API error: ${errorText}` }
      }

      return await response.json()
    } catch (error) {
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Parse SSE response and extract tool calls that need execution
   */
  static parseSSEWithToolCalls(text: string): {
    textContent: string
    toolCalls: Array<{ toolName: string; args: any; toolCallId: string }>
    toolResults: string[]
  } {
    let textContent = ""
    const toolCalls: Array<{ toolName: string; args: any; toolCallId: string }> = []
    const toolResults: string[] = []

    const lines = text.split("\n")
    for (const line of lines) {
      if (!line || !line.includes(":")) continue

      const prefixEnd = line.indexOf(":")
      const prefix = line.substring(0, prefixEnd)
      const content = line.substring(prefixEnd + 1)

      try {
        if (prefix === "0") {
          // Text content
          const parsed = JSON.parse(content)
          if (typeof parsed === "string") {
            textContent += parsed
          }
        } else if (prefix === "8") {
          // Tool call - need to execute this!
          const parsed = JSON.parse(content)
          if (parsed.toolName && parsed.args) {
            toolCalls.push({
              toolName: parsed.toolName,
              args: parsed.args,
              toolCallId: parsed.toolCallId || crypto.randomUUID(),
            })
          }
        } else if (prefix === "9") {
          // Tool result (already executed)
          const parsed = JSON.parse(content)
          if (parsed.result) {
            if (typeof parsed.result === "string") {
              toolResults.push(parsed.result)
            } else {
              toolResults.push(JSON.stringify(parsed.result, null, 2))
            }
          }
        } else if (prefix === "2") {
          // Custom data
          const parsed = JSON.parse(content)
          if (parsed.type === "error") {
            textContent += `Error: ${parsed.content || parsed.message}\n`
          }
        }
      } catch {
        if (prefix === "0") {
          textContent += content
        }
      }
    }

    return { textContent, toolCalls, toolResults }
  }

  /**
   * Parse SSE response from VaultAI chat API (simple version for text-only responses)
   */
  static parseSSEResponse(text: string): string {
    const { textContent, toolResults } = this.parseSSEWithToolCalls(text)

    if (!textContent.trim() && toolResults.length > 0) {
      return toolResults.join("\n\n")
    }

    return textContent.trim()
  }

  // ============================================================================
  // V1 API (OpenAI-Compatible)
  // ============================================================================

  /**
   * Get models list in OpenAI-compatible format
   */
  async getV1Models(): Promise<VaultAIV1ModelsResponse | null> {
    return this.fetchJSON<VaultAIV1ModelsResponse>("/api/v1/models")
  }

  /**
   * Get usage statistics
   */
  async getV1Usage(): Promise<VaultAIV1UsageResponse | null> {
    return this.fetchJSON<VaultAIV1UsageResponse>("/api/v1/usage")
  }

  /**
   * Get the base URL for OpenAI-compatible API
   */
  getV1BaseURL(): string {
    return `${this.instanceUrl}/api/v1`
  }
}

// ============================================================================
// V1 API TYPES (OpenAI-Compatible)
// ============================================================================

export interface VaultAIV1Model {
  id: string
  object: "model"
  created: number
  owned_by: string
  vaultai?: {
    provider: string
    name: string
    description: string | null
    supportsVision: boolean
    isDefault: boolean
    isDefaultThinking: boolean
    modality: string
    toolsDisabled: boolean
  }
}

export interface VaultAIV1ModelsResponse {
  object: "list"
  data: VaultAIV1Model[]
}

export interface VaultAIV1UsageResponse {
  object: "usage"
  total_tokens: number
  prompt_tokens: number
  completion_tokens: number
  message_count: number
  by_model: Array<{
    model: string
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    message_count: number
  }>
  quota: {
    tokens_limit: number | null
    tokens_remaining: number | null
    messages_limit: number | null
    messages_remaining: number | null
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createVaultAIClient(instanceUrl: string, sessionToken?: string): VaultAIClient {
  return new VaultAIClient(instanceUrl, sessionToken)
}

export async function validateVaultAIInstance(
  url: string,
): Promise<{ valid: boolean; info?: VaultAIInstanceInfo; error?: string }> {
  try {
    let normalizedUrl = url.trim()
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = `https://${normalizedUrl}`
    }
    normalizedUrl = normalizedUrl.replace(/\/$/, "")

    const client = createVaultAIClient(normalizedUrl)
    const info = await client.getInstanceInfo()

    if (!info) {
      return { valid: false, error: "Not a valid VaultAI instance" }
    }

    return { valid: true, info }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Connection failed" }
  }
}
