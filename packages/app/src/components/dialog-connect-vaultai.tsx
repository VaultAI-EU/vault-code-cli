import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, Match, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { DialogSelectProvider } from "./dialog-select-provider"

type Step = "url" | "method" | "credentials" | "2fa" | "oauth-token" | "success"
type TwoFAMethod = "totp" | "backup"

const DEFAULT_URL = "https://app.vaultai.eu"

export function DialogConnectVaultAI() {
  const dialog = useDialog()
  const globalSDK = useGlobalSDK()
  const platform = usePlatform()

  const [store, setStore] = createStore({
    step: "url" as Step,
    // URL step
    instanceUrl: DEFAULT_URL,
    instanceName: "",
    instanceLogo: null as string | null,
    availableAuth: { google: false, microsoft: false, email: false, credentials: false },
    // Credentials step
    email: "",
    password: "",
    // 2FA step
    twoFAMethod: "totp" as TwoFAMethod,
    twoFACode: "",
    // OAuth step
    oauthProvider: "google" as "google" | "microsoft",
    oauthToken: "",
    // Success
    userName: "",
    userEmail: "",
    // State
    loading: false,
    error: undefined as string | undefined,
  })

  const goBack = () => {
    if (store.step === "url") {
      dialog.show(() => <DialogSelectProvider />)
      return
    }
    if (store.step === "method") {
      setStore("step", "url")
      return
    }
    if (store.step === "credentials") {
      setStore("step", "method")
      setStore("error", undefined)
      return
    }
    if (store.step === "2fa") {
      setStore("step", "credentials")
      setStore("error", undefined)
      setStore("twoFACode", "")
      return
    }
    if (store.step === "oauth-token") {
      setStore("step", "method")
      setStore("error", undefined)
      setStore("oauthToken", "")
      return
    }
    setStore("step", "url")
  }

  const validateUrl = async () => {
    if (!store.instanceUrl.trim()) {
      setStore("error", "Please enter an instance URL")
      return
    }

    setStore("loading", true)
    setStore("error", undefined)

    const result = await globalSDK.client.vaultai.validate({ url: store.instanceUrl })

    setStore("loading", false)

    if (!result.data?.valid) {
      setStore("error", result.data?.error ?? "Invalid VaultAI instance")
      return
    }

    const info = result.data.info!
    setStore("instanceUrl", info.url)
    setStore("instanceName", info.name)
    setStore("instanceLogo", info.logo)
    setStore("availableAuth", info.auth)
    setStore("step", "method")
  }

  const selectMethod = (method: "email" | "google" | "microsoft") => {
    if (method === "email") {
      setStore("step", "credentials")
    } else {
      setStore("oauthProvider", method)
      openOAuth(method)
    }
  }

  const openOAuth = async (provider: "google" | "microsoft") => {
    const result = await globalSDK.client.vaultai.oauthUrl({
      instanceUrl: store.instanceUrl,
      provider,
    })

    if (result.data?.url) {
      platform.openLink(result.data.url)
      setStore("step", "oauth-token")
    }
  }

  const submitCredentials = async (e: SubmitEvent) => {
    e.preventDefault()

    if (!store.email.trim() || !store.password.trim()) {
      setStore("error", "Please fill in all fields")
      return
    }

    setStore("loading", true)
    setStore("error", undefined)

    const result = await globalSDK.client.vaultai.login({
      instanceUrl: store.instanceUrl,
      email: store.email,
      password: store.password,
    })

    setStore("loading", false)

    if (result.data?.twoFactorRequired) {
      setStore("step", "2fa")
      return
    }

    if (!result.data?.success) {
      setStore("error", result.data?.error ?? "Login failed")
      return
    }

    setStore("userName", result.data.user?.name ?? "")
    setStore("userEmail", result.data.user?.email ?? "")
    await complete()
  }

  const submitTwoFA = async (e: SubmitEvent) => {
    e.preventDefault()

    if (!store.twoFACode.trim()) {
      setStore("error", "Please enter the code")
      return
    }

    setStore("loading", true)
    setStore("error", undefined)

    const endpoint =
      store.twoFAMethod === "totp" ? globalSDK.client.vaultai.verifyTotp : globalSDK.client.vaultai.verifyBackup
    const result = await endpoint({
      instanceUrl: store.instanceUrl,
      email: store.email,
      password: store.password,
      code: store.twoFACode,
    })

    setStore("loading", false)

    if (!result.data?.success) {
      setStore("error", result.data?.error ?? "Invalid code")
      return
    }

    setStore("userName", result.data.user?.name ?? "")
    setStore("userEmail", result.data.user?.email ?? "")
    await complete()
  }

  const submitOAuthToken = async (e: SubmitEvent) => {
    e.preventDefault()

    if (!store.oauthToken.trim()) {
      setStore("error", "Please paste the token")
      return
    }

    setStore("loading", true)
    setStore("error", undefined)

    console.log("[VaultAI OAuth] Submitting token:", {
      instanceUrl: store.instanceUrl,
      tokenLength: store.oauthToken.length,
      tokenPreview: store.oauthToken.substring(0, 8) + "...",
    })

    try {
      console.log("[VaultAI OAuth] Calling API...")
      const result = await globalSDK.client.vaultai.oauthToken({
        instanceUrl: store.instanceUrl,
        token: store.oauthToken,
      })

      console.log("[VaultAI OAuth] API Response:", result)

      setStore("loading", false)

      if (!result.data?.success) {
        console.error("[VaultAI OAuth] Failed:", result.data?.error)
        setStore("error", result.data?.error ?? "Invalid token")
        return
      }

      console.log("[VaultAI OAuth] Success! User:", result.data.user)
      setStore("userName", result.data.user?.name ?? "")
      setStore("userEmail", result.data.user?.email ?? "")
      await complete()
      // Auto-close and show toast
      finish()
    } catch (err) {
      console.error("[VaultAI OAuth] Exception:", err)
      setStore("loading", false)
      const message = err instanceof Error ? err.message : "Failed to verify token"
      setStore("error", message)
    }
  }

  const complete = async () => {
    console.log("[VaultAI OAuth] Disposing instances to force reload...")
    await globalSDK.client.global.dispose()
    console.log("[VaultAI OAuth] Instances disposed, providers will reload on next request")
    setStore("step", "success")
  }

  const finish = () => {
    console.log("[VaultAI OAuth] Closing dialog and showing toast")
    dialog.close()
    showToast({
      variant: "success",
      icon: "circle-check",
      title: `Connected to ${store.instanceName}`,
      description: `Logged in as ${store.userEmail}`,
    })
  }

  const hasEmailAuth = createMemo(() => store.availableAuth.email || store.availableAuth.credentials)
  const hasGoogleAuth = createMemo(() => store.availableAuth.google)
  const hasMicrosoftAuth = createMemo(() => store.availableAuth.microsoft)

  return (
    <Dialog
      title={<IconButton tabIndex={-1} icon="arrow-left" variant="ghost" onClick={goBack} aria-label="Go back" />}
      transition
    >
      <div class="flex flex-col gap-6 px-2.5 pb-3">
        <div class="px-2.5 flex gap-4 items-center">
          <img src="https://www.vaultai.eu/favicon.ico" alt="VaultAI" class="size-5 shrink-0" />
          <div class="text-16-medium text-text-strong">Connect to VaultAI</div>
        </div>

        <div class="px-2.5 pb-6 flex flex-col gap-6">
          <Switch>
            {/* Step 1: Instance URL */}
            <Match when={store.step === "url"}>
              <div class="text-14-regular text-text-base">Enter your VaultAI instance URL</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  validateUrl()
                }}
                class="flex flex-col items-start gap-4"
              >
                <TextField
                  autofocus
                  type="url"
                  label="Instance URL"
                  placeholder="https://app.vaultai.eu"
                  value={store.instanceUrl}
                  onChange={setStore.bind(null, "instanceUrl")}
                  validationState={store.error ? "invalid" : undefined}
                  error={store.error}
                />
                <Button class="w-auto" type="submit" size="large" variant="primary" disabled={store.loading}>
                  {store.loading ? (
                    <>
                      <Spinner class="size-4" /> Validating...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>
            </Match>

            {/* Step 2: Login Method */}
            <Match when={store.step === "method"}>
              <div class="text-14-regular text-text-base">
                Select login method for <span class="font-medium">{store.instanceName}</span>
              </div>
              <div class="flex flex-col gap-3">
                {hasEmailAuth() && (
                  <Button size="large" variant="secondary" onClick={() => selectMethod("email")} class="justify-start">
                    <Icon name="edit" class="size-4 mr-2" />
                    Email & Password
                  </Button>
                )}
                {hasGoogleAuth() && (
                  <Button size="large" variant="secondary" onClick={() => selectMethod("google")} class="justify-start">
                    <Icon name="link" class="size-4 mr-2" />
                    Continue with Google
                  </Button>
                )}
                {hasMicrosoftAuth() && (
                  <Button
                    size="large"
                    variant="secondary"
                    onClick={() => selectMethod("microsoft")}
                    class="justify-start"
                  >
                    <Icon name="link" class="size-4 mr-2" />
                    Continue with Microsoft
                  </Button>
                )}
              </div>
            </Match>

            {/* Step 3: Credentials */}
            <Match when={store.step === "credentials"}>
              <div class="text-14-regular text-text-base">
                Sign in to <span class="font-medium">{store.instanceName}</span>
              </div>
              <form onSubmit={submitCredentials} class="flex flex-col items-start gap-4">
                <TextField
                  autofocus
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  value={store.email}
                  onChange={setStore.bind(null, "email")}
                />
                <TextField
                  type="password"
                  label="Password"
                  placeholder="Your password"
                  value={store.password}
                  onChange={setStore.bind(null, "password")}
                  validationState={store.error ? "invalid" : undefined}
                  error={store.error}
                />
                <Button class="w-auto" type="submit" size="large" variant="primary" disabled={store.loading}>
                  {store.loading ? (
                    <>
                      <Spinner class="size-4" /> Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </Match>

            {/* Step 4: 2FA */}
            <Match when={store.step === "2fa"}>
              <div class="text-14-regular text-text-base">Two-factor authentication required</div>
              <div class="flex gap-2 mb-2">
                <Button
                  size="small"
                  variant={store.twoFAMethod === "totp" ? "primary" : "ghost"}
                  onClick={() => {
                    setStore("twoFAMethod", "totp")
                    setStore("error", undefined)
                  }}
                >
                  Authenticator
                </Button>
                <Button
                  size="small"
                  variant={store.twoFAMethod === "backup" ? "primary" : "ghost"}
                  onClick={() => {
                    setStore("twoFAMethod", "backup")
                    setStore("error", undefined)
                  }}
                >
                  Backup Code
                </Button>
              </div>
              <form onSubmit={submitTwoFA} class="flex flex-col items-start gap-4">
                <TextField
                  autofocus
                  type="text"
                  label={store.twoFAMethod === "totp" ? "Authenticator Code" : "Backup Code"}
                  placeholder={store.twoFAMethod === "totp" ? "000000" : "XXXX-XXXX-XXXX"}
                  value={store.twoFACode}
                  onChange={setStore.bind(null, "twoFACode")}
                  validationState={store.error ? "invalid" : undefined}
                  error={store.error}
                />
                <Button class="w-auto" type="submit" size="large" variant="primary" disabled={store.loading}>
                  {store.loading ? (
                    <>
                      <Spinner class="size-4" /> Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
              </form>
            </Match>

            {/* Step: OAuth Token */}
            <Match when={store.step === "oauth-token"}>
              <div class="text-14-regular text-text-base">
                Complete the login in your browser, then paste the session token here.
              </div>
              <form onSubmit={submitOAuthToken} class="flex flex-col items-start gap-4">
                <TextField
                  autofocus
                  type="text"
                  label="Session Token"
                  placeholder="Paste the token from the success page"
                  value={store.oauthToken}
                  onChange={setStore.bind(null, "oauthToken")}
                  validationState={store.error ? "invalid" : undefined}
                  error={store.error}
                />
                <div class="flex gap-2">
                  <Button class="w-auto" type="submit" size="large" variant="primary" disabled={store.loading}>
                    {store.loading ? (
                      <>
                        <Spinner class="size-4" /> Verifying...
                      </>
                    ) : (
                      "Submit"
                    )}
                  </Button>
                  <Button
                    class="w-auto"
                    type="button"
                    size="large"
                    variant="ghost"
                    onClick={() => openOAuth(store.oauthProvider)}
                  >
                    Reopen Browser
                  </Button>
                </div>
              </form>
            </Match>

            {/* Step: Success */}
            <Match when={store.step === "success"}>
              <div class="flex flex-col gap-4">
                <div class="flex items-center gap-3">
                  <Icon name="circle-check" class="size-5 text-icon-success-base" />
                  <div class="text-14-medium text-text-strong">Connected to {store.instanceName}</div>
                </div>
                <div class="text-14-regular text-text-base">
                  Logged in as <span class="font-medium">{store.userEmail}</span>
                </div>
                <Button class="w-auto self-start" size="large" variant="primary" onClick={finish}>
                  Done
                </Button>
              </div>
            </Match>
          </Switch>
        </div>
      </div>
    </Dialog>
  )
}
