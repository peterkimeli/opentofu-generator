export type ResourceType = "object-store" | "queue" | "function";

export interface ObjectStoreSpec {
  type: "object-store";
  name: string;
}

export interface QueueSpec {
  type: "queue";
  name: string;
}

export interface FunctionSpec {
  type: "function";
  name: string;
  runtime: string;
}

export type ResourceSpec = ObjectStoreSpec | QueueSpec | FunctionSpec;

export interface InputSpec {
  region: string;
  resources: ResourceSpec[];
}

const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;

export class InputError extends Error {}

function fail(path: string, msg: string): never {
  throw new InputError(`${path}: ${msg}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireString(obj: Record<string, unknown>, key: string, path: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") fail(`${path}.${key}`, "must be a non-empty string");
  return v;
}

export function parseInput(raw: unknown): InputSpec {
  if (!isObject(raw)) fail("$", "must be an object");

  const region = requireString(raw, "region", "$");
  if (!REGION_RE.test(region)) fail("$.region", `"${region}" is not a valid AWS region`);

  if (!Array.isArray(raw.resources)) fail("$.resources", "must be an array");

  const resources = raw.resources.map((r, i): ResourceSpec => {
    const path = `$.resources[${i}]`;
    if (!isObject(r)) fail(path, "must be an object");
    const name = requireString(r, "name", path);
    switch (r.type) {
      case "object-store":
        return { type: "object-store", name };
      case "queue":
        return { type: "queue", name };
      case "function":
        return { type: "function", name, runtime: requireString(r, "runtime", path) };
      default:
        fail(`${path}.type`, `unknown resource type ${JSON.stringify(r.type)}`);
    }
  });

  return { region, resources };
}
