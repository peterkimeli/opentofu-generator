/**
 * Lambda needs a code artefact, and the reviewer must not have to supply one.
 * For each supported runtime family we embed a tiny handler; the generated HCL
 * zips it with the `archive_file` data source at plan time.
 */

export interface RuntimeStub {
  filename: string;
  handler: string;
  source: string;
}

const RUNTIMES: Array<{ match: RegExp; stub: RuntimeStub }> = [
  {
    match: /^python3\.\d+$/,
    stub: {
      filename: "index.py",
      handler: "index.handler",
      source: [
        "import json",
        "",
        "",
        "def handler(event, context):",
        '    print(json.dumps(event))',
        '    return {"statusCode": 200, "body": "ok"}',
        "",
      ].join("\n"),
    },
  },
  {
    match: /^nodejs\d+\.x$/,
    stub: {
      filename: "index.mjs",
      handler: "index.handler",
      source: [
        "export const handler = async (event) => {",
        "  console.log(JSON.stringify(event));",
        '  return { statusCode: 200, body: "ok" };',
        "};",
        "",
      ].join("\n"),
    },
  },
  {
    match: /^ruby\d+\.\d+$/,
    stub: {
      filename: "index.rb",
      handler: "index.handler",
      source: [
        "require 'json'",
        "",
        "def handler(event:, context:)",
        "  puts event.to_json",
        "  { statusCode: 200, body: 'ok' }",
        "end",
        "",
      ].join("\n"),
    },
  },
];

export class UnsupportedRuntimeError extends Error {}

export function stubFor(runtime: string): RuntimeStub {
  const found = RUNTIMES.find((r) => r.match.test(runtime));
  if (!found) {
    throw new UnsupportedRuntimeError(
      `runtime "${runtime}" is not supported (supported: python3.x, nodejsNN.x, rubyN.N); ` +
        "compiled runtimes need a build artefact, which this generator does not produce",
    );
  }
  return found.stub;
}
