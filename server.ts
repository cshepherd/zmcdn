import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { IllustratorChatGPT } from "./IllustratorChatGPT";
const { loadImage, createCanvas } = require("canvas");
const { image2sixel } = require("sixel");

const app = express();
app.use(express.json());
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const lastAnswers: string[] = []; // Store last answers for context

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
    description: "Sample Express server. See /print/:gameId/:hashxs/:format",
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

  const gameMasterPrompt = `You are the Art Director for retro fantasy pixel art. 
Given JSON scene state, produce:
1) visual_prompt: a concise text-to-image prompt (≤ 220 chars) focusing only on visible elements.
2) reuse_key: a deterministic key for caching (room + time + key objects).
3) style_tags: short tokens that enforce consistency (e.g. "retro-320x200, muted palette, misty, low camera").

Rules:
- lastZMachineInput is up to 8 of the most recent things the user typed. lastZMachineOutput is up to 8 of the game interpreter's responses to what the user typed.
- if playerLocation is empty, infer our location from lastZMachineOutput
- Keep continuity with character/scene keys.
- If last_event is a minor change, set repaint=false.
- Prefer moody lighting/masses over tiny object details.
Return JSON only.
`;
  const sceneState = {
    zmcdnSessionID,
    playerLocation,
    lastZMachineInput,
    lastZMachineOutput,
  };

  const messages = [];
  messages.push({
    role: "system",
    content: `${gameMasterPrompt}`,
  });
  for (let idx = 0; idx < lastAnswers.length; idx++) {
    messages.push({
      role: "user",
      content: `${lastAnswers[idx]}`,
    });
  }
  messages.push({
    role: "user",
    content: `${JSON.stringify(sceneState)}`,
  });

  try {
    console.log("contacting Qwen");
    console.log(JSON.stringify(messages));
    const response = await fetch(
      "https://api.deepinfra.com/v1/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gameMasterAPIKey}`,
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-32B",
          messages,
        }),
      },
    );

    // Handle streaming response
    if (!response.ok) {
      return res.status(response.status).json({ error: "API request failed" });
    }

    // Read the streaming response and save to string
    let savedOutput = "";
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        savedOutput += chunk;
      }
    }

    // Parse JSON and extract content using jq equivalent: .choices[0].message.content
    let filteredContent = savedOutput;
    try {
      const jsonResponse = JSON.parse(savedOutput);
      if (
        jsonResponse.choices &&
        jsonResponse.choices[0] &&
        jsonResponse.choices[0].message
      ) {
        filteredContent = jsonResponse.choices[0].message.content;
        // Remove <think>...</think> tags and their contents
        filteredContent = filteredContent.replace(
          /<think>[\s\S]*?<\/think>/g,
          "",
        );
      }
    } catch (e) {
      console.error("Failed to parse JSON response:", e);
    }
    console.log("Game Master output:", filteredContent);

    lastAnswers.push(filteredContent);
    if (lastAnswers.length > 8) {
      lastAnswers.splice(0, lastAnswers.length - 8);
    }

    // Call image generation API with the filtered content
    const imageResponse = await fetch(
      "https://api.deepinfra.com/v1/openai/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gameMasterAPIKey}`,
        },
        body: JSON.stringify({
          prompt: filteredContent,
          size: "512x512",
          model: "black-forest-labs/FLUX-1-schnell",
          n: 1,
        }),
      },
    );

    if (!imageResponse.ok) {
      console.error("Image generation API failed:", await imageResponse.text());
      return res
        .status(imageResponse.status)
        .json({ error: "Image generation failed" });
    }

    const imageResult = await imageResponse.json();
    console.log("Image generated:", imageResult);

    // Decode base64 image and convert to Sixel
    if (
      imageResult.data &&
      imageResult.data[0] &&
      imageResult.data[0].b64_json
    ) {
      const imageBuffer = Buffer.from(imageResult.data[0].b64_json, "base64");

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
    } else {
      return res.status(500).json({ error: "No image data in response" });
    }
  } catch (error) {
    console.error("Error calling API:", error);
    res.status(500).json({ error: "failed to process request" });
  }
});

/**
 * POST /generate
 * Accepts JSON: { gameID: string, text: string }
 * Generates an image using IllustratorChatGPT and saves it to cache/gameID/hash
 * where hash is the SHA-512 hash of the text parameter
 */
app.post("/generate", async (req: Request, res: Response) => {
  const { gameID, text } = req.body;

  if (!gameID || !text) {
    return res.status(400).json({ error: "missing gameID or text parameters" });
  }

  // Get API key from environment
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  // Generate hash of the text
  const hash = crypto.createHash("sha512").update(text).digest("hex");

  // Create cache directory structure
  const cacheDir = path.join(__dirname, "cache", gameID);
  const imagePath = path.join(cacheDir, hash);

  // Check if image already exists
  if (fs.existsSync(imagePath)) {
    return res.json({
      gameID,
      hash,
      message: "image already exists",
      url: `/print/${gameID}/${hash}/png`,
    });
  }

  // Create directory if it doesn't exist
  fs.mkdirSync(cacheDir, { recursive: true });

  try {
    const illustrator = new IllustratorChatGPT(apiKey);
    await illustrator.generateImage(text, "1024x1024", imagePath);

    res.json({
      gameID,
      hash,
      message: "image generated successfully",
      url: `/print/${gameID}/${hash}/png`,
    });
  } catch (error) {
    console.error("Error generating image:", error);
    res.status(500).json({ error: "failed to generate image" });
  }
});

/**
 * Example endpoint that follows README format:
 * GET /print/:gameId/:hash/:format
 * - Looks for cached image at cache/:gameId/:hash
 * - Returns 404 if image not found
 * - For format === 'sixel', converts image to sixel format
 * - For format === 'png', returns the PNG file
 */
app.get("/print/:gameId/:hash/:format", async (req: Request, res: Response) => {
  const { gameId, hash, format } = req.params;

  if (!gameId || !hash || !format) {
    return res.status(400).json({ error: "missing parameters" });
  }

  // Construct the path to the cached image: cache/gameId/hash
  const imagePath = path.join(__dirname, "cache", gameId, hash);

  // Check if the image file exists
  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ error: "image not found" });
  }

  // Handle sixel format
  if (format.toLowerCase() === "sixel") {
    try {
      const sixelData = await imageToSixel(imagePath);
      if (!sixelData) {
        return res
          .status(500)
          .json({ error: "failed to convert image to sixel" });
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.send(sixelData);
    } catch (error) {
      console.error("Error converting to sixel:", error);
      return res
        .status(500)
        .json({ error: "failed to convert image to sixel" });
    }
  }

  // Handle PNG format
  if (format.toLowerCase() === "png") {
    res.setHeader("Content-Type", "image/png");
    return res.sendFile(imagePath);
  }

  // Generic fallback for other formats
  res.setHeader("Content-Type", "application/json");
  res.json({ gameId, hash, format, note: "format not supported" });
});

// Basic error handler
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, () => {
  console.log(`zmcdn sample server listening on http://localhost:${PORT}`);
});

export default app;
