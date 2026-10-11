#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { generate } from "./generate.js";
import { parseInput } from "./schema.js";

const USAGE = "usage: tofugen <input.json> [output/main.tf] [--region <aws-region>]";

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { region: { type: "string" } },
    });
  } catch (err) {
    console.error(`error: ${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const [inputPath, outputPath] = args.positionals;
  if (!inputPath) {
    console.error(USAGE);
    return 2;
  }

  let hcl: string;
  try {
    const raw = JSON.parse(readFileSync(inputPath, "utf8"));
    // --region overrides the input file, e.g. for accounts restricted to one region.
    if (args.values.region) raw.region = args.values.region;
    hcl = generate(parseInput(raw));
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
