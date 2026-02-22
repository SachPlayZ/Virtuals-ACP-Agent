import {
    S3Client,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("assetUploader");

let s3Client: S3Client | null = null;

function getClient(): S3Client {
    if (!s3Client) {
        s3Client = new S3Client({
            region: process.env.AWS_REGION || "us-east-1",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
            },
        });
    }
    return s3Client;
}

/**
 * Upload a buffer to AWS S3.
 * Returns the public URL of the uploaded file.
 */
export async function uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string
): Promise<string> {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
        log.warn("S3_BUCKET not configured, returning placeholder URL");
        return `https://placeholder.s3.amazonaws.com/${key}`;
    }

    const client = getClient();

    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        })
    );

    const publicUrl = process.env.S3_PUBLIC_URL
        ? `${process.env.S3_PUBLIC_URL}/${key}`
        : `https://${bucket}.s3.amazonaws.com/${key}`;

    log.info({ key, contentType, size: buffer.length }, "Asset uploaded to S3");
    return publicUrl;
}
