#!/usr/bin/env bun

import { Script } from "@opencode-ai/script"
import { $ } from "bun"

const dir = new URL("..", import.meta.url).pathname
process.chdir(dir)

const pkg = await import("../package.json").then((m) => m.default)
const original = JSON.parse(JSON.stringify(pkg))
for (const [key, value] of Object.entries(pkg.exports)) {
  const file = value.replace("./src/", "./dist/").replace(".ts", "")
  pkg.exports[key] = {
    import: file + ".js",
    types: file + ".d.ts",
  }
}
await Bun.write("package.json", JSON.stringify(pkg, null, 2))
await $`bun pm pack`
// Use .nothrow() to continue even if npm publish fails (e.g., no NPM_TOKEN)
await $`npm publish *.tgz --tag ${Script.channel} --access public`.nothrow()
await Bun.write("package.json", JSON.stringify(original, null, 2))
