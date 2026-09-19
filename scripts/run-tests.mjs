// 用 esbuild 打包纯 TS 测试后在 Node 运行，无需额外测试框架
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const result = await build({
  entryPoints: ["src/domain/engine.test.ts", "src/domain/workflow.test.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  write: false,
  outdir: tmpdir(),
});
for (const file of result.outputFiles) {
  const out = join(tmpdir(), file.path.split("/").pop() ?? "test.cjs");
  writeFileSync(out, file.text);
  try {
    execFileSync(process.execPath, [out], { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}
