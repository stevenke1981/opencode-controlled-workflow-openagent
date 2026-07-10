import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const roots: string[] = []
const repo = path.resolve(import.meta.dir, "..")

async function fixture(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function powershell(args: string[]): Promise<{ exitCode: number; output: string }> {
  const process = Bun.spawn(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", ...args], {
    cwd: repo,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  return { exitCode, output: `${stdout}\n${stderr}` }
}

describe.skipIf(process.platform !== "win32")("PowerShell installer", () => {
  test("project install preserves config, backs up AGENTS, and installs evolution assets", async () => {
    const target = await fixture("controlled-project-install")
    const originalConfig = `{
  // Keep URL comments safe: https://example.test/path
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["existing-plugin"]
}\n`
    await writeFile(path.join(target, "opencode.jsonc"), originalConfig)
    await writeFile(path.join(target, "AGENTS.md"), "# Existing instructions\n")

    const result = await powershell(["-File", "install.ps1", "-Scope", "Project", "-ProjectPath", target])
    expect(result.exitCode, result.output).toBe(0)
    expect(await readFile(path.join(target, "opencode.jsonc"), "utf8")).toBe(originalConfig)
    expect(await readFile(path.join(target, ".opencode", "plugins", "hermes-self-evolution.plugin.ts"), "utf8")).toContain("Hermes-style")
    expect(await readFile(path.join(target, ".opencode", "tools", "evolution.ts"), "utf8")).toContain("evolution")

    const backups = await readdir(path.join(target, ".controlled-workflow-backups"))
    expect(backups.length).toBe(1)
    expect(await readFile(path.join(target, ".controlled-workflow-backups", backups[0], "AGENTS.md"), "utf8")).toContain("Existing instructions")
  }, 30_000)

  test("global dry-run changes nothing and real install preserves global config files", async () => {
    const target = await fixture("controlled-global-install")
    await mkdir(path.join(target, "plugins"), { recursive: true })
    await writeFile(path.join(target, "opencode.jsonc"), "{\"plugin\":[\"keep-me\"]}\n")
    await writeFile(path.join(target, "AGENTS.md"), "# Keep global\n")

    const dryRun = await powershell(["-File", "install.ps1", "-Scope", "Global", "-OpenCodeConfigPath", target, "-WhatIf"])
    expect(dryRun.exitCode, dryRun.output).toBe(0)
    await expect(readFile(path.join(target, "plugins", "hermes-self-evolution.plugin.ts"), "utf8")).rejects.toThrow()

    const installed = await powershell(["-File", "install.ps1", "-Scope", "Global", "-OpenCodeConfigPath", target])
    expect(installed.exitCode, installed.output).toBe(0)
    expect(await readFile(path.join(target, "opencode.jsonc"), "utf8")).toContain("keep-me")
    expect(await readFile(path.join(target, "AGENTS.md"), "utf8")).toContain("Keep global")
    expect(await readFile(path.join(target, "plugins", "hermes-self-evolution.plugin.ts"), "utf8")).toContain("Hermes-style")
    await expect(readFile(path.join(target, "package.json"), "utf8")).rejects.toThrow()
    await expect(readFile(path.join(target, "node_modules", ".package-lock.json"), "utf8")).rejects.toThrow()
  }, 30_000)
})
