#!/bin/bash
# Runs inside LocalStack when ready. Creates default S3 bucket and SNS topic.
set -e
echo "Creating S3 bucket and SNS topic in LocalStack..."
awslocal s3 mb s3://onedelivery-bucket --region us-east-1 || true
awslocal sns create-topic --name onedelivery-events --region us-east-1 || true
echo "LocalStack init done."
