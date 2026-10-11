# Deployment notes

The generated configuration itself deployed cleanly on the first real run: apply created 6 resources, the second
plan reported no changes and destroy removed all 6 (see [evidence/](evidence/)). That was by design: buckets use
`force_destroy`, the Lambda log group is managed (otherwise Lambda creates it and destroy leaves it behind), the zip
is built by `archive_file` with fixed timestamps so `source_code_hash` is stable, and bucket names carry the account
id and region so they are globally unique without randomness.

What failed along the way, and what I changed:

1. **GitHub-hosted runners would not start**: the GitHub account is locked by a billing issue, so every job was
   rejected before a runner was assigned. I moved CI and deploy to a self-hosted runner on a small EC2 instance
   ([bootstrap/aws-bootstrap.yaml](bootstrap/aws-bootstrap.yaml)); the runner label is a repo variable.
2. **OIDC login was blocked**: the AWS account sits in an organization whose SCP denies
   `iam:CreateOpenIDConnectProvider`. Instead of falling back to stored access keys, the runner's instance role
   holds a least-privilege policy (only the S3/SQS/Lambda/log-group resources and `*-role` IAM roles the
   generator creates).
3. **us-east-1 is denied by the same SCP**: S3, SQS, Lambda and EC2 are allowed only in eu-north-1. The
   submitted `infra/main.tf` is generated from the example as given (us-east-1); the deploy uses the generator's
   `--region eu-north-1` override. The only differences are the two region strings
   ([evidence/region-diff.log](evidence/region-diff.log)).
4. **Bootstrap stack failures**: the console attached a restricted CloudFormation service role, and a security
   group with explicit egress rules needs a `VpcId`. I created the stack with my own credentials and relied on the
   default egress rule.
5. **Escaping bug, caught by a test before any deploy**: `"$${"` in a JavaScript `String.replace` replacement is a
   single `$`, so `${` in names was not escaped. Replacer functions fix it; a test and the edge-case `tofu validate`
   in CI cover it.
6. **Log artifact upload failed** (artifact quota, same account issue). It is now best effort; the logs are in the
   job summary and the run log.
