import { Installation } from "@/installation"
import { TextAttributes } from "@opentui/core"
import { Prompt } from "@tui/component/prompt"
import { For } from "solid-js"
import { Theme } from "@tui/context/theme"

export function Home() {
  return (
    <box flexGrow={1} justifyContent="center" alignItems="center" paddingLeft={2} paddingRight={2}>
      <box>
        <Logo />
        <box paddingTop={2}>
          <HelpRow slash="new">new session</HelpRow>
          <HelpRow slash="help">show help</HelpRow>
          <HelpRow slash="share">share session</HelpRow>
          <HelpRow slash="models">list models</HelpRow>
          <HelpRow slash="agents">list agents</HelpRow>
        </box>
      </box>
      <box paddingTop={3} width="100%" maxWidth={75}>
        <Prompt />
      </box>
    </box>
  )
}

function HelpRow(props: { children: string; slash: string }) {
  return (
    <text>
      <span style={{ bold: true, fg: Theme.primary }}>/{props.slash.padEnd(10, " ")}</span>
      <span>{props.children.padEnd(19, " ")} </span>
      <span style={{ fg: Theme.textMuted }}>ctrl+x n</span>
    </text>
  )
}

const LOGO_LEFT = [`                   `, `█▀▀█ █▀▀█ █▀▀█ █▀▀▄`, `█░░█ █░░█ █▀▀▀ █░░█`, `▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀  ▀`]

const LOGO_RIGHT = [`             ▄     `, `█▀▀▀ █▀▀█ █▀▀█ █▀▀█`, `█░░░ █░░█ █░░█ █▀▀▀`, `▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀`]

function Logo() {
  return (
    <box>
      <For each={LOGO_LEFT}>
        {(line, index) => (
          <box flexDirection="row" gap={1}>
            <text fg={Theme.textMuted}>{line}</text>
            <text fg={Theme.text} attributes={TextAttributes.BOLD}>
              {LOGO_RIGHT[index()]}
            </text>
          </box>
        )}
      </For>
      <box flexDirection="row" justifyContent="flex-end">
        <text fg={Theme.textMuted}>{Installation.VERSION}</text>
      </box>
    </box>
  )
}
