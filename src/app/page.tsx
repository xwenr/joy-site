import HomeClient from "@/components/HomeClient";
import { getGalleryEntries } from "@/lib/content.server";

export default async function Home() {
  const entries = await getGalleryEntries();
  return <HomeClient entries={entries} />;
}
