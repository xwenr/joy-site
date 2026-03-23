export type Channel = "life" | "archive";

export type ArchiveType = "album" | "song" | "film" | "book";

export interface BaseContentEntry {
  id: string;
  channel: Channel;
  title: string;
  date: string;
  coverImage: string;
  images: string[];
  body: string;
  tags: string[];
}

export interface LifeContentEntry extends BaseContentEntry {
  channel: "life";
}

export interface ArchiveContentEntry extends BaseContentEntry {
  channel: "archive";
  archiveType: ArchiveType;
}

export type ContentEntry = LifeContentEntry | ArchiveContentEntry;

export interface GalleryEntry {
  id: string;
  channel: Channel;
  title: string;
  date: string;
  image: string;
  images: string[];
  body: string;
  tags: string[];
  archiveType?: ArchiveType;
  timelineMonth?: string;
}

export function getTimelineMonth(date: string) {
  return date.slice(0, 7);
}

export function toGalleryEntry(entry: ContentEntry): GalleryEntry {
  return {
    id: entry.id,
    channel: entry.channel,
    title: entry.title,
    date: entry.date,
    image: entry.coverImage,
    images: entry.images,
    body: entry.body,
    tags: entry.tags,
    archiveType: entry.channel === "archive" ? entry.archiveType : undefined,
    timelineMonth: entry.channel === "life" ? getTimelineMonth(entry.date) : undefined,
  };
}
