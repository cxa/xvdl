import { readFile } from "node:fs/promises";

const messageFile = process.argv[2];
if (!messageFile) {
  throw new Error("Usage: node tools/validate-commit-message.mjs <commit-message-file>");
}

const message = await readFile(messageFile, "utf8");
const firstLine = message
  .split(/\r?\n/)
  .find((line) => line.trim() && !line.trim().startsWith("#"))
  ?.trim() || "";

const pattern = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-]+\))?(!)?: .{1,72}$/;

if (!pattern.test(firstLine)) {
  console.error("Commit message must follow Conventional Commits:");
  console.error("  <type>(optional-scope): <description>");
  console.error("");
  console.error("Allowed types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test");
  console.error("Example: feat(download): save videos through native handler");
  console.error(`Got: ${firstLine || "(empty)"}`);
  process.exit(1);
}
