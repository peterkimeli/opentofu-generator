# Deployment notes

The generated `main.tf` itself deployed on the first real run: apply created 6 resources, the second plan showed
no changes and destroy removed everything ([evidence/](evidence/)). Most of my problems were with the accounts I
was deploying from, not the config.

GitHub Actions wouldn't run at all. Every job failed straight away with "account is locked due to a billing
issue". I couldn't get that resolved before the deadline, so I set up a self-hosted runner on a small EC2
instance ([bootstrap/aws-bootstrap.yaml](bootstrap/aws-bootstrap.yaml)) and pointed both workflows at it.

I wanted GitHub to log in to AWS with OIDC, but my AWS account is part of an organization whose SCP blocks
creating the OIDC provider. I gave the runner's instance role a tight policy instead, so there are still no AWS
keys stored in GitHub.

The same SCP only allows S3, SQS, Lambda and EC2 in eu-north-1, so I couldn't deploy to us-east-1 as in the
example. I added a `--region` flag: `infra/main.tf` is still generated from the example unchanged, the deploy used
eu-north-1, and the only difference is the two region strings
([evidence/region-diff.log](evidence/region-diff.log)).

Smaller things: my first runner stack failed on a security group setting, and the log artifact upload hit a
storage quota, so I made that step optional.

Some things I handled up front because they usually break destroy or the second plan: `force_destroy` on the
bucket, managing the Lambda log group myself, and a Lambda zip that builds identically every time.
