import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useTheme } from "@tui/context/theme"

export function DialogGuide() {
  const dialog = useDialog()
  const { theme } = useTheme()

  const options = [
    {
      value: "setup-models",
      title: "🤖 Set up AI Models",
      description: "Configure Claude, GPT, Gemini, etc.",
      onSelect: () => dialog.replace(() => <DialogGuideModels />),
    },
    {
      value: "connect-vaultai",
      title: "🔗 Connect to VaultAI",
      description: "Access your tasks, projects, and files",
      onSelect: () => dialog.replace(() => <DialogGuideVaultAI />),
    },
    {
      value: "basic-usage",
      title: "💡 Basic Usage",
      description: "How to use VaultAI Code effectively",
      onSelect: () => dialog.replace(() => <DialogGuideUsage />),
    },
    {
      value: "keyboard",
      title: "⌨️ Keyboard Shortcuts",
      description: "Essential shortcuts to know",
      onSelect: () => dialog.replace(() => <DialogGuideKeyboard />),
    },
  ]

  return <DialogSelect title="VaultAI Code - Getting Started" options={options} />
}

function DialogGuideModels() {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text fg={theme.primary}>🤖 Setting up AI Models</text>
      <text />
      <text fg={theme.text}>VaultAI Code supports 75+ AI providers. Here's how to get started:</text>
      <text />
      <text fg={theme.warning}>Step 1: Run /connect</text>
      <text fg={theme.textMuted}>  This opens the provider configuration dialog.</text>
      <text />
      <text fg={theme.warning}>Step 2: Choose a provider</text>
      <text fg={theme.textMuted}>  Popular options:</text>
      <text fg={theme.text}>  • Anthropic (Claude) - Best for coding</text>
      <text fg={theme.text}>  • OpenAI (GPT-4) - Great all-rounder</text>
      <text fg={theme.text}>  • Google (Gemini) - Fast and capable</text>
      <text fg={theme.text}>  • OpenCode Zen - Curated, tested models</text>
      <text />
      <text fg={theme.warning}>Step 3: Enter your API key</text>
      <text fg={theme.textMuted}>  Get keys from each provider's website.</text>
      <text />
      <text fg={theme.warning}>Step 4: Select your model</text>
      <text fg={theme.textMuted}>  Use /models or Ctrl+X M to switch models.</text>
      <text />
      <text fg={theme.textMuted}>Press Escape to go back</text>
    </box>
  )
}

function DialogGuideVaultAI() {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text fg={theme.primary}>🔗 Connecting to VaultAI</text>
      <text />
      <text fg={theme.text}>Connect to your VaultAI instance to access your data:</text>
      <text />
      <text fg={theme.warning}>Step 1: Run /vaultai</text>
      <text fg={theme.textMuted}>  Opens the VaultAI connection dialog.</text>
      <text />
      <text fg={theme.warning}>Step 2: Enter your VaultAI URL</text>
      <text fg={theme.textMuted}>  Example: https://app.vaultai.eu</text>
      <text />
      <text fg={theme.warning}>Step 3: Sign in</text>
      <text fg={theme.textMuted}>  Choose Google, Microsoft, or Email/Password.</text>
      <text />
      <text fg={theme.success}>Once connected, you can:</text>
      <text fg={theme.text}>  • Ask "What are my tasks?" or "Quelles sont mes tâches ?"</text>
      <text fg={theme.text}>  • Query projects: "Show my projects"</text>
      <text fg={theme.text}>  • Search meetings: "Find meetings about X"</text>
      <text fg={theme.text}>  • Browse files: "List my files"</text>
      <text />
      <text fg={theme.textMuted}>Press Escape to go back</text>
    </box>
  )
}

function DialogGuideUsage() {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text fg={theme.primary}>💡 Basic Usage</text>
      <text />
      <text fg={theme.warning}>Ask anything</text>
      <text fg={theme.textMuted}>  Just type your question and press Enter.</text>
      <text fg={theme.text}>  Example: "Fix the bug in auth.ts"</text>
      <text />
      <text fg={theme.warning}>Attach files with @</text>
      <text fg={theme.textMuted}>  Type @ followed by a filename to attach it.</text>
      <text fg={theme.text}>  Example: @src/auth.ts "Review this file"</text>
      <text />
      <text fg={theme.warning}>Run shell commands with !</text>
      <text fg={theme.textMuted}>  Start with ! to run commands directly.</text>
      <text fg={theme.text}>  Example: !git status</text>
      <text />
      <text fg={theme.warning}>Switch agents with Tab</text>
      <text fg={theme.textMuted}>  Build agent makes changes, Plan agent suggests.</text>
      <text />
      <text fg={theme.warning}>Use VaultAI data</text>
      <text fg={theme.textMuted}>  Once connected, ask about your tasks, projects, etc.</text>
      <text fg={theme.text}>  Example: "What tasks are due today?"</text>
      <text />
      <text fg={theme.textMuted}>Press Escape to go back</text>
    </box>
  )
}

function DialogGuideKeyboard() {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text fg={theme.primary}>⌨️ Essential Keyboard Shortcuts</text>
      <text />
      <text fg={theme.warning}>Navigation</text>
      <text fg={theme.text}>  Ctrl+P        Command palette</text>
      <text fg={theme.text}>  Tab           Switch agents (Build/Plan)</text>
      <text fg={theme.text}>  Escape        Stop AI / Close dialog</text>
      <text />
      <text fg={theme.warning}>Sessions</text>
      <text fg={theme.text}>  Ctrl+X N      New session</text>
      <text fg={theme.text}>  Ctrl+X L      List sessions</text>
      <text />
      <text fg={theme.warning}>Models</text>
      <text fg={theme.text}>  Ctrl+X M      Switch model</text>
      <text fg={theme.text}>  F2            Quick model switch</text>
      <text />
      <text fg={theme.warning}>Editing</text>
      <text fg={theme.text}>  Shift+Enter   New line in prompt</text>
      <text fg={theme.text}>  Ctrl+X E      External editor</text>
      <text fg={theme.text}>  Ctrl+C        Clear input</text>
      <text />
      <text fg={theme.warning}>History</text>
      <text fg={theme.text}>  /undo         Revert last change</text>
      <text fg={theme.text}>  /redo         Restore undone change</text>
      <text />
      <text fg={theme.textMuted}>Press Escape to go back</text>
    </box>
  )
}
