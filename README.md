# Disaster Replication Confirmator

AWS deployment using only:
- Amazon S3
- AWS Lambda
- AWS Lambda Function URL

## Architecture

Browser/S3 static website -> Lambda Function URL -> S3 source bucket -> S3 Cross-Region Replication -> S3 destination bucket.

Lambda creates a unique test object in the source bucket and checks whether the same key appears in the destination bucket. It then writes a JSON confirmation report to the source bucket under `results/`.

## 1. Create two S3 buckets

Create:
- one source bucket
- one destination bucket in another AWS Region

Enable S3 Versioning on BOTH buckets.

Configure S3 Cross-Region Replication from source to destination. The replication rule should cover the `replication-tests/` prefix.

The replication configuration requires an IAM role for Amazon S3. This is an S3 configuration, not another application service.

## 2. Deploy Lambda

Create a Lambda function using Python.

Upload `lambda_function.py` as the function code.

Set environment variables:

SOURCE_BUCKET=your-source-bucket
DESTINATION_BUCKET=your-destination-bucket
RESULTS_PREFIX=results/
REPLICATION_WAIT_SECONDS=20
POLL_INTERVAL_SECONDS=2

Set the Lambda timeout to at least 30 seconds.

## 3. Lambda IAM permissions

The Lambda execution role needs S3 permissions to:
- PutObject to the source bucket
- HeadObject on the destination bucket
- PutObject to the source bucket results prefix

For a student/demo project, you can start with the minimum resource-specific policy and restrict it to your two bucket ARNs.

Example permissions:
- s3:PutObject on arn:aws:s3:::SOURCE_BUCKET/replication-tests/*
- s3:PutObject on arn:aws:s3:::SOURCE_BUCKET/results/*
- s3:HeadObject is normally evaluated as s3:GetObject on the destination object path
- s3:GetObject on arn:aws:s3:::DESTINATION_BUCKET/replication-tests/*

## 4. Create Lambda Function URL

Create a Function URL for the Lambda.

For a browser demo without API Gateway:
- Auth type: NONE
- Enable CORS
- Allow origin: your S3 website origin (or * for a classroom/demo setup)
- Allow methods: POST, OPTIONS
- Allow headers: content-type

Copy the Function URL.

## 5. Connect the website

Open `script.js`.

Replace:

PASTE_YOUR_LAMBDA_FUNCTION_URL_HERE

with your Lambda Function URL.

Then upload `index.html`, `style.css`, and `script.js` to your S3 website bucket.

## 6. Test

Open the S3-hosted website and press:
RUN REPLICATION TEST

Expected flow:
1. Browser calls Lambda.
2. Lambda creates a unique test object in the source bucket.
3. S3 replication copies the object.
4. Lambda checks the destination bucket.
5. Lambda writes a confirmation JSON report.
6. Dashboard displays SUCCESS or FAILED.

## Important

S3 Cross-Region Replication is asynchronous. A 20-second check can report FAILED even though the object replicates later. For a classroom demonstration, increase `REPLICATION_WAIT_SECONDS` if needed.

This project intentionally does not use API Gateway, DynamoDB, EC2, RDS, or AWS IoT.
