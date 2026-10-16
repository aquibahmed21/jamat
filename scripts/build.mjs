// Compiles TypeScript and copies static files into dist/. Uses the `tsc` on PATH.
import { execFileSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
execFileSync("tsc", ["-p", "tsconfig.json"], { stdio: "inherit" });
cpSync("index.html", "dist/index.html");
cpSync("styles", "dist/styles", { recursive: true });
console.log("Built dist/");
