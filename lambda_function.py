import json
import os
import time
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")

SOURCE_BUCKET = os.environ["SOURCE_BUCKET"]
DESTINATION_BUCKET = os.environ["DESTINATION_BUCKET"]
RESULTS_PREFIX = os.environ.get("RESULTS_PREFIX", "results/")
REPLICATION_WAIT_SECONDS = int(os.environ.get("REPLICATION_WAIT_SECONDS", "20"))
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "2"))


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    # Browser CORS preflight.
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(204, {})

    try:
        body = event.get("body") or "{}"
        if isinstance(body, str):
            body = json.loads(body)

        action = body.get("action", "replication_test")
        if action != "replication_test":
            return response(400, {
                "success": False,
                "message": "Unsupported action"
            })

        test_number = body.get("test_number", "manual")
        test_id = uuid.uuid4().hex[:12]
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        test_key = f"replication-tests/test-{timestamp}-{test_id}.json"

        test_document = {
            "project": "Disaster Replication Confirmator",
            "test_id": test_id,
            "test_number": test_number,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_bucket": SOURCE_BUCKET,
            "destination_bucket": DESTINATION_BUCKET,
            "confirmation_marker": test_id,
        }

        # 1. Write a unique test object to the S3 source bucket.
        s3.put_object(
            Bucket=SOURCE_BUCKET,
            Key=test_key,
            Body=json.dumps(test_document, indent=2).encode("utf-8"),
            ContentType="application/json",
        )

        # 2. Wait for S3 Cross-Region Replication to place the same object
        #    in the destination bucket.
        deadline = time.time() + REPLICATION_WAIT_SECONDS
        replicated = False
        destination_etag = None

        while time.time() < deadline:
            try:
                head = s3.head_object(
                    Bucket=DESTINATION_BUCKET,
                    Key=test_key
                )
                replicated = True
                destination_etag = head.get("ETag")
                break
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code")
                if code not in ("404", "NoSuchKey", "NotFound"):
                    raise
                time.sleep(POLL_INTERVAL_SECONDS)

        result = {
            "project": "Disaster Replication Confirmator",
            "success": replicated,
            "message": (
                "Test object confirmed in destination bucket"
                if replicated
                else "Replication was not confirmed within the wait window"
            ),
            "test_id": test_id,
            "test_key": test_key,
            "source_bucket": SOURCE_BUCKET,
            "destination_bucket": DESTINATION_BUCKET,
            "replicated": replicated,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "destination_etag": destination_etag,
        }

        # 3. Save the confirmation report to S3.
        result_key = f"{RESULTS_PREFIX.rstrip('/')}/{test_id}.json"
        s3.put_object(
            Bucket=SOURCE_BUCKET,
            Key=result_key,
            Body=json.dumps(result, indent=2).encode("utf-8"),
            ContentType="application/json",
        )

        return response(200 if replicated else 409, result)

    except Exception as exc:
        return response(500, {
            "success": False,
            "message": str(exc),
            "project": "Disaster Replication Confirmator"
        })
