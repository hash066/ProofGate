import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("AWS merchant-media upload boundary", () => {
  it("keeps browser uploads private and constrained to the Axcas origin", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");

    expect(template).toContain("StudioOrigin:");
    expect(template).toContain("CorsConfiguration:");
    expect(template).toContain("AllowedMethods: [PUT]");
    expect(template).toContain("AllowedOrigins: [!Ref StudioOrigin]");
    expect(template).toContain("AllowedHeaders: [content-type, x-amz-checksum-sha256, x-amz-server-side-encryption]");
    expect(template).toContain("BlockPublicAcls: true");
    expect(template).toContain("RestrictPublicBuckets: true");
  });

  it("issues and finalizes capabilities through an authenticated AWS service", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");
    const deploy = await readFile("infra/aws/deploy.ps1", "utf8");

    expect(template).toContain("MerchantMediaCapabilitySecret:");
    expect(template).toContain("MerchantMediaCapabilityTable:");
    expect(template).toContain("PointInTimeRecoveryEnabled: true");
    expect(template).toContain("MerchantMediaFunction:");
    expect(template).toContain("POST /merchant-media/capabilities");
    expect(template).toContain("POST /merchant-media/finalize");
    expect(template).toContain("x-axcas-media-signature");
    expect(template).toContain("x-axcas-media-timestamp");
    expect(template).toContain("generate_presigned_url");
    expect(template).toContain("ChecksumSHA256");
    expect(template).toContain("ContentLength");
    expect(template).toContain("ServerSideEncryption");
    expect(template).toContain("expiresInSeconds");
    expect(deploy).toContain("ParameterKey=StudioOrigin");
    expect(deploy).toContain("OutputKey=='MerchantMediaCapabilitySecretArn'");
    expect(deploy).toContain("MerchantMediaCapabilitySecretArn = $merchantMediaSecretArn");
  });

  it("uses a deterministic private key and conditionally registers one immutable asset scope", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");

    expect(template).toContain('object_key = f"private/ingest/{merchant_id}/{asset_id}/{digest}"');
    expect(template).toContain("ConditionExpression");
    expect(template).toContain("immutable_conflict");
    expect(template).toContain("ChecksumMode='ENABLED'");
    expect(template).toContain("delete_object");
    expect(template).toContain('"storageBackend": "s3"');
    expect(template).toContain('"status": "registered"');
  });

  it("grants the upload service only scoped ingest-object and capability-table access", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");
    const policy = template.slice(
      template.indexOf("PolicyName: AxcasMerchantMediaUploadFacade"),
      template.indexOf("MerchantMediaFunction:", template.indexOf("PolicyName: AxcasMerchantMediaUploadFacade")),
    );

    expect(template).toContain("PolicyName: AxcasMerchantMediaUploadFacade");
    expect(template).toContain("- !Sub '${MerchantMediaBucket.Arn}/private/ingest/*'");
    expect(policy).not.toMatch(/Resource: ['"]?\*['"]?/);
    expect(template).toContain("MerchantMediaCapabilitySecretArn:");
  });
});
