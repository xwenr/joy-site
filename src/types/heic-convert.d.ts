declare module "heic-convert" {
  interface ConvertOptions {
    buffer: Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  export default function convert(options: ConvertOptions): Promise<Buffer>;
}
