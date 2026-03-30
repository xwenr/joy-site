import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import type { ContentEntry, ArchiveType } from "./content-types";

const FEISHU_API = "https://open.feishu.cn/open-apis";
const IMAGE_DIR = path.join(process.cwd(), "public", "images", "feishu");
const MAX_IMAGE_DIMENSION = 1920;

interface FeishuAttachment {
  file_token: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface FeishuRecordFields {
  标题?: unknown;
  日期?: number;
  频道?: string;
  归档类型?: string;
  标签?: string[];
  封面图?: FeishuAttachment[];
  图片?: FeishuAttachment[];
  正文?: unknown;
}

interface FeishuRecord {
  record_id: string;
  fields: FeishuRecordFields;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((seg) => (typeof seg === "string" ? seg : seg?.text ?? ""))
      .join("");
  }
  return String(value ?? "");
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getExtension(filename: string, mimeType: string): string {
  const extFromName = path.extname(filename).toLowerCase();
  if (extFromName) return extFromName;

  const mimeMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  return mimeMap[mimeType] || ".jpg";
}

async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET in env");
  }

  const res = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu auth failed: ${data.msg}`);
  }
  return data.tenant_access_token;
}

async function fetchAllRecords(token: string): Promise<FeishuRecord[]> {
  const appToken = process.env.FEISHU_APP_TOKEN;
  const tableId = process.env.FEISHU_TABLE_ID;

  if (!appToken || !tableId) {
    throw new Error("Missing FEISHU_APP_TOKEN or FEISHU_TABLE_ID in env");
  }

  const records: FeishuRecord[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    );
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.code !== 0) {
      throw new Error(`Feishu fetch records failed: ${data.msg}`);
    }

    if (data.data?.items) {
      records.push(...data.data.items);
    }
    pageToken = data.data?.has_more ? data.data.page_token : undefined;
  } while (pageToken);

  return records;
}

const HEIC_EXTS = new Set([".heic", ".heif"]);

async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  const convert = (await import("heic-convert")).default;
  const output = await convert({
    buffer: new Uint8Array(input),
    format: "JPEG",
    quality: 0.9,
  });
  return Buffer.from(output);
}

async function downloadImage(
  token: string,
  fileToken: string,
  originalName: string,
  mimeType: string,
): Promise<string> {
  await fs.mkdir(IMAGE_DIR, { recursive: true });

  const rawExt = getExtension(originalName, mimeType);
  const isHeic = HEIC_EXTS.has(rawExt.toLowerCase());
  const finalExt = isHeic ? ".jpg" : rawExt;
  const localName = `${fileToken}${finalExt}`;
  const localPath = path.join(IMAGE_DIR, localName);

  try {
    await fs.access(localPath);
    return `/images/feishu/${localName}`;
  } catch {
    // not cached yet
  }

  const res = await fetch(
    `${FEISHU_API}/drive/v1/medias/${fileToken}/download`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    console.warn(`Failed to download image ${fileToken}: ${res.status}`);
    return "";
  }

  let buffer: Buffer = Buffer.from(await res.arrayBuffer());

  if (isHeic) {
    try {
      buffer = await convertHeicToJpeg(buffer);
    } catch (err) {
      console.warn(`Failed to convert HEIC ${originalName}, skipping:`, err);
      return "";
    }
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
      buffer = await sharp(buffer)
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
    }
  } catch {
    // non-critical — keep original buffer
  }

  await fs.writeFile(localPath, buffer);
  return `/images/feishu/${localName}`;
}

async function resolveAttachments(
  token: string,
  attachments: FeishuAttachment[] | undefined,
): Promise<string[]> {
  if (!attachments?.length) return [];

  const urls: string[] = [];
  for (const att of attachments) {
    const url = await downloadImage(token, att.file_token, att.name, att.type);
    if (url) urls.push(url);
  }
  return urls;
}

export async function getFeishuEntries(): Promise<ContentEntry[]> {
  if (!process.env.FEISHU_APP_ID) return [];

  let token: string;
  try {
    token = await getTenantAccessToken();
  } catch (err) {
    console.warn("Feishu auth failed, skipping:", err);
    return [];
  }

  let records: FeishuRecord[];
  try {
    records = await fetchAllRecords(token);
  } catch (err) {
    console.warn("Feishu fetch failed, skipping:", err);
    return [];
  }

  const entries: ContentEntry[] = [];

  for (const record of records) {
    const { fields } = record;
    const title = extractText(fields.标题).trim();
    const dateVal = fields.日期;

    if (!title || !dateVal) continue;

    const date = formatDate(dateVal);
    const channel = fields.频道 || "life";
    const body = extractText(fields.正文);
    const tags = fields.标签 || [];

    const coverUrls = await resolveAttachments(token, fields.封面图);
    const imageUrls = await resolveAttachments(token, fields.图片);
    const allImages = [...coverUrls, ...imageUrls];
    const coverImage = allImages[0];

    if (!coverImage) continue;

    const id = `feishu-${record.record_id}`;

    if (channel === "archive") {
      entries.push({
        id,
        channel: "archive",
        archiveType: (fields.归档类型 as ArchiveType) || "album",
        title,
        date,
        coverImage,
        images: allImages,
        body,
        tags,
      });
    } else {
      entries.push({
        id,
        channel: "life",
        title,
        date,
        coverImage,
        images: allImages,
        body,
        tags,
      });
    }
  }

  return entries;
}
