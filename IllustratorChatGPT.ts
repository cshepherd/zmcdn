import OpenAI from "openai";
import fs from "node:fs";
import fetch, { Headers, Request, Response } from "node-fetch";
import FormData from "form-data";

// Polyfill globals for OpenAI client
if (!globalThis.fetch) {
  (globalThis as any).fetch = fetch;
  (globalThis as any).Headers = Headers;
  (globalThis as any).Request = Request;
  (globalThis as any).Response = Response;
  (globalThis as any).FormData = FormData;
}

export class IllustratorChatGPT {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate an image from a text prompt
   * @param prompt The description of the image
   * @param size Image size (e.g. "512x512", "1024x1024", "1024x1536", "1536x1024")
   * @param saveToFile Optional local file path to save the image (if base64 format)
   */
  async generateImage(
    prompt: string,
    size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024",
    saveToFile?: string,
  ): Promise<string> {
    const resp = await this.client.images.generate({
      model: "gpt-image-1",
      prompt,
      size,
    });

    // Check if we got base64 data or URL
    const imageData = resp.data?.[0];
    if (!imageData) {
      throw new Error("No image data returned");
    }

    // Handle base64 data
    if (imageData.b64_json) {
      const buffer = Buffer.from(imageData.b64_json, "base64");
      if (saveToFile) {
        fs.writeFileSync(saveToFile, buffer);
        return `Saved image to ${saveToFile}`;
      }
      // Return as data URI if no save path
      return `data:image/png;base64,${imageData.b64_json}`;
    }

    // Handle URL
    if (imageData.url) {
      return imageData.url;
    }

    throw new Error("No image URL or data returned");
  }
}
