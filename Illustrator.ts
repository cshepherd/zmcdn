interface Illustrator {
  generateImage(
    prompt: string,
    size: string,
    saveToFile?: string,
  ): Promise<string>;
}
