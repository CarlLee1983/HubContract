import "./testEnv";
import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { maskSnapshotFile } from "../../src/seed/maskSnapshot";

const SAMPLE_SQL = `DROP TABLE IF EXISTS \`stations\`;
CREATE TABLE \`stations\` (\`id\` int NOT NULL, \`secret_key\` varchar(255)) ENGINE=InnoDB;

INSERT INTO \`stations\` (\`id\`,\`secret_key\`) VALUES (1,'sk_live_real_secret_should_not_leak');
`;

async function tempPath(name: string): Promise<string> {
  return path.join(os.tmpdir(), `hubcontract-mask-snapshot-${Date.now()}-${name}`);
}

describe("Issue #13：maskSnapshotFile（.sql / .sql.gz I/O）", () => {
  it("讀取 .sql、寫出 .sql，內容已遮罩", async () => {
    const inPath = await tempPath("in.sql");
    const outPath = await tempPath("out.sql");
    await fs.writeFile(inPath, SAMPLE_SQL, "utf-8");

    await maskSnapshotFile({ inputPath: inPath, outputPath: outPath });
    const output = await fs.readFile(outPath, "utf-8");

    expect(output).not.toContain("sk_live_real_secret_should_not_leak");
    expect(output).toContain("synthetic_secret_key_");

    await fs.unlink(inPath);
    await fs.unlink(outPath);
  });

  it("讀取 .sql.gz、寫出 .sql.gz，解壓後內容已遮罩，且重跑輸出逐位元組相同", async () => {
    const inPath = await tempPath("in.sql.gz");
    const outPath = await tempPath("out.sql.gz");
    await fs.writeFile(inPath, Bun.gzipSync(Buffer.from(SAMPLE_SQL, "utf-8")));

    await maskSnapshotFile({ inputPath: inPath, outputPath: outPath });
    const outputGz = await fs.readFile(outPath);
    const output = Buffer.from(Bun.gunzipSync(outputGz)).toString("utf-8");

    expect(output).not.toContain("sk_live_real_secret_should_not_leak");
    expect(output).toContain("synthetic_secret_key_");

    // 重跑一次，壓縮後的 bytes 必須完全相同（Bun.gzipSync 不帶時間戳，見 maskSnapshot.ts）。
    const outPath2 = await tempPath("out2.sql.gz");
    await maskSnapshotFile({ inputPath: inPath, outputPath: outPath2 });
    const outputGz2 = await fs.readFile(outPath2);
    expect(Buffer.compare(outputGz, outputGz2)).toBe(0);

    await fs.unlink(inPath);
    await fs.unlink(outPath);
    await fs.unlink(outPath2);
  });

  it("混合輸入輸出格式：讀 .sql.gz、寫出未壓縮的 .sql", async () => {
    const inPath = await tempPath("in-mixed.sql.gz");
    const outPath = await tempPath("out-mixed.sql");
    await fs.writeFile(inPath, Bun.gzipSync(Buffer.from(SAMPLE_SQL, "utf-8")));

    await maskSnapshotFile({ inputPath: inPath, outputPath: outPath });
    const output = await fs.readFile(outPath, "utf-8");

    expect(output).not.toContain("sk_live_real_secret_should_not_leak");
    expect(output).toContain("synthetic_secret_key_");

    await fs.unlink(inPath);
    await fs.unlink(outPath);
  });
});
