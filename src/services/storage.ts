import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * DocumentStorageService (§39).
 *
 * Business logic never learns where bytes actually live. The local driver keeps
 * files on disk for zero-setup development, the S3 driver targets MinIO or AWS,
 * and an Azure Blob driver can be added here without touching a caller.
 *
 * Two invariants hold for every driver:
 *  - Storage keys are opaque and are never rendered into a page or a URL.
 *  - Content is addressed through this service, which the caller may only reach
 *    after an authorization check.
 */
export interface StoredObject {
  storageKey: string;
  checksum: string;
  sizeBytes: number;
}

export interface DocumentStorageService {
  readonly driver: string;
  put(input: { body: Buffer; fileName: string; mimeType: string }): Promise<StoredObject>;
  get(storageKey: string): Promise<Buffer>;
  /**
   * A short-lived URL for direct download. The local driver has no such concept
   * and returns null, so callers must always be able to stream through the app.
   */
  signedDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string | null>;
}

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Keys are random, not derived from the file name: a provider-supplied name must
 * never influence a storage path, and a key must never hint at its contents.
 */
function newStorageKey(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase().slice(0, 10);
  const now = new Date();
  const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${prefix}/${randomUUID()}${extension}`;
}

class LocalFileStorage implements DocumentStorageService {
  readonly driver = "local";

  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(process.cwd(), root);
  }

  private resolve(storageKey: string): string {
    const target = path.resolve(this.root, storageKey);
    // Defence in depth: a key must never escape the storage root.
    if (!target.startsWith(this.root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  async put(input: { body: Buffer; fileName: string; mimeType: string }): Promise<StoredObject> {
    const storageKey = newStorageKey(input.fileName);
    const target = this.resolve(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.body);
    return { storageKey, checksum: sha256(input.body), sizeBytes: input.body.byteLength };
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(this.resolve(storageKey));
  }

  async signedDownloadUrl(): Promise<string | null> {
    // No presigning on the filesystem; downloads stream through the route
    // handler, which re-checks authorization.
    return null;
  }
}

class S3Storage implements DocumentStorageService {
  readonly driver = "s3";

  async put(input: { body: Buffer; fileName: string; mimeType: string }): Promise<StoredObject> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const storageKey = newStorageKey(input.fileName);

    await client.send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: storageKey,
        Body: input.body,
        ContentType: input.mimeType,
        // Server-side encryption at rest; Azure Blob uses platform-managed keys
        // or a Key Vault CMK in the production topology.
        ServerSideEncryption: "AES256",
      }),
    );

    return { storageKey, checksum: sha256(input.body), sizeBytes: input.body.byteLength };
  }

  async get(storageKey: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const result = await client.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: storageKey }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error("Stored object is empty");
    return Buffer.from(bytes);
  }

  async signedDownloadUrl(storageKey: string, expiresInSeconds = 120): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.client();

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: env.s3.bucket, Key: storageKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint,
      forcePathStyle: env.s3.forcePathStyle,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    });
  }
}

let instance: DocumentStorageService | undefined;

export function documentStorage(): DocumentStorageService {
  if (!instance) {
    instance = env.storageDriver === "s3" ? new S3Storage() : new LocalFileStorage(env.storageLocalPath);
  }
  return instance;
}
