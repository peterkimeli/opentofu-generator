# opentofu-generator

A small TypeScript program that turns a JSON description of cloud resources into a single OpenTofu `main.tf` for
AWS: an S3 bucket, an SQS queue and a Lambda function.

```json
{
  "region": "us-east-1",
  "resources": [
    { "type": "object-store", "name": "Reports Archive" },
    { "type": "queue", "name": "Order Events" },
    { "type": "function", "name": "Process Orders", "runtime": "python3.12" }
  ]
}
```

## Submission

| Item | Where |
|---|---|
| Source | [src/](src/), tests in [test/](test/) |
| Generated `main.tf` for the example | [infra/main.tf](infra/main.tf) |
| `tofu apply`, second `tofu plan`, `tofu destroy` output | [evidence/](evidence/), from [Deploy run 38171671673](https://github.com/peterkimeli/opentofu-generator/actions/runs/38171671673) |
| What failed and what changed | [NOTES.md](NOTES.md) |

## Usage

```bash
npm ci
npx tsx src/index.ts examples/input.json infra/main.tf          # write a file
npx tsx src/index.ts examples/input.json                        # print to stdout
npx tsx src/index.ts examples/input.json out/main.tf --region eu-north-1
npm test
```

## How the requirements are met

1. **Names.** Each name is turned into a lowercase, hyphenated slug and fitted to each service's rules: S3 (3–63
   chars, globally unique), SQS (80), Lambda (64, and its IAM role name `<name>-role` must also fit in 64), and
   OpenTofu resource labels. Names that are too long are cut and get a short hash of the full name, so they stay
   distinct. Names with no usable characters fall back to `<type>-<hash>`. Bucket names end in
   `-<account id>-<region>`, so they are unique across AWS accounts without any randomness. The original name is
   kept in a `Name` tag.
2. **Valid and deploys.** Output is formatted exactly as `tofu fmt` would format it. CI runs `tofu fmt -check` and
   `tofu validate` on the example and on [examples/edge-cases.json](examples/edge-cases.json). The Deploy workflow
   applies the example, checks that a second plan reports no changes (`-detailed-exitcode`), destroys it, and
   checks that the state is empty.
3. **Duplicate names.** Duplicates are detected after cleaning (`"Order Events"` and `"order-events"` collide) and
   get `-2`, `-3`, … in input order, within each service and across resource labels.
4. **Same output every run.** No clocks, randomness or unordered iteration. CI generates twice and diffs the
   results, and checks that the committed `infra/main.tf` is up to date.
5. **No code artefact needed.** Each supported runtime (`python3.x`, `nodejsNN.x`, `rubyN.N`) has a small built-in
   handler, which `archive_file` zips at plan time. The zip is the same byte for byte on every build, so
   `source_code_hash` stays stable. Compiled runtimes are rejected with a clear error.

Strings are escaped for HCL, including `${` and `%{`, so names cannot inject interpolation.

## Pipeline

- **CI** ([ci.yml](.github/workflows/ci.yml)) runs on every push: typecheck, unit tests, the up-to-date check,
  the same-output check, and `tofu fmt` + `validate`.
- **Deploy** ([deploy.yml](.github/workflows/deploy.yml)) is started manually and runs init → apply → plan (must
  be empty) → destroy (runs even if earlier steps fail) → empty-state check, all in one job so no remote state
  backend is needed.

Both run on a self-hosted EC2 runner created by [bootstrap/aws-bootstrap.yaml](bootstrap/aws-bootstrap.yaml). AWS
credentials come from the instance role; no keys are stored in GitHub. Repo variables: `RUNNER_LABEL`
(`self-hosted`; leave unset for GitHub-hosted runners) and `DEPLOY_REGION` (`eu-north-1`, because this account is
limited to that region; see [NOTES.md](NOTES.md)).
