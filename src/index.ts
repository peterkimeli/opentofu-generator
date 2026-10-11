#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generate } from "./generate.js";
import { parseInput } from "./schema.js";

function main(argv: string[]): number {
  const [inputPath, outputPath] = argv;
  if (!inputPath) {
    console.error("usage: tofugen <input.json> [output/main.tf]");
    return 2;
  }

  let hcl: string;
  try {
    hcl = generate(parseInput(JSON.parse(readFileSync(inputPath, "utf8"))));
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 1;
  }

  if (!outputPath) {
    process.stdout.write(hcl);
    return 0;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, hcl);
  console.error(`wrote ${outputPath}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
