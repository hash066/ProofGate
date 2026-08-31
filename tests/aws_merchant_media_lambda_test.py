import hashlib
import hmac
import json
import os
import pathlib
import sys
import types
import unittest
from unittest import mock


TEMPLATE = pathlib.Path(__file__).parents[1] / "infra" / "aws" / "cloudformation.yaml"
NOW = 1_788_000_000
AUTH_SECRET = "m" * 64


class FakeClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeSecretStore:
    def get_secret_value(self, **_kwargs):
        return {"SecretString": AUTH_SECRET}


class FakeS3:
    def __init__(self):
        self.presigns = []
        self.head = None
        self.deleted = []

    def generate_presigned_url(self, operation, **kwargs):
        self.presigns.append((operation, kwargs))
        return "https://private-bucket.s3.amazonaws.com/signed-object?X-Amz-Signature=fake"

    def head_object(self, **_kwargs):
        if self.head is None:
            raise FakeClientError("NotFound")
        return dict(self.head)

    def delete_object(self, **kwargs):
        self.deleted.append(kwargs)


class FakeTable:
    def __init__(self):
        self.items = {}
        self.simulate_finalize_race = False

    def get_item(self, Key, **_kwargs):
        item = self.items.get(Key["assetScope"])
        return {"Item": dict(item)} if item else {}

    def put_item(self, Item, **_kwargs):
        key = Item["assetScope"]
        if key in self.items:
            raise FakeClientError("ConditionalCheckFailedException")
        self.items[key] = dict(Item)
        return {}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues, **kwargs):
        item = self.items[Key["assetScope"]]
        if ":registered" in ExpressionAttributeValues:
            if self.simulate_finalize_race:
                self.simulate_finalize_race = False
                item["status"] = "registered"
                item["completedAt"] = ExpressionAttributeValues[":now"]
                item.pop("expiresTtl", None)
                raise FakeClientError("ConditionalCheckFailedException")
            if item["status"] != "issued" or item["capabilityId"] != ExpressionAttributeValues[":cap"]:
                raise FakeClientError("ConditionalCheckFailedException")
            item["status"] = "registered"
            item["completedAt"] = ExpressionAttributeValues[":now"]
            item.pop("expiresTtl", None)
        else:
            item["capabilityId"] = ExpressionAttributeValues[":cap"]
            item["expiresAt"] = ExpressionAttributeValues[":expiry"]
            item["expiresTtl"] = ExpressionAttributeValues[":ttl"]
        return {"Attributes": dict(item)} if kwargs.get("ReturnValues") == "ALL_NEW" else {}


def deployed_lambda_source():
    text = TEMPLATE.read_text(encoding="utf-8")
    resource = text[text.index("  MerchantMediaFunction:"):]
    body = resource[resource.index("        ZipFile: |\n") + len("        ZipFile: |\n"):]
    body = body[:body.index("  MerchantMediaIntegration:")]
    return "\n".join(line[10:] if line.startswith("          ") else line for line in body.splitlines())


def load_lambda():
    fake_s3 = FakeS3()
    fake_secret = FakeSecretStore()
    fake_table = FakeTable()
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda name: {"s3": fake_s3, "secretsmanager": fake_secret}[name]
    boto3.resource = lambda name: types.SimpleNamespace(Table=lambda _table_name: fake_table)
    botocore = types.ModuleType("botocore")
    exceptions = types.ModuleType("botocore.exceptions")
    exceptions.ClientError = FakeClientError
    namespace = {"__name__": "axcas_merchant_media_lambda"}
    with mock.patch.dict(sys.modules, {"boto3": boto3, "botocore": botocore, "botocore.exceptions": exceptions}), mock.patch.dict(
        os.environ,
        {"MEDIA_BUCKET": "private-bucket", "MEDIA_CAPABILITY_TABLE": "capabilities", "MEDIA_SECRET_ARN": "arn:secret"},
    ):
        exec(compile(deployed_lambda_source(), "MerchantMediaFunction", "exec"), namespace)
    namespace["time"].time = lambda: NOW
    return namespace, fake_s3, fake_table


def event(path, payload, *, timestamp=NOW, secret=AUTH_SECRET):
    body = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), str(timestamp).encode() + b"." + body, hashlib.sha256).hexdigest()
    return {
        "rawPath": path,
        "requestContext": {"http": {"method": "POST"}},
        "headers": {
            "x-axcas-media-timestamp": str(timestamp),
            "x-axcas-media-signature": "sha256=" + signature,
        },
        "body": body.decode(),
    }


def issue_payload(**changes):
    value = {
        "schemaVersion": 1,
        "merchantId": "merchant-demo",
        "assetId": "asset-photo-1",
        "sha256": "a1" * 32,
        "byteLength": 1024,
        "contentType": "image/jpeg",
        "sourceProviderMessageId": "wamid.demo",
    }
    value.update(changes)
    return value


class MerchantMediaLambdaTests(unittest.TestCase):
    def invoke(self, module, request):
        with mock.patch.dict(
            os.environ,
            {"MEDIA_BUCKET": "private-bucket", "MEDIA_CAPABILITY_TABLE": "capabilities", "MEDIA_SECRET_ARN": "arn:secret"},
        ):
            response = module["handler"](request, types.SimpleNamespace(aws_request_id="test-request"))
        return response["statusCode"], json.loads(response["body"])

    def test_signed_issue_binds_hash_size_type_and_server_encryption(self):
        module, s3, table = load_lambda()
        status, body = self.invoke(module, event("/merchant-media/capabilities", issue_payload()))
        self.assertEqual(status, 201)
        self.assertEqual(body["status"], "upload_ready")
        self.assertLessEqual(body["expiresInSeconds"], 300)
        self.assertNotIn("credential", json.dumps(body).lower())
        operation, options = s3.presigns[0]
        self.assertEqual(operation, "put_object")
        self.assertEqual(options["Params"]["ContentLength"], 1024)
        self.assertEqual(options["Params"]["ContentType"], "image/jpeg")
        self.assertEqual(options["Params"]["ServerSideEncryption"], "AES256")
        self.assertEqual(options["Params"]["Key"], "private/ingest/merchant-demo/asset-photo-1/" + "a1" * 32)
        self.assertEqual(table.items["merchant-demo:asset-photo-1"]["status"], "issued")

    def test_rejects_wrong_or_stale_worker_signature(self):
        module, _, table = load_lambda()
        wrong = event("/merchant-media/capabilities", issue_payload(), secret="x" * 64)
        stale = event("/merchant-media/capabilities", issue_payload(), timestamp=NOW - 301)
        self.assertEqual(self.invoke(module, wrong)[0], 401)
        self.assertEqual(self.invoke(module, stale)[0], 401)
        self.assertEqual(table.items, {})

    def test_asset_scope_is_immutable(self):
        module, _, _ = load_lambda()
        self.assertEqual(self.invoke(module, event("/merchant-media/capabilities", issue_payload()))[0], 201)
        changed = issue_payload(sha256="b2" * 32)
        status, body = self.invoke(module, event("/merchant-media/capabilities", changed))
        self.assertEqual(status, 409)
        self.assertEqual(body, {"error": "immutable_conflict"})

    def test_finalize_checks_s3_and_is_idempotent(self):
        module, s3, table = load_lambda()
        _, issued = self.invoke(module, event("/merchant-media/capabilities", issue_payload()))
        checksum = __import__("base64").b64encode(bytes.fromhex("a1" * 32)).decode()
        s3.head = {"ContentLength": 1024, "ContentType": "image/jpeg", "ChecksumSHA256": checksum, "ServerSideEncryption": "AES256"}
        final = {"schemaVersion": 1, "merchantId": "merchant-demo", "assetId": "asset-photo-1", "capabilityId": issued["capabilityId"]}
        status, registered = self.invoke(module, event("/merchant-media/finalize", final))
        self.assertEqual(status, 200)
        self.assertEqual(registered["status"], "registered")
        self.assertEqual(registered["storageBackend"], "s3")
        self.assertNotIn("expiresTtl", table.items["merchant-demo:asset-photo-1"])
        self.assertEqual(self.invoke(module, event("/merchant-media/finalize", final))[1], registered)

    def test_finalize_deletes_mismatched_upload_without_registration(self):
        module, s3, table = load_lambda()
        _, issued = self.invoke(module, event("/merchant-media/capabilities", issue_payload()))
        s3.head = {"ContentLength": 2048, "ContentType": "image/jpeg", "ChecksumSHA256": "wrong", "ServerSideEncryption": "AES256"}
        final = {"schemaVersion": 1, "merchantId": "merchant-demo", "assetId": "asset-photo-1", "capabilityId": issued["capabilityId"]}
        status, body = self.invoke(module, event("/merchant-media/finalize", final))
        self.assertEqual((status, body), (422, {"error": "upload_mismatch"}))
        self.assertEqual(len(s3.deleted), 1)
        self.assertEqual(table.items["merchant-demo:asset-photo-1"]["status"], "issued")

    def test_concurrent_finalize_returns_the_existing_registration(self):
        module, s3, table = load_lambda()
        _, issued = self.invoke(module, event("/merchant-media/capabilities", issue_payload()))
        checksum = __import__("base64").b64encode(bytes.fromhex("a1" * 32)).decode()
        s3.head = {"ContentLength": 1024, "ContentType": "image/jpeg", "ChecksumSHA256": checksum, "ServerSideEncryption": "AES256"}
        table.simulate_finalize_race = True
        final = {"schemaVersion": 1, "merchantId": "merchant-demo", "assetId": "asset-photo-1", "capabilityId": issued["capabilityId"]}
        status, body = self.invoke(module, event("/merchant-media/finalize", final))
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "registered")

    def test_finalize_cannot_cross_tenant_scope(self):
        module, _, _ = load_lambda()
        _, issued = self.invoke(module, event("/merchant-media/capabilities", issue_payload()))
        final = {"schemaVersion": 1, "merchantId": "merchant-other", "assetId": "asset-photo-1", "capabilityId": issued["capabilityId"]}
        self.assertEqual(self.invoke(module, event("/merchant-media/finalize", final))[0], 404)

    def test_rejects_unsupported_or_oversized_media(self):
        module, _, _ = load_lambda()
        unsupported = issue_payload(contentType="text/html")
        oversized = issue_payload(byteLength=20 * 1024 * 1024 + 1)
        self.assertEqual(self.invoke(module, event("/merchant-media/capabilities", unsupported))[0], 400)
        self.assertEqual(self.invoke(module, event("/merchant-media/capabilities", oversized))[0], 400)


if __name__ == "__main__":
    unittest.main()
