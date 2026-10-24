"""Neon Object Storage service — S3-compatible file storage."""

from __future__ import annotations

import os
from io import BytesIO

import boto3


def _get_client():
    """Create an S3 client pointed at Neon Object Storage."""
    return boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION"),
        endpoint_url=os.getenv("AWS_ENDPOINT_URL_S3"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        config=boto3.session.Config(s3={"addressing_style": "path"}),
    )


def upload_file(bucket: str, key: str, data: bytes, content_type: str = "application/pdf") -> str:
    """Upload a file to Neon Object Storage. Returns the object key."""
    client = _get_client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=BytesIO(data),
        ContentType=content_type,
    )
    return key


def get_presigned_url(bucket: str, key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL for downloading a file."""
    client = _get_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )
