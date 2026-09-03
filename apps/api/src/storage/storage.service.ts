import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.bucket = config.get("MINIO_BUCKET", "registro-arquivos");
    this.client = new S3Client({
      endpoint: config.get("MINIO_ENDPOINT", "http://localhost:9000"),
      region: config.get("MINIO_REGION", "us-east-1"),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get("MINIO_ROOT_USER", "minioadmin"),
        secretAccessKey: config.get("MINIO_ROOT_PASSWORD", "minioadmin123"),
      },
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async uploadRecordPhoto(userId: string, file: Express.Multer.File) {
    const extension =
      file.originalname
        .split(".")
        .pop()
        ?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const key = `records/${userId}/${randomUUID()}.${extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return key;
  }
}
