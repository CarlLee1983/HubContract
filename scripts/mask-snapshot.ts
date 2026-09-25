import path from "path";
import { maskSnapshotFile } from "../src/seed/maskSnapshot";

/**
 * Issue #13 CLI：`bun run seed:mask <snapshot> <out>`
 *
 * 把人提供的測試站快照（mysqldump，支援 `.sql` 或 `.sql.gz`）遮罩後寫到指定
 * 路徑。可重跑，同一份輸入永遠得到同一份輸出。
 */
async function main() {
  const [inputPath, outputPath] = Bun.argv.slice(2);

  if (!inputPath || !outputPath) {
    console.error("用法：bun run seed:mask <snapshot.sql|snapshot.sql.gz> <out.sql|out.sql.gz>");
    process.exit(1);
  }

  const resolvedIn = path.resolve(inputPath);
  const resolvedOut = path.resolve(outputPath);

  console.log(`[HubContract] 遮罩快照 ${resolvedIn} -> ${resolvedOut} ...`);
  await maskSnapshotFile({ inputPath: resolvedIn, outputPath: resolvedOut });
  console.log("[HubContract] 完成。");
}

main().catch((err) => {
  console.error("[HubContract] 遮罩失敗：", err);
  process.exit(1);
});
