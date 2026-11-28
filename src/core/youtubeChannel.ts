// Reads a YouTube channel page for the channel's current name and avatar.
// Discord's Connections keep the name from when the account was linked, so it goes stale.

export interface ChannelProfile {
  name?: string;
  imageUrl?: string;
}

const AVATAR_HOSTS = ["yt3.googleusercontent.com", "yt3.ggpht.com"];

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, "i");
  const value = re.exec(html)?.[1];
  return value ? decodeEntities(value).trim() || undefined : undefined;
}

function avatarUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && AVATAR_HOSTS.includes(url.hostname) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** The channel's name (og:title) and avatar (og:image, only from YouTube's image hosts). */
export function parseChannelPage(html: string): ChannelProfile {
  return { name: metaContent(html, "og:title"), imageUrl: avatarUrl(metaContent(html, "og:image")) };
}
