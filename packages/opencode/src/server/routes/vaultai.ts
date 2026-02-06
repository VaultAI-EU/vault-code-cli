import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Auth } from "../../auth"
import { Provider } from "../../provider/provider"
import { createVaultAIClient, validateVaultAIInstance } from "../../vaultai"
import type { VaultAIInstanceInfo, OAuthProvider } from "../../vaultai"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

const VaultAIInstanceInfoSchema = z.object({
  type: z.literal("vaultai"),
  apiVersion: z.number(),
  minCliVersion: z.string(),
  url: z.string(),
  name: z.string(),
  logo: z.string().nullable(),
  auth: z.object({
    google: z.boolean(),
    microsoft: z.boolean(),
    email: z.boolean(),
    credentials: z.boolean(),
  }),
  features: z.object({
    chat: z.boolean(),
    rag: z.boolean(),
    projects: z.boolean(),
    mcp: z.boolean(),
  }),
})

const VaultAIUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  organizationId: z.string().nullable(),
  role: z.string(),
})

const VaultAIInstanceSchema = z.object({
  key: z.string(),
  instanceUrl: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().optional(),
    organization_id: z.string().optional(),
  }),
  sessionValid: z.boolean(),
})

export const VaultAIRoutes = lazy(() =>
  new Hono()
    .post(
      "/validate",
      describeRoute({
        summary: "Validate VaultAI instance",
        description: "Check if a URL is a valid VaultAI instance and get instance info",
        operationId: "vaultai.validate",
        responses: {
          200: {
            description: "Validation result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    valid: z.boolean(),
                    info: VaultAIInstanceInfoSchema.optional(),
                    error: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          url: z.string().meta({ description: "VaultAI instance URL" }),
        }),
      ),
      async (c) => {
        const { url } = c.req.valid("json")
        const result = await validateVaultAIInstance(url)
        return c.json(result)
      },
    )
    .post(
      "/login",
      describeRoute({
        summary: "Login to VaultAI",
        description: "Authenticate with VaultAI using email/password credentials",
        operationId: "vaultai.login",
        responses: {
          200: {
            description: "Login result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    success: z.boolean(),
                    user: VaultAIUserSchema.optional(),
                    twoFactorRequired: z.boolean().optional(),
                    error: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          instanceUrl: z.string().meta({ description: "VaultAI instance URL" }),
          email: z.string().meta({ description: "User email" }),
          password: z.string().meta({ description: "User password" }),
        }),
      ),
      async (c) => {
        const { instanceUrl, email, password } = c.req.valid("json")
        const client = createVaultAIClient(instanceUrl)
        const result = await client.loginWithCredentials(email, password)

        if (result.twoFactorRequired) {
          return c.json({
            success: false,
            twoFactorRequired: true,
          })
        }

        if (result.error || !result.token || !result.user) {
          return c.json({
            success: false,
            error: result.error ?? "Login failed",
          })
        }

        // Save auth credentials
        await Auth.VaultAIHelper.save(instanceUrl, result.token, {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name ?? undefined,
          organization_id: result.user.organizationId ?? undefined,
        })

        // Try to refresh VaultAI provider - may fail if no instance context
        try {
          await Provider.refreshVaultAI()
        } catch {
          // No instance context - models will load when a project is opened
        }

        return c.json({
          success: true,
          user: result.user,
        })
      },
    )
    .post(
      "/verify-totp",
      describeRoute({
        summary: "Verify TOTP code",
        description: "Complete 2FA login with TOTP authenticator code",
        operationId: "vaultai.verifyTotp",
        responses: {
          200: {
            description: "Verification result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    success: z.boolean(),
                    user: VaultAIUserSchema.optional(),
                    error: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          instanceUrl: z.string().meta({ description: "VaultAI instance URL" }),
          email: z.string().meta({ description: "User email" }),
          password: z.string().meta({ description: "User password" }),
          code: z.string().meta({ description: "TOTP code" }),
        }),
      ),
      async (c) => {
        const { instanceUrl, email, password, code } = c.req.valid("json")

        // First login to get the 2FA session token
        const client = createVaultAIClient(instanceUrl)
        const loginResult = await client.loginWithCredentials(email, password)

        if (!loginResult.twoFactorRequired) {
          // No 2FA needed, check if login succeeded
          if (loginResult.token && loginResult.user) {
            await Auth.VaultAIHelper.save(instanceUrl, loginResult.token, {
              id: loginResult.user.id,
              email: loginResult.user.email,
              name: loginResult.user.name ?? undefined,
              organization_id: loginResult.user.organizationId ?? undefined,
            })
            try {
              await Provider.refreshVaultAI()
            } catch {
              // No instance context
            }
            return c.json({ success: true, user: loginResult.user })
          }
          return c.json({ success: false, error: loginResult.error ?? "Login failed" })
        }

        // Now verify TOTP
        const result = await client.verifyTotp(code)

        if (result.error || !result.token || !result.user) {
          return c.json({
            success: false,
            error: result.error ?? "Invalid code",
          })
        }

        await Auth.VaultAIHelper.save(instanceUrl, result.token, {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name ?? undefined,
          organization_id: result.user.organizationId ?? undefined,
        })

        try {
          await Provider.refreshVaultAI()
        } catch {
          // No instance context
        }

        return c.json({
          success: true,
          user: result.user,
        })
      },
    )
    .post(
      "/verify-backup",
      describeRoute({
        summary: "Verify backup code",
        description: "Complete 2FA login with backup code",
        operationId: "vaultai.verifyBackup",
        responses: {
          200: {
            description: "Verification result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    success: z.boolean(),
                    user: VaultAIUserSchema.optional(),
                    error: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          instanceUrl: z.string().meta({ description: "VaultAI instance URL" }),
          email: z.string().meta({ description: "User email" }),
          password: z.string().meta({ description: "User password" }),
          code: z.string().meta({ description: "Backup code" }),
        }),
      ),
      async (c) => {
        const { instanceUrl, email, password, code } = c.req.valid("json")

        // First login to get the 2FA session token
        const client = createVaultAIClient(instanceUrl)
        const loginResult = await client.loginWithCredentials(email, password)

        if (!loginResult.twoFactorRequired) {
          if (loginResult.token && loginResult.user) {
            await Auth.VaultAIHelper.save(instanceUrl, loginResult.token, {
              id: loginResult.user.id,
              email: loginResult.user.email,
              name: loginResult.user.name ?? undefined,
              organization_id: loginResult.user.organizationId ?? undefined,
            })
            try {
              await Provider.refreshVaultAI()
            } catch {
              // No instance context
            }
            return c.json({ success: true, user: loginResult.user })
          }
          return c.json({ success: false, error: loginResult.error ?? "Login failed" })
        }

        // Now verify backup code
        const result = await client.verifyBackupCode(code)

        if (result.error || !result.token || !result.user) {
          return c.json({
            success: false,
            error: result.error ?? "Invalid backup code",
          })
        }

        await Auth.VaultAIHelper.save(instanceUrl, result.token, {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name ?? undefined,
          organization_id: result.user.organizationId ?? undefined,
        })

        try {
          await Provider.refreshVaultAI()
        } catch {
          // No instance context
        }

        return c.json({
          success: true,
          user: result.user,
        })
      },
    )
    .get(
      "/oauth-url",
      describeRoute({
        summary: "Get OAuth login URL",
        description: "Get the URL to redirect user for OAuth login",
        operationId: "vaultai.oauthUrl",
        responses: {
          200: {
            description: "OAuth URL",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    url: z.string(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "query",
        z.object({
          instanceUrl: z.string().meta({ description: "VaultAI instance URL" }),
          provider: z.enum(["google", "microsoft"]).meta({ description: "OAuth provider" }),
        }),
      ),
      async (c) => {
        const { instanceUrl, provider } = c.req.valid("query")
        const client = createVaultAIClient(instanceUrl)
        const url = client.getOAuthLoginURL(provider as OAuthProvider)
        return c.json({ url })
      },
    )
    .post(
      "/oauth-token",
      describeRoute({
        summary: "Complete OAuth login with token",
        description: "Complete OAuth login by providing the session token",
        operationId: "vaultai.oauthToken",
        responses: {
          200: {
            description: "Login result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    success: z.boolean(),
                    user: VaultAIUserSchema.optional(),
                    error: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          instanceUrl: z.string().meta({ description: "VaultAI instance URL" }),
          token: z.string().meta({ description: "Session token from OAuth callback" }),
        }),
      ),
      async (c) => {
        const { instanceUrl, token } = c.req.valid("json")
        try {
          const client = createVaultAIClient(instanceUrl, token)
          const session = await client.getSession()

          if (!session.user) {
            return c.json({
              success: false,
              error: "Invalid or expired token",
            })
          }

          await Auth.VaultAIHelper.save(instanceUrl, token, {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name ?? undefined,
            organization_id: session.user.organizationId ?? undefined,
          })

          // Try to refresh VaultAI provider - may fail if no instance context
          try {
            await Provider.refreshVaultAI()
          } catch {
            // No instance context - models will load when a project is opened
          }

          return c.json({
            success: true,
            user: session.user,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to verify token"
          return c.json({
            success: false,
            error: message,
          })
        }
      },
    )
    .get(
      "/instances",
      describeRoute({
        summary: "List VaultAI instances",
        description: "Get all connected VaultAI instances",
        operationId: "vaultai.instances",
        responses: {
          200: {
            description: "List of connected instances",
            content: {
              "application/json": {
                schema: resolver(z.array(VaultAIInstanceSchema)),
              },
            },
          },
        },
      }),
      async (c) => {
        const instances = await Auth.VaultAIHelper.getAllInstances()
        const results = await Promise.all(
          instances.map(async ({ key, auth }) => {
            const isValid = await Auth.VaultAIHelper.verifySession(auth)
            return {
              key,
              instanceUrl: auth.instanceUrl,
              user: auth.user,
              sessionValid: isValid,
            }
          }),
        )
        return c.json(results)
      },
    )
    .delete(
      "/instances/:key",
      describeRoute({
        summary: "Disconnect VaultAI instance",
        description: "Remove a connected VaultAI instance",
        operationId: "vaultai.disconnect",
        responses: {
          200: {
            description: "Disconnected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          key: z.string().meta({ description: "Instance key" }),
        }),
      ),
      async (c) => {
        const { key } = c.req.valid("param")
        await Auth.remove(key)
        try {
          await Provider.refreshVaultAI()
        } catch {
          // No instance context
        }
        return c.json(true)
      },
    ),
)
