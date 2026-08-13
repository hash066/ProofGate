param(
  [string]$Region = "ap-south-1",
  [string]$StackName = "proofgate-foundation",
  [Parameter(Mandatory = $true)][string]$RepositoryCommit,
  [string]$RepositoryUrl = "https://github.com/hash066/ProofGate.git"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($RepositoryCommit -notmatch '^[a-f0-9]{40}$') {
  throw "RepositoryCommit must be a full 40-character SHA."
}
if ($RepositoryUrl -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$') {
  throw "RepositoryUrl must be an explicit HTTPS GitHub repository."
}
if ($Region -notmatch '^[a-z]{2}-[a-z]+-\d$' -or $StackName -notmatch '^[A-Za-z][A-Za-z0-9-]{2,127}$') {
  throw "Region or StackName is invalid."
}
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "AWS CLI v2 is required."
}

$template = (Resolve-Path (Join-Path $PSScriptRoot "cloudformation.yaml")).Path

aws sts get-caller-identity --region $Region --output json
if ($LASTEXITCODE -ne 0) { throw "AWS identity check failed." }

aws cloudformation validate-template --template-body "file://$template" --region $Region | Out-Null
if ($LASTEXITCODE -ne 0) { throw "CloudFormation validation failed." }

aws cloudformation deploy `
  --stack-name $StackName `
  --template-file $template `
  --capabilities CAPABILITY_IAM `
  --region $Region `
  --no-fail-on-empty-changeset
if ($LASTEXITCODE -ne 0) { throw "CloudFormation deployment failed." }

$instanceId = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text
$bucket = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='RecordingsBucketName'].OutputValue" --output text
if ($LASTEXITCODE -ne 0 -or $instanceId -notmatch '^i-[a-f0-9]+$' -or [string]::IsNullOrWhiteSpace($bucket)) {
  throw "Stack outputs are incomplete."
}

$registered = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $ping = aws ssm describe-instance-information --region $Region --filters "Key=InstanceIds,Values=$instanceId" --query "InstanceInformationList[0].PingStatus" --output text 2>$null
  if ($LASTEXITCODE -eq 0 -and $ping -eq "Online") { $registered = $true; break }
  Start-Sleep -Seconds 10
}
if (-not $registered) { throw "Instance did not register with Systems Manager." }

$repositoryPath = ($RepositoryUrl -replace '^https://github.com/', '') -replace '\.git$', ''
$installerUrl = "https://raw.githubusercontent.com/$repositoryPath/$RepositoryCommit/infra/aws/install-runtime.sh"
$commands = @(
  "set -eu",
  "curl -fsSL '$installerUrl' -o /tmp/proofgate-install-runtime.sh",
  "chmod 0700 /tmp/proofgate-install-runtime.sh",
  "sudo /tmp/proofgate-install-runtime.sh '$RepositoryUrl' '$RepositoryCommit'"
)
$parameters = @{ commands = $commands } | ConvertTo-Json -Compress
$commandId = aws ssm send-command --region $Region --instance-ids $instanceId --document-name AWS-RunShellScript --parameters $parameters --query "Command.CommandId" --output text
if ($LASTEXITCODE -ne 0 -or $commandId -notmatch '^[a-f0-9-]{36}$') { throw "Runtime installation dispatch failed." }

aws ssm wait command-executed --region $Region --command-id $commandId --instance-id $instanceId
if ($LASTEXITCODE -ne 0) { throw "Runtime installation failed or timed out." }
$status = aws ssm get-command-invocation --region $Region --command-id $commandId --instance-id $instanceId --query "Status" --output text
if ($LASTEXITCODE -ne 0 -or $status -ne "Success") { throw "Runtime installation did not succeed." }

[pscustomobject]@{
  StackName = $StackName
  Region = $Region
  InstanceId = $instanceId
  RecordingsBucket = $bucket
  RepositoryCommit = $RepositoryCommit
  RuntimeInstalled = $true
}
