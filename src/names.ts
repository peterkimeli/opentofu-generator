import { createHash } from "node:crypto";
import type { InputSpec, ResourceSpec } from "./schema.js";

/**
 * AWS naming rules are stricter than the free-form `name` in the input and
 * differ per service. Everything here is a pure function of the input, so the
 * same input always yields the same names (no randomness, no clock).
 */

const HASH_LEN = 6;

// S3 bucket names are global across all AWS accounts, so the generated HCL
// appends "-<account id>-<region>" at apply time (see generators/s3.ts).
const ACCOUNT_ID_LEN = 12;
const S3_MAX = 63;
const SQS_MAX = 80;
const LAMBDA_MAX = 64;
// IAM role is "<lambda name>-role" and capped at 64 chars.
const ROLE_SUFFIX = "-role";
const ROLE_MAX = 64;
const TAG_MAX = 256;

// Prefixes AWS reserves for bucket names. (Reserved suffixes cannot occur
// because our buckets always end in the region.)
const S3_RESERVED_PREFIXES = ["xn--", "sthree-", "amzn-s3-demo-"];

export function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, HASH_LEN);
}

/** Lowercase, ASCII-only, hyphen-separated; may return "". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Fit `base + suffix` into `max` chars. When the base is too long it is cut
 * and a hash of the full base is appended, so two long names sharing a prefix
 * still end up distinct.
 */
export function fit(base: string, max: number, suffix = ""): string {
  if (base.length + suffix.length <= max) return base + suffix;
  const keep = max - suffix.length - HASH_LEN - 1;
  const head = base.slice(0, keep).replace(/-+$/, "");
  return `${head}-${shortHash(base)}${suffix}`;
}

/** Tag values allow letters, digits, spaces and _.:/=+-@ only. */
export function tagValue(name: string): string {
  return name.replace(/[^\p{L}\p{N}\p{Zs}_.:/=+\-@]/gu, "_").slice(0, TAG_MAX);
}

/**
 * Hands out unique names within one namespace, in call order. A clash gets
 * "-2", "-3", ... (re-fitted to the length limit), so output depends only on
 * input order.
 */
export class Allocator {
  private readonly used = new Set<string>();

  constructor(private readonly max: number, private readonly sep = "-") {}

  take(base: string): string {
    let candidate = fit(base, this.max);
    for (let n = 2; this.used.has(candidate); n++) {
      candidate = fit(base, this.max, `${this.sep}${n}`);
    }
    this.used.add(candidate);
    return candidate;
  }
}

export interface ResolvedResource {
  spec: ResourceSpec;
  /** Terraform resource label, unique across the whole file. */
  label: string;
  /** AWS-facing name (for S3: the prefix before "-<account>-<region>"). */
  awsName: string;
  /** Original name, made safe for a tag value. */
  tagName: string;
}

const TYPE_PREFIX: Record<ResourceSpec["type"], string> = {
  "object-store": "bucket",
  queue: "queue",
  function: "function",
};

export function s3BaseMax(region: string): number {
  return S3_MAX - 1 - ACCOUNT_ID_LEN - 1 - region.length;
}

export function resolveNames(input: InputSpec): ResolvedResource[] {
  const labels = new Allocator(Number.MAX_SAFE_INTEGER, "_");
  const perType = {
    "object-store": new Allocator(s3BaseMax(input.region)),
    queue: new Allocator(SQS_MAX),
    function: new Allocator(Math.min(LAMBDA_MAX, ROLE_MAX - ROLE_SUFFIX.length)),
  };

  return input.resources.map((spec) => {
    let slug = slugify(spec.name);
    if (slug === "") slug = `${TYPE_PREFIX[spec.type]}-${shortHash(spec.name)}`;

    if (spec.type === "object-store" && S3_RESERVED_PREFIXES.some((p) => slug.startsWith(p))) {
      slug = `b-${slug}`;
    }

    let label = slug.replace(/-/g, "_");
    if (!/^[a-z_]/.test(label)) label = `r_${label}`;

    return {
      spec,
      label: labels.take(`${TYPE_PREFIX[spec.type]}_${label}`),
      awsName: perType[spec.type].take(slug),
      tagName: tagValue(spec.name),
    };
  });
}

export const LAMBDA_ROLE_SUFFIX = ROLE_SUFFIX;
