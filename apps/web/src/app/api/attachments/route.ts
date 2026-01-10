import {
  getPresignedUrl as tigrisGetPresignedUrl,
  put as tigrisPut,
  remove as tigrisRemove,
} from "@tigrisdata/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@weldr/auth";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";

const BUCKET_NAME = process.env.GENERAL_BUCKET;

const attachmentSchema = z.object({
  chatId: z.string().min(1, { message: "Chat ID is required" }),
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine((file) => ["image/jpeg", "image/png", "application/pdf"].includes(file.type), {
      message: "File type should be JPEG, PNG, or PDF",
    }),
});

const tigrisConfig = {
  // oxlint-disable-next-line no-non-null-assertion
  accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID!,
  // oxlint-disable-next-line no-non-null-assertion
  secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY!,
  bucket: BUCKET_NAME,
};

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;
    const chatId = formData.get("chatId") as string;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedAttachment = attachmentSchema.safeParse({
      file,
      chatId,
    });

    if (!validatedAttachment.success) {
      const errorMessage = validatedAttachment.error.issues
        .map((issue) => issue.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const filename = (formData.get("file") as File).name;

    try {
      const attachmentId = nanoid();

      const key = `attachments/${validatedAttachment.data.chatId}/${attachmentId}.${file.type.split("/")[1]}`;

      const uploadResponse = await tigrisPut(key, file, {
        contentType: file.type,
        multipart: true,
        onUploadProgress: ({ loaded, total, percentage }) => {
          Logger.info("Upload progress", {
            loaded,
            total,
            percentage,
            chatId: validatedAttachment.data.chatId,
          });
        },
        config: tigrisConfig,
      });

      if (uploadResponse.error) {
        Logger.error("Upload error", {
          error: uploadResponse.error,
          chatId: validatedAttachment.data.chatId,
        });
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }

      const presignedUrlResponse = await tigrisGetPresignedUrl(key, {
        operation: "get",
        expiresIn: 3600,
        config: tigrisConfig,
      });

      if (presignedUrlResponse.error) {
        Logger.error("Get presigned URL error", {
          error: presignedUrlResponse.error,
          key,
        });
        return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
      }

      return NextResponse.json({
        id: attachmentId,
        name: filename,
        key,
        contentType: file.type,
        size: file.size,
        url: presignedUrlResponse.data?.url,
      });
    } catch {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

const deleteAttachmentSchema = z.object({
  filename: z.string(),
});

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validated = deleteAttachmentSchema.safeParse(await request.json());

  if (!validated.success) {
    return NextResponse.json({ error: "Filename is required" }, { status: 400 });
  }

  try {
    const deleteResponse = await tigrisRemove(validated.data.filename, {
      config: tigrisConfig,
    });

    if (deleteResponse?.error) {
      Logger.error("Error deleting file", {
        error: deleteResponse.error,
        filename: validated.data.filename,
      });
      return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
    }

    return NextResponse.json({ message: "File deleted successfully" });
  } catch (error) {
    Logger.error("Error deleting file", { error });
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
