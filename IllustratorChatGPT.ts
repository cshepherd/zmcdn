import OpenAI from "openai";
import fs from "node:fs";

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
    size: "512x512" | "1024x1024" | "1024x1536" | "1536x1024" = "1024x1024",
    saveToFile?: string,
  ): Promise<string> {
    const resp = await this.client.images.generate({
      model: "gpt-image-1",
      prompt,
      size,
      response_format: saveToFile ? "b64_json" : "url",
    });

    // If saving locally, decode and write to disk
    if (saveToFile) {
      const b64 = resp.data[0].b64_json;
      const buffer = Buffer.from(b64!, "base64");
      fs.writeFileSync(saveToFile, buffer);
      return `Saved image to ${saveToFile}`;
    }

    // Otherwise return the URL
    return resp.data[0].url!;
  }
}
