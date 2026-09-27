import path from "path";
import { fileURLToPath } from "url";
import { selectV1Scenarios } from "../src/report/selectV1Scenarios";

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.join(import.meta.dir, "..");
  const outputDir = process.argv[2];
  if (!outputDir || process.argv.length > 3) {
    console.error("Usage: bun run scripts/prepare-v1-replay.ts <empty-output-directory>");
    process.exit(2);
  }
  try {
    const result = await selectV1Scenarios(
      path.join(root, "docs/v1-route-scenario-matrix.json"), path.join(root, "scenarios"), outputDir);
    console.log(`Selected ${result.count} v1 scenarios`);
    console.log(`Excluded IDs: ${result.excludedIds.join(", ") || "none"}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
