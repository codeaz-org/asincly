import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION ?? "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

if (!endpoint || !accessKeyId || !secretAccessKey) {
  // Lazy: don't throw at import time so pages that never touch S3
  // (e.g. onboarding, sign-in) still render before creds are set.
}

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (cachedClient) return cachedClient;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 credentials are not fully configured");
  }
  cachedClient = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle,
  });
  return cachedClient;
}

export function bucketName(): string {
  const b = process.env.S3_BUCKET_RECORDINGS;
  if (!b) throw new Error("S3_BUCKET_RECORDINGS is not set");
  return b;
}

let bucketChecked = false;

// Idempotent — first caller creates the bucket on MinIO if it doesn't exist.
// ponytail: safe on R2/S3 because CreateBucket errors on existing buckets,
// which we swallow. For prod, provision the bucket via terraform instead.
export async function ensureBucket(): Promise<void> {
  if (bucketChecked) return;
  const c = client();
  const Bucket = bucketName();
  try {
    await c.send(new HeadBucketCommand({ Bucket }));
    bucketChecked = true;
    return;
  } catch {
    // fall through to create
  }
  try {
    await c.send(new CreateBucketCommand({ Bucket }));
  } catch (e) {
    // If somebody else created it in the race, HeadBucket next call will succeed.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/i.test(msg)) throw e;
  }
  bucketChecked = true;
}

export async function presignedPutUrl(
  key: string,
  contentType: string,
  expiresSec = 60 * 10,
): Promise<string> {
  await ensureBucket();
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresSec },
  );
}

export async function presignedGetUrl(
  key: string,
  expiresSec = 60 * 60,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucketName(), Key: key }),
    { expiresIn: expiresSec },
  );
}

// Batch delete (S3 caps one request at 1000 keys). Missing keys are not an
// error, so retrying a half-finished delete is safe.
export async function deleteObjects(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const res = await client().send(
      new DeleteObjectsCommand({
        Bucket: bucketName(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (res.Errors?.length) throw new Error(`Failed to delete ${res.Errors.length} object(s)`);
  }
}

export async function* listObjects(prefix: string): AsyncGenerator<{ key: string; lastModified: Date | undefined }> {
  let ContinuationToken: string | undefined;
  do {
    const page = await client().send(
      new ListObjectsV2Command({ Bucket: bucketName(), Prefix: prefix, ContinuationToken }),
    );
    for (const o of page.Contents ?? []) if (o.Key) yield { key: o.Key, lastModified: o.LastModified };
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
}
