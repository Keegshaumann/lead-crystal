import { statSync } from "node:fs";
import { join } from "node:path";

// Human-readable size of a file in public/, e.g. "4.2 MB". Used on download buttons.
export function fileSize(publicPath: string): string {
  try {
    const bytes = statSync(join(process.cwd(), "public", publicPath.replace(/^\//, ""))).size;
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  } catch {
    return "";
  }
}
