import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

export type UploadResult = {
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class UploadService {
  private readonly s3: S3Client | null;
  private readonly bucket: string | undefined;

  constructor() {
    const endpoint = process.env['S3_ENDPOINT'];
    const bucket = process.env['S3_BUCKET'];
    const accessKeyId = process.env['S3_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['S3_SECRET_ACCESS_KEY'];
    const region = process.env['S3_REGION'] ?? 'auto';
    const forcePathStyle = process.env['S3_FORCE_PATH_STYLE'] === 'true';

    if (endpoint && bucket && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle,
      });
      this.bucket = bucket;
    } else {
      this.s3 = null;
    }
  }

  isConfigured(): boolean {
    return this.s3 !== null;
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

  createQuarantineObjectKey(organizationId: string, materialId: string): string {
    return `quarantine/organizations/${organizationId}/materials/${materialId}/${randomUUID()}`;
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

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
