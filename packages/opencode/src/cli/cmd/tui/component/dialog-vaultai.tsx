import { createSignal, Show, onMount, createMemo, For } from "solid-js"
import { z } from "zod"
import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "@tui/context/theme"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useToast } from "@tui/ui/toast"
import { Auth } from "@/auth"
import { validateVaultAIInstance, createVaultAIClient } from "@/vaultai"
import type { VaultAIInstanceInfo, VaultAIContext } from "@/vaultai"
import { Provider } from "@/provider/provider"
import { TextAttributes } from "@opentui/core"
import open from "open"

/**
 * VaultAI Dialog - Main entry point
 */
export function DialogVaultAI() {
  const dialog = useDialog()
  const toast = useToast()

  const [instances, setInstances] = createSignal<Awaited<ReturnType<typeof Auth.VaultAIHelper.getAllInstances>>>([])

  onMount(async () => {
    const allInstances = await Auth.VaultAIHelper.getAllInstances()
    setInstances(allInstances)
  })

  const currentInstance = createMemo(() => {
    const all = instances()
    return all.length > 0 ? all[0].auth : null
  })

  const menuOptions = createMemo((): DialogSelectOption<string>[] => {
    const current = currentInstance()
    const opts: DialogSelectOption<string>[] = []

    if (current) {
      opts.push({
        value: "context",
        title: "My projects & chats",
        description: "View your VaultAI context",
        onSelect() {
          dialog.replace(() => <DialogVaultAIContext instance={current} />)
        },
      })
      opts.push({
        value: "status",
        title: "View status",
        description: `Connected as ${current.user.email}`,
        onSelect() {
          dialog.replace(() => <DialogVaultAIStatus instance={current} />)
        },
      })
      opts.push({
        value: "logout",
        title: "Logout",
        description: `Disconnect from ${new URL(current.instanceUrl).host}`,
        async onSelect() {
          await Auth.VaultAIHelper.removeInstance(current.instanceUrl)
          toast.show({
            variant: "success",
            message: `Logged out from ${new URL(current.instanceUrl).host}`,
          })
          dialog.clear()
        },
      })
    }

    opts.push({
      value: "login",
      title: current ? "Connect another instance" : "Connect to VaultAI",
      description: "Login to your VaultAI instance",
      onSelect() {
        dialog.replace(() => <DialogVaultAIInstanceUrl />)
      },
    })

    return opts
  })

  return <DialogSelect title="VaultAI" options={menuOptions()} />
}

/**
 * Step 1: Enter instance URL
 */
function DialogVaultAIInstanceUrl() {
  const dialog = useDialog()
  const toast = useToast()

  const handleSubmit = async (url: string) => {
    if (!url || url.length === 0) {
      toast.show({ variant: "error", message: "URL is required" })
      return
    }

    toast.show({ variant: "info", message: "Connecting..." })

    const validation = await validateVaultAIInstance(url)

    if (!validation.valid) {
      toast.show({ variant: "error", message: validation.error || "Invalid VaultAI instance" })
      return
    }

    dialog.replace(() => <DialogVaultAILogin instanceInfo={validation.info!} />)
  }

  return <DialogPrompt title="VaultAI Instance URL" placeholder="https://app.vaultai.eu" onConfirm={handleSubmit} />
}

/**
 * Step 2: Choose login method
 */
function DialogVaultAILogin(props: { instanceInfo: VaultAIInstanceInfo }) {
  const dialog = useDialog()
  const toast = useToast()

  const options = createMemo((): DialogSelectOption<string>[] => {
    const info = props.instanceInfo
    const opts: DialogSelectOption<string>[] = []

    // Email/password auth
    if (info.auth.credentials || info.auth.email) {
      opts.push({
        value: "credentials",
        title: "Email & Password",
        description: "Login with your VaultAI account",
        onSelect() {
          dialog.replace(() => <DialogVaultAIEmail instanceInfo={info} />)
        },
      })
    }

    // Google OAuth
    if (info.auth.google) {
      opts.push({
        value: "google",
        title: "Continue with Google",
        async onSelect() {
          await handleOAuth("google")
        },
      })
    }

    // Microsoft OAuth
    if (info.auth.microsoft) {
      opts.push({
        value: "microsoft",
        title: "Continue with Microsoft",
        async onSelect() {
          await handleOAuth("microsoft")
        },
      })
    }

    return opts
  })

  const handleOAuth = async (provider: "google" | "microsoft") => {
    const client = createVaultAIClient(props.instanceInfo.url)
    const loginUrl = client.getOAuthLoginURL(provider)

    toast.show({
      variant: "info",
      message: "Opening browser for login...",
    })

    try {
      await open(loginUrl)
    } catch {
      toast.show({
        variant: "warning",
        message: `Open this URL: ${loginUrl}`,
        duration: 10000,
      })
    }

    dialog.replace(() => <DialogVaultAIToken instanceInfo={props.instanceInfo} />)
  }

  return <DialogSelect title={`Login to ${props.instanceInfo.name}`} options={options()} />
}

/**
 * Step 3a: Enter email
 */
function DialogVaultAIEmail(props: { instanceInfo: VaultAIInstanceInfo }) {
  const dialog = useDialog()
  const toast = useToast()

  const handleSubmit = (email: string) => {
    if (!email || email.length === 0) {
      toast.show({ variant: "error", message: "Email is required" })
      return
    }
    dialog.replace(() => <DialogVaultAIPassword instanceInfo={props.instanceInfo} email={email} />)
  }

  return <DialogPrompt title="Email" placeholder="your@email.com" onConfirm={handleSubmit} />
}

/**
 * Step 3b: Enter password
 */
function DialogVaultAIPassword(props: { instanceInfo: VaultAIInstanceInfo; email: string }) {
  const dialog = useDialog()
  const toast = useToast()

  const handleSubmit = async (password: string) => {
    if (!password) {
      toast.show({ variant: "error", message: "Password is required" })
      return
    }

    toast.show({ variant: "info", message: "Logging in..." })

    try {
      const client = createVaultAIClient(props.instanceInfo.url)
      const result = await client.loginWithCredentials(props.email, password)

      // Check if 2FA is required
      if (result.twoFactorRequired) {
        toast.show({ variant: "info", message: "Two-factor authentication required" })
        dialog.replace(() => (
          <DialogVaultAITotp instanceInfo={props.instanceInfo} email={props.email} client={client} />
        ))
        return
      }

      if (!result.token || !result.user) {
        toast.show({ variant: "error", message: result.error || "Login failed" })
        return
      }

      await Auth.VaultAIHelper.save(props.instanceInfo.url, result.token, {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name ?? undefined,
        organization_id: result.user.organizationId ?? undefined,
      })

      // Try to refresh VaultAI provider (may fail if instance context not ready)
      let refreshed = false
      try {
        await Provider.refreshVaultAI()
        refreshed = true
      } catch {
        // Context not ready, models will load on next restart
      }

      // Fetch and show available models
      const clientWithToken = createVaultAIClient(props.instanceInfo.url, result.token)
      const modelsResponse = await clientWithToken.getV1Models()
      const modelCount = modelsResponse?.data?.length ?? 0
      const defaultModel = modelsResponse?.data?.find((m) => m.vaultai?.isDefault)

      const restartHint = refreshed ? "" : " Use /models after selecting a project."
      toast.show({
        variant: "success",
        message: `Connected as ${result.user.email}. ${modelCount} VaultAI models available!${defaultModel ? ` (default: ${defaultModel.vaultai?.name || defaultModel.id})` : ""}${restartHint}`,
        duration: 5000,
      })

      dialog.clear()
    } catch {
      toast.show({ variant: "error", message: "Login failed" })
    }
  }

  return (
    <DialogPrompt title={`Password for ${props.email}`} placeholder="Enter your password" onConfirm={handleSubmit} />
  )
}

/**
 * Step 3b-2: Enter TOTP code for 2FA (with option to use backup code)
 */
function DialogVaultAITotp(props: {
  instanceInfo: VaultAIInstanceInfo
  email: string
  client: ReturnType<typeof createVaultAIClient>
}) {
  const dialog = useDialog()
  const toast = useToast()

  const options = createMemo((): DialogSelectOption<string>[] => [
    {
      value: "totp",
      title: "Authenticator App Code",
      description: "Enter the 6-digit code from your authenticator app",
      onSelect() {
        dialog.replace(() => (
          <DialogVaultAITotpInput instanceInfo={props.instanceInfo} email={props.email} client={props.client} />
        ))
      },
    },
    {
      value: "backup",
      title: "Use Backup Code",
      description: "Use one of your saved backup codes",
      onSelect() {
        dialog.replace(() => (
          <DialogVaultAIBackupCode instanceInfo={props.instanceInfo} email={props.email} client={props.client} />
        ))
      },
    },
  ])

  return <DialogSelect title={`2FA for ${props.email}`} options={options()} />
}

/**
 * Step 3b-2a: Enter TOTP code
 */
function DialogVaultAITotpInput(props: {
  instanceInfo: VaultAIInstanceInfo
  email: string
  client: ReturnType<typeof createVaultAIClient>
}) {
  const dialog = useDialog()
  const toast = useToast()

  const handleSubmit = async (code: string) => {
    if (!code || code.length !== 6) {
      toast.show({ variant: "error", message: "Please enter a 6-digit code" })
      return
    }

    toast.show({ variant: "info", message: "Verifying code..." })

    try {
      const result = await props.client.verifyTotp(code)

      if (!result.token || !result.user) {
        toast.show({ variant: "error", message: result.error || "Invalid code" })
        return
      }

      await Auth.VaultAIHelper.save(props.instanceInfo.url, result.token, {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name ?? undefined,
        organization_id: result.user.organizationId ?? undefined,
      })

      // Try to refresh VaultAI provider
      let refreshed = false
      try {
        await Provider.refreshVaultAI()
        refreshed = true
      } catch {
        // Context not ready
      }

      // Fetch and show available models
      const clientWithToken = createVaultAIClient(props.instanceInfo.url, result.token)
      const modelsResponse = await clientWithToken.getV1Models()
      const modelCount = modelsResponse?.data?.length ?? 0
      const defaultModel = modelsResponse?.data?.find((m) => m.vaultai?.isDefault)

      const restartHint = refreshed ? "" : " Use /models after selecting a project."
      toast.show({
        variant: "success",
        message: `Connected as ${result.user.email}. ${modelCount} VaultAI models available!${defaultModel ? ` (default: ${defaultModel.vaultai?.name || defaultModel.id})` : ""}${restartHint}`,
        duration: 5000,
      })

      dialog.clear()
    } catch {
      toast.show({ variant: "error", message: "2FA verification failed" })
    }
  }

  return (
    <DialogPrompt
      title={`2FA Code for ${props.email}`}
      placeholder="Enter 6-digit code from your authenticator app"
      onConfirm={handleSubmit}
    />
  )
}

/**
 * Step 3b-2b: Enter backup code
 */
function DialogVaultAIBackupCode(props: {
  instanceInfo: VaultAIInstanceInfo
  email: string
  client: ReturnType<typeof createVaultAIClient>
}) {
  const dialog = useDialog()
  const toast = useToast()

  const handleSubmit = async (code: string) => {
    if (!code) {
      toast.show({ variant: "error", message: "Please enter a backup code" })
      return
    }

    toast.show({ variant: "info", message: "Verifying backup code..." })

    try {
      const result = await props.client.verifyBackupCode(code.toUpperCase())

      if (!result.token || !result.user) {
        toast.show({ variant: "error", message: result.error || "Invalid backup code" })
        return
      }

      await Auth.VaultAIHelper.save(props.instanceInfo.url, result.token, {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name ?? undefined,
        organization_id: result.user.organizationId ?? undefined,
      })

      // Try to refresh VaultAI provider
      let refreshed = false
      try {
        await Provider.refreshVaultAI()
        refreshed = true
      } catch {
        // Context not ready
      }

      // Fetch and show available models
      const clientWithToken = createVaultAIClient(props.instanceInfo.url, result.token)
      const modelsResponse = await clientWithToken.getV1Models()
      const modelCount = modelsResponse?.data?.length ?? 0
      const defaultModel = modelsResponse?.data?.find((m) => m.vaultai?.isDefault)

      const restartHint = refreshed ? "" : " Use /models after selecting a project."
      toast.show({
        variant: "success",
        message: `Connected as ${result.user.email}. ${modelCount} VaultAI models available!${defaultModel ? ` (default: ${defaultModel.vaultai?.name || defaultModel.id})` : ""}${restartHint}`,
        duration: 5000,
      })

      dialog.clear()
    } catch {
      toast.show({ variant: "error", message: "Backup code verification failed" })
    }
  }

  return (
    <DialogPrompt
      title={`Backup Code for ${props.email}`}
      placeholder="Enter one of your backup codes"
      onConfirm={handleSubmit}
    />
  )
}

/**
 * Step 3c: Paste OAuth token
 */
function DialogVaultAIToken(props: { instanceInfo: VaultAIInstanceInfo }) {
  const dialog = useDialog()
  const toast = useToast()

  const handleSubmit = async (token: string) => {
    if (!token) {
      toast.show({ variant: "error", message: "Token is required" })
      return
    }

    toast.show({ variant: "info", message: "Verifying token..." })

    const client = createVaultAIClient(props.instanceInfo.url, token)
    const session = await client.getSession()

    if (!session.user) {
      toast.show({ variant: "error", message: "Invalid or expired token" })
      return
    }

    await Auth.VaultAIHelper.save(props.instanceInfo.url, token, {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? undefined,
      organization_id: session.user.organizationId ?? undefined,
    })

    // Try to refresh VaultAI provider (may fail if instance context not ready)
    let refreshed = false
    try {
      await Provider.refreshVaultAI()
      refreshed = true
    } catch {
      // Context not ready, models will load on next restart
    }

    // Fetch and show available models
    const modelsResponse = await client.getV1Models()
    const modelCount = modelsResponse?.data?.length ?? 0
    const defaultModel = modelsResponse?.data?.find((m) => m.vaultai?.isDefault)

    const restartHint = refreshed ? "" : " Use /models after selecting a project."
    toast.show({
      variant: "success",
      message: `Connected as ${session.user.email}. ${modelCount} VaultAI models available!${defaultModel ? ` (default: ${defaultModel.vaultai?.name || defaultModel.id})` : ""}${restartHint}`,
      duration: 5000,
    })

    dialog.clear()
  }

  return (
    <DialogPrompt
      title="Paste your session token"
      placeholder="Token from the browser page..."
      onConfirm={handleSubmit}
    />
  )
}

/**
 * Status view with usage statistics
 */
function DialogVaultAIStatus(props: { instance: z.infer<typeof Auth.VaultAI> }) {
  const { theme } = useTheme()
  const [usage, setUsage] = createSignal<{
    total_tokens: number
    prompt_tokens: number
    completion_tokens: number
    message_count: number
  } | null>(null)
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    try {
      const client = createVaultAIClient(props.instance.instanceUrl, props.instance.sessionToken)
      const usageData = await client.getV1Usage()
      if (usageData) {
        setUsage({
          total_tokens: usageData.total_tokens,
          prompt_tokens: usageData.prompt_tokens,
          completion_tokens: usageData.completion_tokens,
          message_count: usageData.message_count,
        })
      }
    } catch {
      // Ignore errors - usage is optional
    } finally {
      setLoading(false)
    }
  })

  const formatNumber = (n: number) => n.toLocaleString()

  return (
    <box flexDirection="column" padding={2} gap={1}>
      <text fg={theme.text} attributes={TextAttributes.BOLD}>
        VaultAI Status
      </text>
      <text fg={theme.textMuted}>Instance: {new URL(props.instance.instanceUrl).host}</text>
      <text fg={theme.textMuted}>User: {props.instance.user.email}</text>
      <text fg={theme.textMuted}>Name: {props.instance.user.name || "N/A"}</text>

      <box marginTop={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Usage Statistics
        </text>
      </box>
      <Show when={loading()}>
        <text fg={theme.textMuted}>Loading usage data...</text>
      </Show>
      <Show when={!loading() && usage()}>
        {(u) => (
          <>
            <text fg={theme.textMuted}>Total Tokens: {formatNumber(u().total_tokens)}</text>
            <text fg={theme.textMuted}> Input: {formatNumber(u().prompt_tokens)}</text>
            <text fg={theme.textMuted}> Output: {formatNumber(u().completion_tokens)}</text>
            <text fg={theme.textMuted}>Messages: {formatNumber(u().message_count)}</text>
          </>
        )}
      </Show>
      <Show when={!loading() && !usage()}>
        <text fg={theme.textMuted}>No usage data available</text>
      </Show>

      <box marginTop={1}>
        <text fg={theme.textMuted}>Press Escape to close</text>
      </box>
    </box>
  )
}

/**
 * Context view - Shows projects & recent chats
 */
function DialogVaultAIContext(props: { instance: z.infer<typeof Auth.VaultAI> }) {
  const { theme } = useTheme()
  const toast = useToast()
  const [context, setContext] = createSignal<VaultAIContext | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  onMount(async () => {
    try {
      const client = createVaultAIClient(props.instance.instanceUrl, props.instance.sessionToken)
      const ctx = await client.getContext()
      if (ctx) {
        setContext(ctx)
      } else {
        setError("Failed to load context")
      }
    } catch (err) {
      setError("Connection error")
    } finally {
      setLoading(false)
    }
  })

  return (
    <box flexDirection="column" padding={2} gap={1}>
      <text fg={theme.text} attributes={TextAttributes.BOLD}>
        VaultAI Context
      </text>

      <Show when={loading()}>
        <text fg={theme.textMuted}>Loading...</text>
      </Show>

      <Show when={error()}>
        <text fg={theme.error}>{error()}</text>
      </Show>

      <Show when={context()}>
        {(ctx) => (
          <>
            {/* User info */}
            <box marginTop={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                User
              </text>
            </box>
            <text fg={theme.textMuted}>
              {ctx().user.email} ({ctx().user.role || "member"})
            </text>

            {/* Projects */}
            <box marginTop={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                Projects ({ctx().projects.length})
              </text>
            </box>
            <Show when={ctx().projects.length === 0}>
              <text fg={theme.textMuted}>No projects yet</text>
            </Show>
            <For each={ctx().projects.slice(0, 5)}>
              {(project) => <text fg={theme.textMuted}>• {project.name}</text>}
            </For>

            {/* Tasks */}
            <box marginTop={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                Tasks in Progress ({ctx().tasks?.length || 0})
              </text>
            </box>
            <Show when={!ctx().tasks || ctx().tasks!.length === 0}>
              <text fg={theme.textMuted}>No tasks in progress</text>
            </Show>
            <For each={(ctx().tasks || []).slice(0, 5)}>
              {(task) => <text fg={theme.textMuted}>• {task.title}</text>}
            </For>

            {/* Recent chats */}
            <box marginTop={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                Recent Chats ({ctx().recentChats.length})
              </text>
            </box>
            <Show when={ctx().recentChats.length === 0}>
              <text fg={theme.textMuted}>No chats yet</text>
            </Show>
            <For each={ctx().recentChats.slice(0, 5)}>
              {(chat) => (
                <text fg={theme.textMuted}>
                  • {chat.title}
                  {chat.isFavorite ? " ★" : ""}
                </text>
              )}
            </For>

            {/* Quotas */}
            <box marginTop={1}>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                Usage
              </text>
            </box>
            <text fg={theme.textMuted}>
              Messages: {ctx().quotas.messagesUsed}
              {ctx().quotas.messagesLimit ? ` / ${ctx().quotas.messagesLimit}` : " (unlimited)"}
            </text>
          </>
        )}
      </Show>

      <box marginTop={1}>
        <text fg={theme.textMuted}>Press Escape to close</text>
      </box>
    </box>
  )
}
