import { build } from "esbuild";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const buildDir = join(process.cwd(), ".smoke-build");
const out = join(buildDir, "smoke.mjs");
const result = await build({
  entryPoints: ["smoke/smoke.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  jsx: "automatic",
  loader: { ".css": "empty" },
  external: ["jsdom", "react", "react-dom", "react/jsx-runtime"],
});
mkdirSync(buildDir, { recursive: true });
writeFileSync(out, result.outputFiles[0].text);
try {
  execFileSync(process.execPath, [out], { stdio: "inherit" });
} catch {
  process.exitCode = 1;
} finally {
  rmSync(join(process.cwd(), ".smoke-build"), { recursive: true, force: true });
}
if (process.exitCode) process.exit(process.exitCode);
