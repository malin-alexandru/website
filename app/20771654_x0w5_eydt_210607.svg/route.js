import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  const svgPath = join(process.cwd(), "20771654_x0w5_eydt_210607.svg");
  const svgContent = await readFile(svgPath, "utf8");

  return new Response(svgContent, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}
