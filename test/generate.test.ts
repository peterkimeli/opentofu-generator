import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generate } from "../src/generate.js";
import { str } from "../src/hcl.js";
import { UnsupportedRuntimeError } from "../src/runtimes.js";
import { parseInput } from "../src/schema.js";

const load = (p: string) => parseInput(JSON.parse(readFileSync(p, "utf8")));

test("committed infra/main.tf matches the generator output for the example", () => {
  const expected = readFileSync("infra/main.tf", "utf8");
  assert.equal(generate(load("examples/input.json")), expected, "run `npm run generate` and commit");
});

test("generating twice yields identical output", () => {
  const input = load("examples/edge-cases.json");
  assert.equal(generate(input), generate(input));
});

test("the example creates exactly one bucket, queue and lambda", () => {
  const out = generate(load("examples/input.json"));
  assert.equal(out.match(/resource "aws_s3_bucket"/g)?.length, 1);
  assert.equal(out.match(/resource "aws_sqs_queue"/g)?.length, 1);
  assert.equal(out.match(/resource "aws_lambda_function"/g)?.length, 1);
  assert.match(out, /force_destroy = true/);
  assert.match(out, /resource "aws_cloudwatch_log_group"/);
});

test("duplicate names produce unique resource labels", () => {
  const out = generate(load("examples/edge-cases.json"));
  const labels = [...out.matchAll(/^resource "(\S+)" "(\S+)"/gm)].map((m) => `${m[1]}.${m[2]}`);
  assert.equal(new Set(labels).size, labels.length);
});

test("string literals escape quotes and template sequences", () => {
  assert.equal(str('a "b" ${c} %{d}').text, '"a \\"b\\" $${c} %%{d}"');
});

test("unsupported runtimes fail with a clear error", () => {
  assert.throws(
    () => generate({ region: "us-east-1", resources: [{ type: "function", name: "x", runtime: "java21" }] }),
    UnsupportedRuntimeError,
  );
});
