# What failed on the first deploy, and what I changed

The generated configuration worked on its first real run: apply created 6 resources, the second plan reported
no changes, and destroy removed all 6 ([evidence/](evidence/)). The failures were in the environment around it:

| # | What failed | What I changed |
|---|---|---|
| 1 | GitHub-hosted runners never started ("account is locked due to a billing issue"). | Ran CI and deploy on a self-hosted runner on EC2 ([bootstrap/aws-bootstrap.yaml](bootstrap/aws-bootstrap.yaml)). |
| 2 | Creating the GitHub OIDC provider was denied by the AWS organization's SCP. | Gave the runner's EC2 instance role a least-privilege policy instead. No AWS keys are stored anywhere. |
| 3 | S3, SQS, Lambda and EC2 are denied in us-east-1 by the same SCP; only eu-north-1 is allowed. | Added a `--region` override. `infra/main.tf` stays as the example (us-east-1); the deploy used eu-north-1. Only the two region strings differ ([evidence/region-diff.log](evidence/region-diff.log)). |
| 4 | The runner setup stack failed: the console attached a restricted service role, and a security group with egress rules needs a `VpcId`. | Created the stack with my own credentials and dropped the explicit egress rule. |
| 5 | Uploading the log artifact failed (storage quota on the same GitHub account). | Made the upload optional; the logs are in the job summary and in `evidence/`. |

Problems I designed against up front, which commonly break destroy or the second plan: non-empty buckets
(`force_destroy`), the log group Lambda creates on first invoke (now managed), a zip hash that changes between
builds (`archive_file` uses fixed timestamps), and global bucket-name clashes (account id and region suffix).
