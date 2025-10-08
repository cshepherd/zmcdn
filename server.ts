import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { GameMasterQwen } from "./gamemaster/GameMasterQwen";
import { IllustratorFLUX } from "./illustrator/IllustratorFLUX";
const { loadImage, createCanvas } = require("canvas");
const { image2sixel } = require("sixel");

const app = express();
app.use(express.json());
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

/**
 * Convert an image file to sixel format
 * @param filename Path to the image file
 * @param palLimit Palette limit (default 256)
 * @returns Sixel data string or undefined if image cannot be loaded
 */
async function imageToSixel(
  filename: string,
  palLimit: number = 256,
): Promise<string | undefined> {
  const BACKGROUND_SELECT = 0; // 0=default terminal background, 1=white background, 2=black background

  // load image
  let img;
  try {
    img = await loadImage(filename);
  } catch (e) {
    console.error(`cannot load image "${filename}"`);
    return;
  }
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  // use image2sixel with internal quantizer
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  return image2sixel(data, img.width, img.height, palLimit, BACKGROUND_SELECT);
}

app.get("/", (_req: Request, res: Response) => {
  res.json({
    service: "zmcdn",
    description: "zmcdn server -- Illustrating the classics!",
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.send("ok");
});

/**
 * POST /illustrateMove
 * Accepts JSON: {
 *   zmcdnSessionID: string,
 *   lastZMachineOutput: string,
 *   lastZMachineInput: string,
 *   playerLocation: string,
 *   gameIdentifier: string,
 *   illustrationFormat: string,
 * }
 * Updates game state with the Game Master LLM to receive updated output text
 * as well as scene illustration
 */
app.post("/illustrateMove", async (req: Request, res: Response) => {
  const {
    zmcdnSessionID,
    lastZMachineOutput,
    lastZMachineInput,
    playerLocation,
    gameIdentifier,
    illustrationFormat,
  } = req.body;

  if (!zmcdnSessionID || !lastZMachineOutput || !gameIdentifier) {
    return res.status(400).json({ error: "missing required JSON parameters" });
  }

  // Get Game Master API key from environment
  const gameMasterAPIKey = process.env.GAMEMASTER_API_KEY;
  if (!gameMasterAPIKey) {
    return res.status(500).json({ error: "GAMEMASTER_API_KEY not configured" });
  }

  const sceneState = {
    zmcdnSessionID,
    playerLocation,
    lastZMachineInput,
    lastZMachineOutput,
  };

  try {
    // Use GameMasterQwen to generate scene direction
    const gameMaster = new GameMasterQwen(gameMasterAPIKey);
    const filteredContent = await gameMaster.generateSceneDirection(sceneState);

    // Use IllustratorFLUX to generate image
    const illustrator = new IllustratorFLUX(gameMasterAPIKey);
    const b64Image = await illustrator.generateImage(filteredContent);

    // Decode base64 image and convert to Sixel
    const imageBuffer = Buffer.from(b64Image, "base64");

    // Write temporary file for sixel conversion
    const tempImagePath = path.join(
      __dirname,
      "cache",
      `temp_${Date.now()}.png`,
    );
    fs.mkdirSync(path.dirname(tempImagePath), { recursive: true });
    fs.writeFileSync(tempImagePath, imageBuffer);

    // Convert to sixel
    const sixelData = await imageToSixel(tempImagePath);

    // Clean up temp file
    fs.unlinkSync(tempImagePath);

    if (!sixelData) {
      return res
        .status(500)
        .json({ error: "Failed to convert image to sixel" });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(sixelData);
  } catch (error) {
    console.error("Error calling API:", error);
    res.status(500).json({ error: "failed to process request" });
  }
});

// Basic error handler
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`zmcdn sample server listening on port ${PORT}`);
});

export default app;
