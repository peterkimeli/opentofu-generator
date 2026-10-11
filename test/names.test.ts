import { test } from "node:test";
import assert from "node:assert/strict";
import { Allocator, fit, resolveNames, s3BaseMax, slugify, tagValue } from "../src/names.js";
import { InputError, parseInput, type InputSpec } from "../src/schema.js";

const example: InputSpec = {
  region: "us-east-1",
  resources: [
    { type: "object-store", name: "Reports Archive" },
    { type: "queue", name: "Order Events" },
    { type: "function", name: "Process Orders", runtime: "python3.12" },
  ],
};

test("slugify lowercases and replaces disallowed characters", () => {
  assert.equal(slugify("Reports Archive"), "reports-archive");
  assert.equal(slugify("  Café__Orders!! "), "cafe-orders");
  assert.equal(slugify("!!!"), "");
});

test("example input resolves to expected names", () => {
  const r = resolveNames(example);
  assert.deepEqual(
    r.map((x) => [x.label, x.awsName]),
    [
      ["bucket_reports_archive", "reports-archive"],
      ["queue_order_events", "order-events"],
      ["function_process_orders", "process-orders"],
    ],
  );
});

test("duplicate names (including ones equal only after cleaning) get unique names", () => {
  const r = resolveNames({
    region: "us-east-1",
    resources: [
      { type: "queue", name: "Order Events" },
      { type: "queue", name: "order-events" },
      { type: "queue", name: "Order Events" },
    ],
  });
  assert.deepEqual(r.map((x) => x.awsName), ["order-events", "order-events-2", "order-events-3"]);
  assert.deepEqual(r.map((x) => x.label), [
    "queue_order_events",
    "queue_order_events_2",
    "queue_order_events_3",
  ]);
});

test("same name across different types does not clash", () => {
  const r = resolveNames({
    region: "us-east-1",
    resources: [
      { type: "queue", name: "Orders" },
      { type: "function", name: "Orders", runtime: "python3.12" },
    ],
  });
  assert.deepEqual(r.map((x) => x.awsName), ["orders", "orders"]);
  assert.notEqual(r[0]!.label, r[1]!.label);
});

test("long names are cut to the service limit and stay distinct", () => {
  const long = "a".repeat(100);
  const r = resolveNames({
    region: "ap-southeast-2",
    resources: [
      { type: "object-store", name: long },
      { type: "object-store", name: long + "b" },
      { type: "function", name: long, runtime: "python3.12" },
    ],
  });
  assert.ok(r[0]!.awsName.length <= s3BaseMax("ap-southeast-2"));
  assert.notEqual(r[0]!.awsName, r[1]!.awsName);
  assert.ok(r[2]!.awsName.length + "-role".length <= 64);
});

test("dedupe suffix still respects the length limit", () => {
  const a = new Allocator(10);
  const first = a.take("abcdefghij");
  const second = a.take("abcdefghij");
  assert.equal(first, "abcdefghij");
  assert.ok(second.length <= 10);
  assert.notEqual(first, second);
  assert.equal(fit("abc", 10, "-2"), "abc-2");
});

test("names with no usable characters fall back to a hash", () => {
  const [r] = resolveNames({ region: "us-east-1", resources: [{ type: "queue", name: "???" }] });
  assert.match(r!.awsName, /^queue-[0-9a-f]{6}$/);
});

test("reserved S3 prefixes and leading digits are handled", () => {
  const r = resolveNames({
    region: "us-east-1",
    resources: [
      { type: "object-store", name: "sthree-data" },
      { type: "object-store", name: "2024 logs" },
    ],
  });
  assert.equal(r[0]!.awsName, "b-sthree-data");
  assert.equal(r[1]!.awsName, "2024-logs");
  assert.match(r[1]!.label, /^[a-z_]/);
});

test("tag values drop disallowed characters", () => {
  assert.equal(tagValue('Order "Events" ${x}'), "Order _Events_ __x_");
});

test("resolution is deterministic", () => {
  assert.deepEqual(resolveNames(example), resolveNames(example));
});

test("parseInput rejects bad input", () => {
  assert.throws(() => parseInput({ region: "nowhere", resources: [] }), InputError);
  assert.throws(() => parseInput({ region: "us-east-1", resources: [{ type: "vm", name: "x" }] }), InputError);
  assert.throws(() => parseInput({ region: "us-east-1", resources: [{ type: "function", name: "x" }] }), InputError);
  assert.throws(() => parseInput({ region: "us-east-1", resources: [{ type: "queue", name: "  " }] }), InputError);
  assert.deepEqual(parseInput(example), example);
});
