import { Provider } from "@/provider/provider"

import { fn } from "@/util/fn"
import z from "zod"
import { Session } from "."

import { MessageV2 } from "./message-v2"
import { Identifier } from "@/id/id"
import { Snapshot } from "@/snapshot"

import { Log } from "@/util/log"
import path from "path"
import { Instance } from "@/project/instance"
import { Storage } from "@/storage/storage"
import { Bus } from "@/bus"

import { LLM } from "./llm"
import { Agent } from "@/agent/agent"

const DIFF_ORDER_PROMPT = `You help order file diffs for code review.

Given a list of changed files, return the best order to review them so a developer can understand the changes quickly.

Guidelines:
- Prefer dependency order (types/config before usage)
- Group related files together
- Put core logic and shared utilities before UI
- Put tests and docs after code

Rules:
- Output ONLY file paths, one per line
- Use ONLY the file paths provided in the input
- Include every provided file path exactly once
- No numbering, bullets, headings, or commentary
`

export namespace SessionSummary {
  const log = Log.create({ service: "session.summary" })
  const seq = new Map<string, number>()
  const aborts = new Map<string, AbortController>()

  export const summarize = fn(
    z.object({
      sessionID: z.string(),
      messageID: z.string(),
    }),
    async (input) => {
      const all = await Session.messages({ sessionID: input.sessionID })
      await Promise.all([
        summarizeSession({ sessionID: input.sessionID, messages: all }),
        summarizeMessage({ messageID: input.messageID, messages: all }),
      ])
    },
  )

  async function summarizeSession(input: { sessionID: string; messages: MessageV2.WithParts[] }) {
    const id = input.sessionID
    const version = (seq.get(id) ?? 0) + 1
    seq.set(id, version)

    const ctrl = aborts.get(id)
    if (ctrl) ctrl.abort()
    aborts.delete(id)

    const files = new Set(
      input.messages
        .flatMap((x) => x.parts)
        .filter((x) => x.type === "patch")
        .flatMap((x) => x.files)
        .map((x) => path.relative(Instance.worktree, x)),
    )
    const diffs = await computeDiff({ messages: input.messages }).then((x) => x.filter((x) => files.has(x.file)))

    if (seq.get(id) !== version) return

    const ordered = await orderDiffs({ sessionID: id, diffs, messages: input.messages })

    if (seq.get(id) !== version) return

    const safe = (n: number) => (Number.isFinite(n) ? n : 0)
    await Session.update(id, (draft) => {
      draft.summary = {
        additions: ordered.reduce((sum, x) => sum + safe(x.additions), 0),
        deletions: ordered.reduce((sum, x) => sum + safe(x.deletions), 0),
        files: ordered.length,
      }
    })
    await Storage.write(["session_diff", id], ordered)
    Bus.publish(Session.Event.Diff, {
      sessionID: id,
      diff: ordered,
    })
  }

  async function orderDiffs(input: { sessionID: string; diffs: Snapshot.FileDiff[]; messages: MessageV2.WithParts[] }) {
    if (input.diffs.length <= 1) return input.diffs

    const safe = (n: number) => (Number.isFinite(n) ? n : 0)
    const sig = (diffs: Snapshot.FileDiff[]) =>
      diffs
        .map((d) => `${d.file}:${safe(d.additions)}:${safe(d.deletions)}:${d.before.length}:${d.after.length}`)
        .sort()
        .join("\n")

    const prev = await Storage.read<Snapshot.FileDiff[]>(["session_diff", input.sessionID]).catch(() => [])
    const map = new Map(input.diffs.map((d) => [d.file, d]))
    const cached = prev.map((d) => map.get(d.file)).filter((d): d is Snapshot.FileDiff => !!d)
    const stable = cached.length === input.diffs.length && cached.length === prev.length ? cached : undefined

    if (stable && sig(prev) === sig(input.diffs)) return stable

    const fallback = stable ?? input.diffs

    const user = input.messages
      .slice()
      .reverse()
      .find((m) => m.info.role === "user")?.info as MessageV2.User | undefined
    if (!user) return fallback

    const model = await sortModel(input.messages)
    if (!model) return fallback

    const base = await Agent.get("summary")
    const agent: Agent.Info = {
      ...base,
      name: "diff-order",
      prompt: DIFF_ORDER_PROMPT,
      temperature: 0.2,
    }

    const items = input.diffs
      .map((d) => {
        const additions = safe(d.additions)
        const deletions = safe(d.deletions)
        const ext = path.extname(d.file) || "none"
        const kind =
          d.before === "" && d.after === ""
            ? "binary"
            : d.before === ""
              ? "added"
              : d.after === ""
                ? "deleted"
                : "modified"
        return `${d.file}\t${kind}\t+${additions}\t-${deletions}\text:${ext}`
      })
      .join("\n")

    const abort = new AbortController()
    aborts.set(input.sessionID, abort)
    const timer = setTimeout(() => abort.abort(), 8000)
    const clean = () => {
      clearTimeout(timer)
      if (aborts.get(input.sessionID) === abort) aborts.delete(input.sessionID)
    }

    const stream = await LLM.stream({
      agent,
      user,
      tools: {},
      model,
      small: true,
      messages: [
        {
          role: "user" as const,
          content: `Order these files for review.\n\nFiles (tab-separated: path\tkind\t+adds\t-dels\text:ext):\n${items}`,
        },
      ],
      abort: abort.signal,
      sessionID: user.sessionID,
      system: [],
      retries: 1,
    }).catch(() => undefined)

    if (!stream) {
      clean()
      return fallback
    }

    const text = await stream.text.catch(() => "").finally(clean)
    const files = new Set(input.diffs.map((d) => d.file))
    const seen = new Set<string>()
    const order = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        line
          .replace(/^[-*]\s+/, "")
          .replace(/^\d+[.)]\s+/, "")
          .replace(/^['"`]/, "")
          .replace(/['"`,]$/, "")
          .trim(),
      )
      .map((line) => (line.includes("\t") ? (line.split("\t")[0] ?? "") : line).trim())
      .filter((line) => files.has(line))
      .filter((line) => {
        if (seen.has(line)) return false
        seen.add(line)
        return true
      })

    if (order.length === 0) return fallback

    const sorted = order.map((file) => map.get(file)).filter((d): d is Snapshot.FileDiff => !!d)
    const rest = input.diffs.filter((d) => !seen.has(d.file))
    const result = [...sorted, ...rest]
    if (result.length !== input.diffs.length) return fallback

    log.debug("diff order", {
      sessionID: input.sessionID,
      ordered: result.map((d) => d.file),
    })

    return result
  }

  async function sortModel(messages: MessageV2.WithParts[]) {
    const assistant = messages
      .slice()
      .reverse()
      .find((m) => m.info.role === "assistant")?.info as MessageV2.Assistant | undefined

    if (assistant) {
      const small = await Provider.getSmallModel(assistant.providerID).catch(() => undefined)
      if (small) return small
      return Provider.getModel(assistant.providerID, assistant.modelID).catch(() => undefined)
    }

    const defaultModel = await Provider.defaultModel().catch(() => undefined)
    if (!defaultModel) return undefined

    const small = await Provider.getSmallModel(defaultModel.providerID).catch(() => undefined)
    if (small) return small
    return Provider.getModel(defaultModel.providerID, defaultModel.modelID).catch(() => undefined)
  }

  async function summarizeMessage(input: { messageID: string; messages: MessageV2.WithParts[] }) {
    const messages = input.messages.filter(
      (m) => m.info.id === input.messageID || (m.info.role === "assistant" && m.info.parentID === input.messageID),
    )
    const msgWithParts = messages.find((m) => m.info.id === input.messageID)!
    const userMsg = msgWithParts.info as MessageV2.User
    const diffs = await computeDiff({ messages })
    userMsg.summary = {
      ...userMsg.summary,
      diffs,
    }
    await Session.updateMessage(userMsg)

    const assistantMsg = messages.find((m) => m.info.role === "assistant")!.info as MessageV2.Assistant
    const small =
      (await Provider.getSmallModel(assistantMsg.providerID)) ??
      (await Provider.getModel(assistantMsg.providerID, assistantMsg.modelID))

    const textPart = msgWithParts.parts.find((p) => p.type === "text" && !p.synthetic) as MessageV2.TextPart
    if (textPart && !userMsg.summary?.title) {
      const agent = await Agent.get("title")
      const stream = await LLM.stream({
        agent,
        user: userMsg,
        tools: {},
        model: agent.model ? await Provider.getModel(agent.model.providerID, agent.model.modelID) : small,
        small: true,
        messages: [
          {
            role: "user" as const,
            content: `
              The following is the text to summarize:
              <text>
              ${textPart?.text ?? ""}
              </text>
            `,
          },
        ],
        abort: new AbortController().signal,
        sessionID: userMsg.sessionID,
        system: [],
        retries: 3,
      })
      const result = await stream.text
      log.info("title", { title: result })
      userMsg.summary.title = result
      await Session.updateMessage(userMsg)
    }

    if (
      messages.some(
        (m) =>
          m.info.role === "assistant" && m.parts.some((p) => p.type === "step-finish" && p.reason !== "tool-calls"),
      )
    ) {
      if (diffs.length > 0) {
        for (const msg of messages) {
          for (const part of msg.parts) {
            if (part.type === "tool" && part.state.status === "completed") {
              part.state.output = "[TOOL OUTPUT PRUNED]"
            }
          }
        }
        const summaryAgent = await Agent.get("summary")
        const stream = await LLM.stream({
          agent: summaryAgent,
          user: userMsg,
          tools: {},
          model: summaryAgent.model
            ? await Provider.getModel(summaryAgent.model.providerID, summaryAgent.model.modelID)
            : small,
          small: true,
          messages: [
            ...MessageV2.toModelMessage(messages),
            {
              role: "user" as const,
              content: `Summarize the above conversation according to your system prompts.`,
            },
          ],
          abort: new AbortController().signal,
          sessionID: userMsg.sessionID,
          system: [],
          retries: 3,
        })
        const result = await stream.text
        if (result) {
          userMsg.summary.body = result
        }
      }
      await Session.updateMessage(userMsg)
    }
  }

  export const diff = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message").optional(),
    }),
    async (input) => {
      return Storage.read<Snapshot.FileDiff[]>(["session_diff", input.sessionID]).catch(() => [])
    },
  )

  async function computeDiff(input: { messages: MessageV2.WithParts[] }) {
    let from: string | undefined
    let to: string | undefined

    // scan assistant messages to find earliest from and latest to
    // snapshot
    for (const item of input.messages) {
      if (!from) {
        for (const part of item.parts) {
          if (part.type === "step-start" && part.snapshot) {
            from = part.snapshot
            break
          }
        }
      }

      for (const part of item.parts) {
        if (part.type === "step-finish" && part.snapshot) {
          to = part.snapshot
          break
        }
      }
    }

    if (from && to) return Snapshot.diffFull(from, to)
    return []
  }
}
