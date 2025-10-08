import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import readline from "readline";
import { GameMasterQwen } from "./gamemaster/GameMasterQwen";
import { IllustratorFLUX } from "./illustrator/IllustratorFLUX";
import dotenv from 'dotenv'

const { loadImage, createCanvas } = require("canvas");
const { image2sixel } = require("sixel");

dotenv.config();
const app = express();
app.use(express.json());
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Global trace flag
let trace = false;

// Global GameMasterQwen instance to maintain history across requests
let gameMaster: GameMasterQwen | null = null;

// Custom logging function that respects trace flag
function traceLog(...args: any[]) {
  if (trace) {
    console.log(...args);
  }
}

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
    traceLog(`cannot load image "${filename}"`);
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

  // Validate gameIdentifier to prevent directory traversal attacks
  if (!/^[a-zA-Z0-9.]+$/.test(gameIdentifier)) {
    return res.status(400).json({ error: "invalid gameIdentifier format" });
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
    // Initialize GameMasterQwen instance if not already created
    if (!gameMaster) {
      gameMaster = new GameMasterQwen(gameMasterAPIKey, trace);
    }

    // Use GameMasterQwen to generate scene direction
    const filteredContent = await gameMaster.generateSceneDirection(sceneState);
    traceLog(filteredContent);

    // Parse the JSON to check repaint flag and get reuse_key
    let sceneData;
    try {
      sceneData = JSON.parse(filteredContent);
    } catch (e) {
      return res.status(500).json({ error: "Invalid JSON from game master" });
    }

    let imageBuffer: Buffer;

    // Check if we should use cached image
    if (sceneData.repaint === false && sceneData.reuse_key) {
      const cachedImagePath = path.join(__dirname, "cache", gameIdentifier, `${sceneData.reuse_key}.png`);
      if (fs.existsSync(cachedImagePath)) {
        imageBuffer = fs.readFileSync(cachedImagePath);
        traceLog(`Using cached image from: ${cachedImagePath}`);
      } else {
        traceLog(`Cache miss for: ${cachedImagePath}, generating new image`);
        // Generate new image if cache doesn't exist
        const illustrator = new IllustratorFLUX(gameMasterAPIKey);
        const b64Image = await illustrator.generateImage(filteredContent);
        imageBuffer = Buffer.from(b64Image, "base64");
      }
    } else {
      // Generate new image
      const illustrator = new IllustratorFLUX(gameMasterAPIKey);
      const b64Image = await illustrator.generateImage(filteredContent);
      imageBuffer = Buffer.from(b64Image, "base64");

      // Save image to cache if repaint is true
      if (sceneData.repaint === true && sceneData.reuse_key) {
        const cacheDir = path.join(__dirname, "cache", gameIdentifier);
        fs.mkdirSync(cacheDir, { recursive: true });
        const cachedImagePath = path.join(cacheDir, `${sceneData.reuse_key}.png`);
        fs.writeFileSync(cachedImagePath, imageBuffer);
        traceLog(`Cached image to: ${cachedImagePath}`);
      }
    }

    // If PNG format is requested, return image data directly
    if (illustrationFormat === 'png') {
      res.setHeader("Content-Type", "image/png");
      return res.send(imageBuffer);
    }

    // Otherwise, convert to Sixel
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

  // Start REPL if -i flag is specified
  if (process.argv.includes('-i')) {
    startREPL();
  }
});

function startREPL() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'zmcdn> '
  });

  console.log('Interactive mode enabled. Type "help" for commands.');
  rl.prompt();

  rl.on('line', (line: string) => {
    const cmd = line.trim().toLowerCase();

    switch (cmd) {
      case 'trace on':
        trace = true;
        console.log('Trace enabled');
        break;
      case 'trace off':
        trace = false;
        console.log('Trace disabled');
        break;
      case 'help':
        console.log('Available commands:');
        console.log('  trace on  - Enable trace logging');
        console.log('  trace off - Disable trace logging');
        console.log('  help      - Show this help message');
        console.log('  exit      - Shutdown server and exit');
        console.log('  quit      - Shutdown server and exit');
        break;
      case 'exit':
      case 'quit':
        console.log('Shutting down server...');
        rl.close();
        process.exit(0);
      case '':
        // Empty line, just show prompt again
        break;
      default:
        console.log(`Unknown command: ${line}`);
        console.log('Type "help" for available commands');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('REPL closed');
  });
}

export default app;
