import { Component, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Tag } from "@opencode-ai/ui/tag"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { iconNames, type IconName } from "@opencode-ai/ui/icons/provider"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { DialogConnectVaultAI } from "./dialog-connect-vaultai"
import { useLanguage } from "@/context/language"
import { DialogCustomProvider } from "./dialog-custom-provider"

const CUSTOM_ID = "_custom"
const VAULTAI_ID = "_vaultai"

function icon(id: string): IconName {
  if (iconNames.includes(id as IconName)) return id as IconName
  return "synthetic"
}

export const DialogSelectProvider: Component = () => {
  const dialog = useDialog()
  const providers = useProviders()
  const language = useLanguage()

  const popularGroup = () => language.t("dialog.provider.group.popular")
  const otherGroup = () => language.t("dialog.provider.group.other")

  return (
    <Dialog title={language.t("command.provider.connect")} transition>
      <List
        search={{ placeholder: language.t("dialog.provider.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.provider.empty")}
        activeIcon="plus-small"
        key={(x) => x?.id}
        items={() => {
          language.locale()
          return [{ id: VAULTAI_ID, name: "VaultAI" }, { id: CUSTOM_ID, name: "Custom provider" }, ...providers.all()]
        }}
        filterKeys={["id", "name"]}
        groupBy={(x) => (x.id === VAULTAI_ID || popularProviders.includes(x.id) ? popularGroup() : otherGroup())}
        sortBy={(a, b) => {
          if (a.id === VAULTAI_ID) return -1
          if (b.id === VAULTAI_ID) return 1
          if (a.id === CUSTOM_ID) return -1
          if (b.id === CUSTOM_ID) return 1
          if (popularProviders.includes(a.id) && popularProviders.includes(b.id))
            return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id)
          return a.name.localeCompare(b.name)
        }}
        sortGroupsBy={(a, b) => {
          const popular = popularGroup()
          if (a.category === popular && b.category !== popular) return -1
          if (b.category === popular && a.category !== popular) return 1
          return 0
        }}
        onSelect={(x) => {
          if (!x) return
          if (x.id === VAULTAI_ID) {
            dialog.show(() => <DialogConnectVaultAI />)
            return
          }
          if (x.id === CUSTOM_ID) {
            dialog.show(() => <DialogCustomProvider back="providers" />)
            return
          }
          dialog.show(() => <DialogConnectProvider provider={x.id} />)
        }}
      >
        {(i) => (
          <div class="px-1.25 w-full flex items-center gap-x-3">
            <Show
              when={i.id !== VAULTAI_ID}
              fallback={
                <svg
                  data-slot="list-item-extra-icon"
                  class="size-5 shrink-0"
                  viewBox="0 0 78 74"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7.29693 36.8993C24.291 36.8993 38.0675 23.2883 38.0675 6.49815C38.0675 5.11855 37.9744 3.76039 37.7942 2.42948C37.6648 1.47332 36.6688 0.920506 35.7434 1.20705C25.8872 4.25881 11.4224 4.0557 2.87174 0.985704C1.77351 0.591398 0.535369 1.36596 0.531599 2.52816C0.501734 11.7457 0.430156 22.6255 2.87342 33.5918C3.29153 35.4685 4.89093 36.8669 6.8217 36.8958C6.97985 36.8981 7.13826 36.8993 7.29693 36.8993Z"
                    fill="#0158E5"
                  />
                  <path
                    d="M38.0676 69.1568C38.0676 52.3666 24.2912 38.7559 7.29705 38.7559C6.92077 38.7559 6.54606 38.7625 6.17302 38.7758C5.18325 38.8109 4.52934 39.781 4.83933 40.7173C9.20737 53.9118 17.7727 67.2261 35.6344 73.5598C36.3703 73.8204 37.196 73.4884 37.5229 72.7818C38.0676 71.6056 38.0676 71.1934 38.0676 69.1568Z"
                    fill="#0158E5"
                  />
                  <path
                    d="M70.7032 36.8988C53.7091 36.8988 39.9326 23.2878 39.9326 6.49765C39.9326 5.11806 40.0256 3.7599 40.2058 2.42899C40.3352 1.47283 41.3312 0.920017 42.2567 1.20656C52.1129 4.25832 66.5776 4.05521 75.1283 0.985215C76.2265 0.59091 77.4646 1.36548 77.4683 2.52767C77.4981 11.7452 77.5698 22.625 75.1267 33.5913C74.7084 35.468 73.1092 36.8664 71.1785 36.8953C71.0204 36.8976 70.8618 36.8988 70.7032 36.8988Z"
                    fill="#0158E5"
                  />
                  <path
                    d="M39.9326 69.1563C39.9326 52.3667 53.7091 38.7554 70.7032 38.7554C71.0796 38.7554 71.4544 38.762 71.8271 38.7753C72.817 38.8104 73.4709 39.7805 73.161 40.7168C68.793 53.9113 60.2276 67.2256 42.3658 73.5593C41.6299 73.8199 40.8042 73.488 40.4773 72.7813C39.9326 71.6051 39.9326 71.1929 39.9326 69.1563Z"
                    fill="#0158E5"
                  />
                </svg>
              }
            >
              <ProviderIcon data-slot="list-item-extra-icon" id={icon(i.id)} />
            </Show>
            <span>{i.name}</span>
            <Show when={i.id === VAULTAI_ID}>
              <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
            </Show>
            <Show when={i.id === CUSTOM_ID}>
              <Tag>{language.t("settings.providers.tag.custom")}</Tag>
            </Show>
            <Show when={i.id === "opencode"}>
              <div class="text-14-regular text-text-weak">Pay-as-you-go</div>
            </Show>
            <Show when={i.id === "anthropic"}>
              <div class="text-14-regular text-text-weak">{language.t("dialog.provider.anthropic.note")}</div>
            </Show>
            <Show when={i.id === "openai"}>
              <div class="text-14-regular text-text-weak">{language.t("dialog.provider.openai.note")}</div>
            </Show>
            <Show when={i.id.startsWith("github-copilot")}>
              <div class="text-14-regular text-text-weak">{language.t("dialog.provider.copilot.note")}</div>
            </Show>
          </div>
        )}
      </List>
    </Dialog>
  )
}
