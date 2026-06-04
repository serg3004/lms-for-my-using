import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

export type UploadResult = {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class UploadService {
  private readonly s3: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly publicUrl: string | undefined;

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
      this.publicUrl = process.env['S3_PUBLIC_URL'];
    } else {
      this.s3 = null;
    }
  }

  isConfigured(): boolean {
    return this.s3 !== null;
  }

  async uploadFile(file: Express.Multer.File, folder = 'uploads'): Promise<UploadResult> {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const ext = extname(file.originalname).toLowerCase();
    const key = `${folder}/${Date.now()}-${randomUUID()}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    const fileUrl = this.publicUrl
      ? `${this.publicUrl.replace(/\/$/, '')}/${key}`
      : await this.getPresignedUrl(key);

    return {
      fileUrl,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }
}
