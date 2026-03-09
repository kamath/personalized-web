#!/usr/bin/env node
const { execFileSync } = require("child_process");
const { resolve } = require("path");

const server = resolve(__dirname, "..", "server", "index.ts");

try {
  execFileSync("bun", ["run", server], { stdio: "inherit" });
} catch (err) {
  if (err.status !== null) process.exit(err.status);
  throw err;
}
