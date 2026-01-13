import { Tooltip } from "@kobalte/core/tooltip"
import { type ComponentProps, For, Match, Show, Switch, splitProps } from "solid-js"
import type { UserMessage } from "@opencode-ai/sdk/v2"

export function MessageNav(
  props: ComponentProps<"ul"> & {
    messages: UserMessage[]
    current?: UserMessage
    size: "normal" | "compact"
    onMessageSelect: (message: UserMessage) => void
  },
) {
  const [local, others] = splitProps(props, ["messages", "current", "size", "onMessageSelect"])

  const content = () => (
    <ul data-component="message-nav" data-size={local.size} {...others}>
      <For each={local.messages}>
        {(message) => {
          const handleClick = () => local.onMessageSelect(message)

          return (
            <li data-slot="message-nav-item">
              <Switch>
                <Match when={local.size === "compact"}>
                  <div data-slot="message-nav-tick-button" data-active={message.id === local.current?.id || undefined}>
                    <div data-slot="message-nav-tick-line" />
                  </div>
                </Match>
                <Match when={local.size === "normal"}>
                  <button data-slot="message-nav-message-button" onClick={handleClick} type="button">
                    <div
                      data-slot="message-nav-title-preview"
                      data-active={message.id === local.current?.id || undefined}
                    >
                      <Show when={message.summary?.title} fallback="New message">
                        {message.summary?.title}
                      </Show>
                    </div>
                    <Show when={(message.summary?.diffs.reduce((acc, diff) => acc + diff.additions, 0) ?? 0) > 0}>
                      <span data-slot="message-nav-diff-changes message-nav-diff-additions">
                        {message.summary?.diffs.reduce((acc, diff) => acc + diff.additions, 0)}
                      </span>
                    </Show>
                    <Show when={(message.summary?.diffs.reduce((acc, diff) => acc + diff.deletions, 0) ?? 0) > 0}>
                      <span data-slot="message-nav-diff-changes message-nav-diff-deletions">
                        {message.summary?.diffs.reduce((acc, diff) => acc + diff.deletions, 0)}
                      </span>
                    </Show>
                    <Show
                      when={
                        (message.summary?.diffs?.reduce((acc, diff) => acc + diff.additions, 0) ?? 0) <= 0 &&
                        (message.summary?.diffs?.reduce((acc, diff) => acc + diff.deletions, 0) ?? 0) <= 0
                      }
                    >
                      <span data-slot="message-nav-diff-changes message-nav-diff-neutral">0</span>
                    </Show>
                  </button>
                </Match>
              </Switch>
            </li>
          )
        }}
      </For>
    </ul>
  )

  return (
    <Switch>
      <Match when={local.size === "compact"}>
        <Tooltip openDelay={0} closeDelay={300} placement="right-start" gutter={-40} shift={-10} overlap>
          <Tooltip.Trigger as="div">{content()}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content data-slot="message-nav-tooltip">
              <div data-slot="message-nav-tooltip-content">
                <MessageNav {...props} size="normal" class="" />
              </div>
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip>
      </Match>
      <Match when={local.size === "normal"}>{content()}</Match>
    </Switch>
  )
}
