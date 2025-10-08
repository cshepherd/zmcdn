/**
 * IllustratorFLUX handles image generation using the FLUX-1-schnell model
 */
export class IllustratorFLUX {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate an image from a text prompt
   * @param prompt The text prompt describing the desired image
   * @param size Image dimensions (default "512x512")
   * @returns Base64-encoded image data
   */
  async generateImage(
    prompt: string,
    size: string = "512x512"
  ): Promise<string> {
    const response = await fetch(
      "https://api.deepinfra.com/v1/openai/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          size,
          model: "black-forest-labs/FLUX-1-schnell",
          n: 1,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Image generation API failed:", errorText);
      throw new Error(`Image generation failed with status ${response.status}`);
    }

    const imageResult = await response.json();
    console.log("Image generated:", imageResult);

    if (
      !imageResult.data ||
      !imageResult.data[0] ||
      !imageResult.data[0].b64_json
    ) {
      throw new Error("No image data in response");
    }

    return imageResult.data[0].b64_json;
  }
}