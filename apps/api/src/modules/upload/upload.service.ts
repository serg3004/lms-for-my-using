import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListMultipartUploadsCommand, ListObjectsV2Command, PutObjectCommand, S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

export type UploadResult = {
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type CompletedPart = { partNumber: number; etag: string };

@Injectable()
export class UploadService {
  private readonly s3: S3Client | null;
  private readonly downloadS3: S3Client | null;
  private readonly bucket: string | undefined;

  constructor() {
    const endpoint = process.env['S3_ENDPOINT'];
    const bucket = process.env['S3_BUCKET'];
    const accessKeyId = process.env['S3_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['S3_SECRET_ACCESS_KEY'];
    const region = process.env['S3_REGION'] ?? 'auto';
    const forcePathStyle = process.env['S3_FORCE_PATH_STYLE'] === 'true';

    if (endpoint && bucket && accessKeyId && secretAccessKey) {
      const clientOptions = {
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle,
      };
      this.s3 = new S3Client({ endpoint, ...clientOptions });
      this.downloadS3 = new S3Client({
        endpoint: process.env['S3_FILE_ORIGIN'] ?? endpoint,
        ...clientOptions,
        // Preserve the dedicated origin hostname instead of rewriting it to bucket.origin.
        forcePathStyle: process.env['S3_FILE_ORIGIN'] ? true : forcePathStyle,
      });
      this.bucket = bucket;
    } else {
      this.s3 = null;
      this.downloadS3 = null;
    }
  }

  isConfigured(): boolean {
    return this.s3 !== null;
  }

  async checkReadiness(): Promise<'ok' | 'disabled'> {
    if (!this.s3 || !this.bucket) return 'disabled';
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return 'ok';
  }

  async uploadMaterialFile(
    file: Express.Multer.File,
    organizationId: string,
    materialId: string,
  ): Promise<UploadResult> {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const key = this.createQuarantineObjectKey(organizationId, materialId);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    return {
      objectKey: key,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  createMaterialObjectKey(organizationId: string, materialId: string): string {
    return `organizations/${organizationId}/materials/${materialId}/${randomUUID()}`;
  }

  async uploadChecklistItemPhoto(
    file: Express.Multer.File,
    organizationId: string,
    instanceId: string,
    itemId: string,
  ): Promise<UploadResult> {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const key = `organizations/${organizationId}/checklist-photos/${instanceId}/${itemId}/${randomUUID()}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    return {
      objectKey: key,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  async uploadOrganizationLogo(file: Express.Multer.File, organizationId: string): Promise<string> {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const key = `organizations/${organizationId}/branding/${randomUUID()}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    return key;
  }

  /** Presigned GET URL for inline display (e.g. <img src>) — sets the real content type, no attachment disposition. */
  async getInlinePresignedUrl(key: string, mimeType: string, expiresIn = 300): Promise<string> {
    if (!this.downloadS3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const safeTtl = Math.min(Math.max(expiresIn, 1), 300);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: mimeType,
    });
    return getSignedUrl(this.downloadS3, command, { expiresIn: safeTtl });
  }

  createQuarantineObjectKey(organizationId: string, materialId: string): string {
    return `quarantine/organizations/${organizationId}/materials/${materialId}/${randomUUID()}`;
  }

  async createMultipartUpload(key: string, mimeType: string): Promise<string> {
    const { s3, bucket } = this.requireStorage();
    const result = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: mimeType }));
    if (!result.UploadId) throw new ServiceUnavailableException('Storage did not return a multipart upload ID');
    return result.UploadId;
  }

  async getMultipartPartUrl(key: string, uploadId: string, partNumber: number, expiresIn = 900): Promise<string> {
    const { s3, bucket } = this.requireStorage();
    const command = new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
    return getSignedUrl(s3, command, { expiresIn: Math.min(Math.max(expiresIn, 1), 900) });
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<number> {
    const { s3, bucket } = this.requireStorage();
    try {
      await s3.send(new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map(({ partNumber, etag }) => ({ PartNumber: partNumber, ETag: etag })) },
      }));
    } catch (error) {
      // A previous completion may have reached S3 before the API response/DB update
      // failed. HeadObject makes that retry idempotent; otherwise preserve the S3 error.
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        throw error;
      }
    }
    const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return object.ContentLength ?? -1;
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const { s3, bucket } = this.requireStorage();
    await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
  }

  async listMultipartUploads(prefix = 'quarantine/organizations/') {
    const { s3, bucket } = this.requireStorage();
    const uploads: Array<{ key: string; uploadId: string; initiatedAt: Date }> = [];
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;
    do {
      const page = await s3.send(new ListMultipartUploadsCommand({ Bucket: bucket, Prefix: prefix, KeyMarker: keyMarker, UploadIdMarker: uploadIdMarker }));
      for (const upload of page.Uploads ?? []) {
        if (upload.Key && upload.UploadId && upload.Initiated) uploads.push({ key: upload.Key, uploadId: upload.UploadId, initiatedAt: upload.Initiated });
      }
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
    } while (keyMarker);
    return uploads;
  }

  private requireStorage(): { s3: S3Client; bucket: string } {
    if (!this.s3 || !this.bucket) throw new ServiceUnavailableException('File storage is not configured');
    return { s3: this.s3, bucket: this.bucket };
  }

  async promoteQuarantinedObject(quarantineKey: string, organizationId: string, materialId: string): Promise<string> {
    if (!this.s3 || !this.bucket) throw new ServiceUnavailableException('File storage is not configured');
    const objectKey = this.createMaterialObjectKey(organizationId, materialId);
    await this.s3.send(new CopyObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      CopySource: `${this.bucket}/${encodeURIComponent(quarantineKey).replace(/%2F/g, '/')}`,
    }));
    await this.deleteObject(quarantineKey);
    return objectKey;
  }

  async getPresignedUrl(key: string, fileName: string, expiresIn: number): Promise<string> {
    if (!this.downloadS3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const safeTtl = Math.min(Math.max(expiresIn, 1), 300);
    const fallbackName = fileName.replace(/[\r\n"\\]/g, '_') || 'download';
    const encodedName = encodeURIComponent(fileName || 'download').replace(/['()*]/g, (value) =>
      `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
      ResponseContentType: 'application/octet-stream',
    });
    return getSignedUrl(this.downloadS3, command, { expiresIn: safeTtl });
  }

  async listObjects(prefix: string): Promise<Array<{ key: string; lastModified: Date }>> {
    if (!this.s3 || !this.bucket) throw new ServiceUnavailableException('File storage is not configured');
    const objects: Array<{ key: string; lastModified: Date }> = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.s3.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      for (const object of page.Contents ?? []) {
        if (object.Key && object.LastModified) objects.push({ key: object.Key, lastModified: object.LastModified });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
