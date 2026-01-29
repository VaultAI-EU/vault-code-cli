/**
 * VaultAI Types (Simplified)
 * 
 * Only the types needed for vault-code-cli integration.
 * The full SDK runs server-side in VaultAI.
 */

// ============================================================================
// AUTH & SESSION
// ============================================================================

export type OAuthProvider = "google" | "microsoft"

export interface VaultAIInstanceInfo {
  type: "vaultai"
  apiVersion: number
  minCliVersion: string
  url: string
  name: string
  logo: string | null
  auth: {
    google: boolean
    microsoft: boolean
    email: boolean
    credentials: boolean
  }
  features: {
    chat: boolean
    rag: boolean
    projects: boolean
    mcp: boolean
  }
}

export interface VaultAIUser {
  id: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  organizationId: string | null
  role: string
}

export interface VaultAISession {
  user: VaultAIUser | null
}

// ============================================================================
// CONTEXT (for prompt enrichment)
// ============================================================================

export interface ProjectMetadata {
  id: string
  name: string
  description: string | null
  createdAt: Date | string
}

export interface ChatMetadata {
  id: string
  title: string
  createdAt: Date | string
  updatedAt: Date | string
  projectId?: string
  isFavorite: boolean
}

export interface TaskItem {
  id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "done" | "cancelled"
  priority: "low" | "medium" | "high" | "urgent" | null
  dueDate: Date | string | null
  projectId: string | null
}

export interface VaultAIContext {
  user: VaultAIUser
  projects: ProjectMetadata[]
  tasks?: TaskItem[]
  recentChats: ChatMetadata[]
  mcpServers: Array<{ id: string; name: string }>
  quotas: {
    tokensUsed: number
    tokensLimit: number | null
    messagesUsed: number
    messagesLimit: number | null
  }
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface HistoryResponse {
  chatsWithoutProject: ChatMetadata[]
  projects: ProjectMetadata[]
}
