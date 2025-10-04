import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { IllustratorChatGPT } from './IllustratorChatGPT';
const { loadImage, createCanvas } = require('canvas');
const { image2sixel } = require('sixel');

const app = express();
app.use(express.json());
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

/**
 * Convert an image file to sixel format
 * @param filename Path to the image file
 * @param palLimit Palette limit (default 256)
 * @returns Sixel data string or undefined if image cannot be loaded
 */
async function imageToSixel(filename: string, palLimit: number = 256): Promise<string | undefined> {
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
	const ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);

	// use image2sixel with internal quantizer
	const data = ctx.getImageData(0, 0, img.width, img.height).data;
	return image2sixel(data, img.width, img.height, palLimit, BACKGROUND_SELECT);
}

app.get('/', (_req: Request, res: Response) => {
	res.json({
		service: 'zmcdn',
		description: 'Sample Express server. See /print/:gameId/:hashxs/:format',
	});
});

app.get('/health', (_req: Request, res: Response) => {
	res.send('ok');
});

/**
 * POST /generate
 * Accepts JSON: { gameID: string, text: string }
 * Generates an image using IllustratorChatGPT and saves it to cache/gameID/hash
 * where hash is the SHA-512 hash of the text parameter
 */
app.post('/generate', async (req: Request, res: Response) => {
	const { gameID, text } = req.body;

	if (!gameID || !text) {
		return res.status(400).json({ error: 'missing gameID or text parameters' });
	}

	// Get API key from environment
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
	}

	// Generate hash of the text
	const hash = crypto.createHash('sha512').update(text).digest('hex');

	// Create cache directory structure
	const cacheDir = path.join(__dirname, 'cache', gameID);
	const imagePath = path.join(cacheDir, hash);

	// Check if image already exists
	if (fs.existsSync(imagePath)) {
		return res.json({
			gameID,
			hash,
			message: 'image already exists',
			url: `/print/${gameID}/${hash}/png`
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
			message: 'image generated successfully',
			url: `/print/${gameID}/${hash}/png`
		});
	} catch (error) {
		console.error('Error generating image:', error);
		res.status(500).json({ error: 'failed to generate image' });
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
app.get('/print/:gameId/:hash/:format', async (req: Request, res: Response) => {
	const { gameId, hash, format } = req.params;

	if (!gameId || !hash || !format) {
		return res.status(400).json({ error: 'missing parameters' });
	}

	// Construct the path to the cached image: cache/gameId/hash
	const imagePath = path.join(__dirname, 'cache', gameId, hash);

	// Check if the image file exists
	if (!fs.existsSync(imagePath)) {
		return res.status(404).json({ error: 'image not found' });
	}

	// Handle sixel format
	if (format.toLowerCase() === 'sixel') {
		try {
			const sixelData = await imageToSixel(imagePath);
			if (!sixelData) {
				return res.status(500).json({ error: 'failed to convert image to sixel' });
			}
			res.setHeader('Content-Type', 'text/plain; charset=utf-8');
			return res.send(sixelData);
		} catch (error) {
			console.error('Error converting to sixel:', error);
			return res.status(500).json({ error: 'failed to convert image to sixel' });
		}
	}

	// Handle PNG format
	if (format.toLowerCase() === 'png') {
		res.setHeader('Content-Type', 'image/png');
		return res.sendFile(imagePath);
	}

	// Generic fallback for other formats
	res.setHeader('Content-Type', 'application/json');
	res.json({ gameId, hash, format, note: 'format not supported' });
});

// Basic error handler
app.use((err: any, _req: Request, res: Response, _next: any) => {
	console.error('Unhandled error:', err);
	res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => {
	console.log(`zmcdn sample server listening on http://localhost:${PORT}`);
});

export default app;
