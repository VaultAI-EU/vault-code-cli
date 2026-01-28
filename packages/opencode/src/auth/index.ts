import path from "path"
import { Global } from "../global"
import fs from "fs/promises"
import z from "zod"

export const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"

export namespace Auth {
  export const Oauth = z
    .object({
      type: z.literal("oauth"),
      refresh: z.string(),
      access: z.string(),
      expires: z.number(),
      accountId: z.string().optional(),
      enterpriseUrl: z.string().optional(),
    })
    .meta({ ref: "OAuth" })

  export const Api = z
    .object({
      type: z.literal("api"),
      key: z.string(),
    })
    .meta({ ref: "ApiAuth" })

  export const WellKnown = z
    .object({
      type: z.literal("wellknown"),
      key: z.string(),
      token: z.string(),
    })
    .meta({ ref: "WellKnownAuth" })

  // VaultAI session-based authentication
  export const VaultAI = z
    .object({
      type: z.literal("vaultai"),
      instanceUrl: z.string(),
      sessionToken: z.string(),
      user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string().optional(),
        organization_id: z.string().optional(),
      }),
      expiresAt: z.string().optional(),
    })
    .meta({ ref: "VaultAIAuth" })

  export const Info = z.discriminatedUnion("type", [Oauth, Api, WellKnown, VaultAI]).meta({ ref: "Auth" })
  export type Info = z.infer<typeof Info>

  const filepath = path.join(Global.Path.data, "auth.json")

  export async function get(providerID: string) {
    const auth = await all()
    return auth[providerID]
  }

  export async function all(): Promise<Record<string, Info>> {
    const file = Bun.file(filepath)
    const data = await file.json().catch(() => ({}) as Record<string, unknown>)
    return Object.entries(data).reduce(
      (acc, [key, value]) => {
        const parsed = Info.safeParse(value)
        if (!parsed.success) return acc
        acc[key] = parsed.data
        return acc
      },
      {} as Record<string, Info>,
    )
  }

  export async function set(key: string, info: Info) {
    const file = Bun.file(filepath)
    const data = await all()
    await Bun.write(file, JSON.stringify({ ...data, [key]: info }, null, 2))
    await fs.chmod(file.name!, 0o600)
  }

  export async function remove(key: string) {
    const file = Bun.file(filepath)
    const data = await all()
    delete data[key]
    await Bun.write(file, JSON.stringify(data, null, 2))
    await fs.chmod(file.name!, 0o600)
  }

  // VaultAI-specific helpers
  export namespace VaultAIHelper {
    const VAULTAI_KEY_PREFIX = "vaultai:"

    /**
     * Get the key for a VaultAI instance
     */
    export function getKey(instanceUrl: string): string {
      const url = new URL(instanceUrl)
      return `${VAULTAI_KEY_PREFIX}${url.host}`
    }

    /**
     * Get VaultAI auth for a specific instance
     */
    export async function getForInstance(instanceUrl: string): Promise<z.infer<typeof VaultAI> | null> {
      const key = getKey(instanceUrl)
      const auth = await get(key)
      if (auth?.type === "vaultai") {
        return auth
      }
      return null
    }

    /**
     * Get all VaultAI instances
     */
    export async function getAllInstances(): Promise<Array<{ key: string; auth: z.infer<typeof VaultAI> }>> {
      const allAuth = await all()
      const instances: Array<{ key: string; auth: z.infer<typeof VaultAI> }> = []
      for (const [key, auth] of Object.entries(allAuth)) {
        if (key.startsWith(VAULTAI_KEY_PREFIX) && auth.type === "vaultai") {
          instances.push({ key, auth })
        }
      }
      return instances
    }

    /**
     * Get the current/default VaultAI instance
     */
    export async function getCurrent(): Promise<z.infer<typeof VaultAI> | null> {
      const instances = await getAllInstances()
      if (instances.length === 0) return null
      // Return the first instance for now (could add a "current" flag later)
      return instances[0].auth
    }

    /**
     * Save VaultAI auth for an instance
     */
    export async function save(
      instanceUrl: string,
      sessionToken: string,
      user: { id: string; email: string; name?: string; organization_id?: string },
      expiresAt?: string
    ) {
      const key = getKey(instanceUrl)
      await set(key, {
        type: "vaultai",
        instanceUrl,
        sessionToken,
        user,
        expiresAt,
      })
    }

    /**
     * Remove VaultAI auth for an instance
     */
    export async function removeInstance(instanceUrl: string) {
      const key = getKey(instanceUrl)
      await remove(key)
    }

    /**
     * Check if session is valid (not expired)
     */
    export function isSessionValid(auth: z.infer<typeof VaultAI>): boolean {
      if (!auth.expiresAt) return true
      return new Date(auth.expiresAt) > new Date()
    }

    /**
     * Verify session with the server
     */
    export async function verifySession(auth: z.infer<typeof VaultAI>): Promise<boolean> {
      try {
        const response = await fetch(`${auth.instanceUrl}/api/cli/session`, {
          headers: {
            Cookie: `better-auth.session_token=${auth.sessionToken}`,
          },
        })
        if (!response.ok) return false
        const data = await response.json()
        return !!data.user
      } catch {
        return false
      }
    }
  }
}
