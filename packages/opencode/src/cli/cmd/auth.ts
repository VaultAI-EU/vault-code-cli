import { Auth } from "../../auth"
import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { ModelsDev } from "../../provider/models"
import { map, pipe, sortBy, values } from "remeda"
import path from "path"
import os from "os"
import { Config } from "../../config/config"
import { Global } from "../../global"
import { Plugin } from "../../plugin"
import { Instance } from "../../project/instance"
import type { Hooks } from "@opencode-ai/plugin"
import { validateVaultAIInstance, createVaultAIClient } from "../../vaultai"
import type { OAuthProvider } from "../../vaultai"

type PluginAuth = NonNullable<Hooks["auth"]>

/**
 * Handle plugin-based authentication flow.
 * Returns true if auth was handled, false if it should fall through to default handling.
 */
async function handlePluginAuth(plugin: { auth: PluginAuth }, provider: string): Promise<boolean> {
  let index = 0
  if (plugin.auth.methods.length > 1) {
    const method = await prompts.select({
      message: "Login method",
      options: [
        ...plugin.auth.methods.map((x, index) => ({
          label: x.label,
          value: index.toString(),
        })),
      ],
    })
    if (prompts.isCancel(method)) throw new UI.CancelledError()
    index = parseInt(method)
  }
  const method = plugin.auth.methods[index]

  // Handle prompts for all auth types
  await Bun.sleep(10)
  const inputs: Record<string, string> = {}
  if (method.prompts) {
    for (const prompt of method.prompts) {
      if (prompt.condition && !prompt.condition(inputs)) {
        continue
      }
      if (prompt.type === "select") {
        const value = await prompts.select({
          message: prompt.message,
          options: prompt.options,
        })
        if (prompts.isCancel(value)) throw new UI.CancelledError()
        inputs[prompt.key] = value
      } else {
        const value = await prompts.text({
          message: prompt.message,
          placeholder: prompt.placeholder,
          validate: prompt.validate ? (v) => prompt.validate!(v ?? "") : undefined,
        })
        if (prompts.isCancel(value)) throw new UI.CancelledError()
        inputs[prompt.key] = value
      }
    }
  }

  if (method.type === "oauth") {
    const authorize = await method.authorize(inputs)

    if (authorize.url) {
      prompts.log.info("Go to: " + authorize.url)
    }

    if (authorize.method === "auto") {
      if (authorize.instructions) {
        prompts.log.info(authorize.instructions)
      }
      const spinner = prompts.spinner()
      spinner.start("Waiting for authorization...")
      const result = await authorize.callback()
      if (result.type === "failed") {
        spinner.stop("Failed to authorize", 1)
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        if ("refresh" in result) {
          const { type: _, provider: __, refresh, access, expires, ...extraFields } = result
          await Auth.set(saveProvider, {
            type: "oauth",
            refresh,
            access,
            expires,
            ...extraFields,
          })
        }
        if ("key" in result) {
          await Auth.set(saveProvider, {
            type: "api",
            key: result.key,
          })
        }
        spinner.stop("Login successful")
      }
    }

    if (authorize.method === "code") {
      const code = await prompts.text({
        message: "Paste the authorization code here: ",
        validate: (x) => (x && x.length > 0 ? undefined : "Required"),
      })
      if (prompts.isCancel(code)) throw new UI.CancelledError()
      const result = await authorize.callback(code)
      if (result.type === "failed") {
        prompts.log.error("Failed to authorize")
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        if ("refresh" in result) {
          const { type: _, provider: __, refresh, access, expires, ...extraFields } = result
          await Auth.set(saveProvider, {
            type: "oauth",
            refresh,
            access,
            expires,
            ...extraFields,
          })
        }
        if ("key" in result) {
          await Auth.set(saveProvider, {
            type: "api",
            key: result.key,
          })
        }
        prompts.log.success("Login successful")
      }
    }

    prompts.outro("Done")
    return true
  }

  if (method.type === "api") {
    if (method.authorize) {
      const result = await method.authorize(inputs)
      if (result.type === "failed") {
        prompts.log.error("Failed to authorize")
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        await Auth.set(saveProvider, {
          type: "api",
          key: result.key,
        })
        prompts.log.success("Login successful")
      }
      prompts.outro("Done")
      return true
    }
  }

  return false
}

export const AuthCommand = cmd({
  command: "auth",
  describe: "manage credentials",
  builder: (yargs) =>
    yargs
      .command(AuthLoginCommand)
      .command(AuthLogoutCommand)
      .command(AuthListCommand)
      .command(AuthVaultAICommand)
      .demandCommand(),
  async handler() {},
})

// VaultAI-specific commands
export const AuthVaultAICommand = cmd({
  command: "vaultai <action>",
  describe: "manage VaultAI instance connections",
  builder: (yargs) =>
    yargs
      .positional("action", {
        describe: "action to perform",
        choices: ["login", "logout", "status", "list"] as const,
        type: "string",
      })
      .option("instance", {
        alias: "i",
        describe: "VaultAI instance URL (e.g., https://app.vaultai.eu)",
        type: "string",
      })
      .option("token", {
        alias: "t",
        describe: "Session token (skip browser login)",
        type: "string",
      })
      .option("provider", {
        alias: "p",
        describe: "OAuth provider",
        choices: ["google", "microsoft"] as const,
        default: "google" as const,
      }),
  async handler(args) {
    UI.empty()

    switch (args.action) {
      case "login":
        await handleVaultAILogin(args.instance, args.token, args.provider as OAuthProvider)
        break
      case "logout":
        await handleVaultAILogout(args.instance)
        break
      case "status":
        await handleVaultAIStatus()
        break
      case "list":
        await handleVaultAIList()
        break
    }
  },
})

async function handleVaultAILogin(
  instanceUrl?: string,
  token?: string,
  provider: OAuthProvider = "google"
) {
  prompts.intro("VaultAI Login")

  // Get instance URL if not provided
  if (!instanceUrl) {
    const url = await prompts.text({
      message: "Enter VaultAI instance URL",
      placeholder: "https://app.vaultai.eu",
      validate: (x) => (x && x.length > 0 ? undefined : "Required"),
    })
    if (prompts.isCancel(url)) throw new UI.CancelledError()
    instanceUrl = url
  }

  // Validate instance
  const spinner = prompts.spinner()
  spinner.start("Validating instance...")

  const validation = await validateVaultAIInstance(instanceUrl)

  if (!validation.valid) {
    spinner.stop(`Invalid instance: ${validation.error}`, 1)
    return
  }

  spinner.stop(`Connected to ${validation.info!.name}`)

  // If token provided, use it directly
  if (token) {
    const client = createVaultAIClient(validation.info!.url, token)
    const session = await client.getSession()

    if (!session.user) {
      prompts.log.error("Invalid token")
      return
    }

    await Auth.VaultAIHelper.save(
      validation.info!.url,
      token,
      {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? undefined,
        organization_id: session.user.organizationId ?? undefined,
      }
    )

    prompts.log.success(`Logged in as ${session.user.email}`)
    prompts.outro("Done")
    return
  }

  // OAuth login
  const availableProviders = Object.entries(validation.info!.auth)
    .filter(([_, available]) => available)
    .map(([name]) => name) as OAuthProvider[]

  if (availableProviders.length === 0) {
    prompts.log.error("No OAuth providers available on this instance")
    return
  }

  // Let user choose provider if multiple available
  let selectedProvider = provider
  if (!availableProviders.includes(provider)) {
    if (availableProviders.length === 1) {
      selectedProvider = availableProviders[0]
    } else {
      const choice = await prompts.select({
        message: "Select login method",
        options: availableProviders.map((p) => ({
          label: p === "google" ? "Google" : "Microsoft",
          value: p,
        })),
      })
      if (prompts.isCancel(choice)) throw new UI.CancelledError()
      selectedProvider = choice as OAuthProvider
    }
  }

  const client = createVaultAIClient(validation.info!.url)
  const loginUrl = client.getOAuthLoginURL(selectedProvider)

  prompts.log.info(`Opening browser for ${selectedProvider} login...`)
  prompts.log.info(`URL: ${loginUrl}`)

  // Try to open browser
  const opener = await import("open").catch(() => null)
  if (opener) {
    await opener.default(loginUrl)
  }

  prompts.log.info("")
  prompts.log.info("After logging in, copy the token from the success page and paste it here:")

  const pastedToken = await prompts.text({
    message: "Paste your session token",
    validate: (x) => (x && x.length > 10 ? undefined : "Invalid token"),
  })
  if (prompts.isCancel(pastedToken)) throw new UI.CancelledError()

  // Verify token
  const verifyClient = createVaultAIClient(validation.info!.url, pastedToken)
  const session = await verifyClient.getSession()

  if (!session.user) {
    prompts.log.error("Invalid or expired token")
    return
  }

  await Auth.VaultAIHelper.save(
    validation.info!.url,
    pastedToken,
    {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? undefined,
      organization_id: session.user.organizationId ?? undefined,
    }
  )

  prompts.log.success(`Logged in as ${session.user.email}`)
  prompts.outro("Done")
}

async function handleVaultAILogout(instanceUrl?: string) {
  prompts.intro("VaultAI Logout")

  const instances = await Auth.VaultAIHelper.getAllInstances()

  if (instances.length === 0) {
    prompts.log.warn("No VaultAI instances connected")
    prompts.outro("Done")
    return
  }

  let urlToLogout = instanceUrl

  if (!urlToLogout) {
    if (instances.length === 1) {
      urlToLogout = instances[0].auth.instanceUrl
    } else {
      const choice = await prompts.select({
        message: "Select instance to logout from",
        options: instances.map((i) => ({
          label: `${i.auth.user.email} (${new URL(i.auth.instanceUrl).host})`,
          value: i.auth.instanceUrl,
        })),
      })
      if (prompts.isCancel(choice)) throw new UI.CancelledError()
      urlToLogout = choice
    }
  }

  await Auth.VaultAIHelper.removeInstance(urlToLogout)
  prompts.log.success(`Logged out from ${new URL(urlToLogout).host}`)
  prompts.outro("Done")
}

async function handleVaultAIStatus() {
  prompts.intro("VaultAI Status")

  const current = await Auth.VaultAIHelper.getCurrent()

  if (!current) {
    prompts.log.warn("Not connected to any VaultAI instance")
    prompts.log.info("Run: vault-code auth vaultai login")
    prompts.outro("Done")
    return
  }

  const client = createVaultAIClient(current.instanceUrl, current.sessionToken)
  const spinner = prompts.spinner()
  spinner.start("Checking session...")

  const isValid = await Auth.VaultAIHelper.verifySession(current)

  if (isValid) {
    spinner.stop("Session valid")
    prompts.log.info(`Instance: ${new URL(current.instanceUrl).host}`)
    prompts.log.info(`User: ${current.user.email}`)
    if (current.user.name) {
      prompts.log.info(`Name: ${current.user.name}`)
    }

    // Get context for more info
    const context = await client.getContext()
    if (context) {
      prompts.log.info(`Projects: ${context.projects.length}`)
      prompts.log.info(`Recent chats: ${context.recentChats.length}`)
    }
  } else {
    spinner.stop("Session expired or invalid", 1)
    prompts.log.warn("Please login again: vault-code auth vaultai login")
  }

  prompts.outro("Done")
}

async function handleVaultAIList() {
  prompts.intro("VaultAI Instances")

  const instances = await Auth.VaultAIHelper.getAllInstances()

  if (instances.length === 0) {
    prompts.log.warn("No VaultAI instances connected")
    prompts.log.info("Run: vault-code auth vaultai login <url>")
    prompts.outro("Done")
    return
  }

  for (const instance of instances) {
    const host = new URL(instance.auth.instanceUrl).host
    const isValid = Auth.VaultAIHelper.isSessionValid(instance.auth)
    const status = isValid ? UI.Style.TEXT_SUCCESS + "●" : UI.Style.TEXT_DANGER + "○"
    prompts.log.info(`${status} ${UI.Style.TEXT_NORMAL}${instance.auth.user.email} ${UI.Style.TEXT_DIM}(${host})`)
  }

  prompts.outro(`${instances.length} instance(s)`)
}

export const AuthListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "list providers",
  async handler() {
    UI.empty()
    const authPath = path.join(Global.Path.data, "auth.json")
    const homedir = os.homedir()
    const displayPath = authPath.startsWith(homedir) ? authPath.replace(homedir, "~") : authPath
    prompts.intro(`Credentials ${UI.Style.TEXT_DIM}${displayPath}`)
    const results = Object.entries(await Auth.all())
    const database = await ModelsDev.get()

    for (const [providerID, result] of results) {
      const name = database[providerID]?.name || providerID
      prompts.log.info(`${name} ${UI.Style.TEXT_DIM}${result.type}`)
    }

    prompts.outro(`${results.length} credentials`)

    // Environment variables section
    const activeEnvVars: Array<{ provider: string; envVar: string }> = []

    for (const [providerID, provider] of Object.entries(database)) {
      for (const envVar of provider.env) {
        if (process.env[envVar]) {
          activeEnvVars.push({
            provider: provider.name || providerID,
            envVar,
          })
        }
      }
    }

    if (activeEnvVars.length > 0) {
      UI.empty()
      prompts.intro("Environment")

      for (const { provider, envVar } of activeEnvVars) {
        prompts.log.info(`${provider} ${UI.Style.TEXT_DIM}${envVar}`)
      }

      prompts.outro(`${activeEnvVars.length} environment variable` + (activeEnvVars.length === 1 ? "" : "s"))
    }
  },
})

export const AuthLoginCommand = cmd({
  command: "login [url]",
  describe: "log in to a provider",
  builder: (yargs) =>
    yargs.positional("url", {
      describe: "opencode auth provider",
      type: "string",
    }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("Add credential")
        if (args.url) {
          const wellknown = await fetch(`${args.url}/.well-known/opencode`).then((x) => x.json() as any)
          prompts.log.info(`Running \`${wellknown.auth.command.join(" ")}\``)
          const proc = Bun.spawn({
            cmd: wellknown.auth.command,
            stdout: "pipe",
          })
          const exit = await proc.exited
          if (exit !== 0) {
            prompts.log.error("Failed")
            prompts.outro("Done")
            return
          }
          const token = await new Response(proc.stdout).text()
          await Auth.set(args.url, {
            type: "wellknown",
            key: wellknown.auth.env,
            token: token.trim(),
          })
          prompts.log.success("Logged into " + args.url)
          prompts.outro("Done")
          return
        }
        await ModelsDev.refresh().catch(() => {})

        const config = await Config.get()

        const disabled = new Set(config.disabled_providers ?? [])
        const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined

        const providers = await ModelsDev.get().then((x) => {
          const filtered: Record<string, (typeof x)[string]> = {}
          for (const [key, value] of Object.entries(x)) {
            if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
              filtered[key] = value
            }
          }
          return filtered
        })

        const priority: Record<string, number> = {
          opencode: 0,
          anthropic: 1,
          "github-copilot": 2,
          openai: 3,
          google: 4,
          openrouter: 5,
          vercel: 6,
        }
        let provider = await prompts.autocomplete({
          message: "Select provider",
          maxItems: 8,
          options: [
            ...pipe(
              providers,
              values(),
              sortBy(
                (x) => priority[x.id] ?? 99,
                (x) => x.name ?? x.id,
              ),
              map((x) => ({
                label: x.name,
                value: x.id,
                hint: {
                  opencode: "recommended",
                  anthropic: "Claude Max or API key",
                  openai: "ChatGPT Plus/Pro or API key",
                }[x.id],
              })),
            ),
            {
              value: "other",
              label: "Other",
            },
          ],
        })

        if (prompts.isCancel(provider)) throw new UI.CancelledError()

        const plugin = await Plugin.list().then((x) => x.find((x) => x.auth?.provider === provider))
        if (plugin && plugin.auth) {
          const handled = await handlePluginAuth({ auth: plugin.auth }, provider)
          if (handled) return
        }

        if (provider === "other") {
          provider = await prompts.text({
            message: "Enter provider id",
            validate: (x) => (x && x.match(/^[0-9a-z-]+$/) ? undefined : "a-z, 0-9 and hyphens only"),
          })
          if (prompts.isCancel(provider)) throw new UI.CancelledError()
          provider = provider.replace(/^@ai-sdk\//, "")
          if (prompts.isCancel(provider)) throw new UI.CancelledError()

          // Check if a plugin provides auth for this custom provider
          const customPlugin = await Plugin.list().then((x) => x.find((x) => x.auth?.provider === provider))
          if (customPlugin && customPlugin.auth) {
            const handled = await handlePluginAuth({ auth: customPlugin.auth }, provider)
            if (handled) return
          }

          prompts.log.warn(
            `This only stores a credential for ${provider} - you will need configure it in opencode.json, check the docs for examples.`,
          )
        }

        if (provider === "amazon-bedrock") {
          prompts.log.info(
            "Amazon Bedrock authentication priority:\n" +
              "  1. Bearer token (AWS_BEARER_TOKEN_BEDROCK or /connect)\n" +
              "  2. AWS credential chain (profile, access keys, IAM roles, EKS IRSA)\n\n" +
              "Configure via opencode.json options (profile, region, endpoint) or\n" +
              "AWS environment variables (AWS_PROFILE, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_WEB_IDENTITY_TOKEN_FILE).",
          )
        }

        if (provider === "opencode") {
          prompts.log.info("Create an api key at https://opencode.ai/auth")
        }

        if (provider === "vercel") {
          prompts.log.info("You can create an api key at https://vercel.link/ai-gateway-token")
        }

        if (["cloudflare", "cloudflare-ai-gateway"].includes(provider)) {
          prompts.log.info(
            "Cloudflare AI Gateway can be configured with CLOUDFLARE_GATEWAY_ID, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN environment variables. Read more: https://opencode.ai/docs/providers/#cloudflare-ai-gateway",
          )
        }

        const key = await prompts.password({
          message: "Enter your API key",
          validate: (x) => (x && x.length > 0 ? undefined : "Required"),
        })
        if (prompts.isCancel(key)) throw new UI.CancelledError()
        await Auth.set(provider, {
          type: "api",
          key,
        })

        prompts.outro("Done")
      },
    })
  },
})

export const AuthLogoutCommand = cmd({
  command: "logout",
  describe: "log out from a configured provider",
  async handler() {
    UI.empty()
    const credentials = await Auth.all().then((x) => Object.entries(x))
    prompts.intro("Remove credential")
    if (credentials.length === 0) {
      prompts.log.error("No credentials found")
      return
    }
    const database = await ModelsDev.get()
    const providerID = await prompts.select({
      message: "Select provider",
      options: credentials.map(([key, value]) => ({
        label: (database[key]?.name || key) + UI.Style.TEXT_DIM + " (" + value.type + ")",
        value: key,
      })),
    })
    if (prompts.isCancel(providerID)) throw new UI.CancelledError()
    await Auth.remove(providerID)
    prompts.outro("Logout successful")
  },
})
