import { promises as fs } from "fs";
import path from "path";
import {
  type ContentEntry,
  type GalleryEntry,
  toGalleryEntry,
} from "@/lib/content-types";

const CONTENT_ROOT = path.join(process.cwd(), "content");
const PUBLIC_ROOT = path.join(process.cwd(), "public");

async function resolvePublicAssetPath(assetPath: string): Promise<string | null> {
  if (!assetPath) {
    return null;
  }

  const relativeAssetPath = assetPath.replace(/^\/+/, "");
  const absoluteAssetPath = path.join(PUBLIC_ROOT, relativeAssetPath);

  try {
    await fs.access(absoluteAssetPath);
    return `/${relativeAssetPath.replace(/\\/g, "/")}`;
  } catch {
    const absoluteDirectory = path.dirname(absoluteAssetPath);
    const expectedFileName = path.basename(relativeAssetPath).toLowerCase();

    try {
      const directoryEntries = await fs.readdir(absoluteDirectory);
      const matchedFileName = directoryEntries.find(
        (fileName) => fileName.toLowerCase() === expectedFileName,
      );

      if (!matchedFileName) {
        return null;
      }

      const relativeDirectory = path.dirname(relativeAssetPath).replace(/\\/g, "/");
      return relativeDirectory === "."
        ? `/${matchedFileName}`
        : `/${relativeDirectory}/${matchedFileName}`;
    } catch {
      return null;
    }
  }
}

async function normalizeEntryAssets(entry: ContentEntry): Promise<ContentEntry | null> {
  const resolvedImages = (
    await Promise.all(entry.images.map((imagePath) => resolvePublicAssetPath(imagePath)))
  ).filter((imagePath): imagePath is string => Boolean(imagePath));

  const resolvedCoverImage = await resolvePublicAssetPath(entry.coverImage);
  const coverImage = resolvedCoverImage ?? resolvedImages[0];

  if (!coverImage) {
    return null;
  }

  return {
    ...entry,
    coverImage,
    images: resolvedImages.length > 0 ? resolvedImages : [coverImage],
  };
}

async function readChannelEntries(
  channelDirectory: "life" | "archive",
): Promise<ContentEntry[]> {
  const directoryPath = path.join(CONTENT_ROOT, channelDirectory);

  try {
    const files = await fs.readdir(directoryPath);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    const entries = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(directoryPath, file);
        const content = await fs.readFile(filePath, "utf8");
        return JSON.parse(content) as ContentEntry;
      }),
    );

    return entries;
  } catch {
    return [];
  }
}

export async function getGalleryEntries(): Promise<GalleryEntry[]> {
  const [lifeEntries, archiveEntries] = await Promise.all([
    readChannelEntries("life"),
    readChannelEntries("archive"),
  ]);

  const normalizedEntries = await Promise.all(
    [...lifeEntries, ...archiveEntries].map((entry) => normalizeEntryAssets(entry)),
  );

  return normalizedEntries
    .filter((entry): entry is ContentEntry => Boolean(entry))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(toGalleryEntry);
}
