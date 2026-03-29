import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../storage/s3";
import { createPresignedUploadUrl } from "../storage/s3";

const S3_BUCKET = process.env.S3_BUCKET ?? "kaartje-postcards";

export async function handlePresign(req: Request): Promise<Response> {
  const body = await req.json();
  const { filename, contentType } = body as {
    filename: string;
    contentType: string;
  };

  if (!filename || !contentType) {
    return Response.json({ error: "filename and contentType are required" }, { status: 400 });
  }

  const ext = filename.split(".").pop() ?? "jpg";
  const key = `postcards/${crypto.randomUUID()}.${ext}`;
  const url = await createPresignedUploadUrl(key, contentType);

  return Response.json({ url, key });
}

/** Direct upload endpoint — receives image, converts to AVIF, stores in S3 */
export async function handleUpload(req: Request): Promise<Response> {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Convert to AVIF
  const avifBuffer = await sharp(inputBuffer)
    .resize(800, 534, { fit: "cover" })
    .avif({ quality: 65 })
    .toBuffer();

  const key = `postcards/${crypto.randomUUID()}.avif`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: avifBuffer,
      ContentType: "image/avif",
    }),
  );

  return Response.json({ key }, { status: 201 });
}
