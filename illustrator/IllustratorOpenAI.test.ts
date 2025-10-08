import { IllustratorOpenAI } from './IllustratorOpenAI';
import OpenAI from 'openai';
import fs from 'node:fs';

// Mock OpenAI
jest.mock('openai');
jest.mock('node:fs');

describe('IllustratorOpenAI', () => {
  let illustrator: IllustratorOpenAI;
  const mockApiKey = 'test-openai-key';
  let mockGenerate: jest.Mock;

  beforeEach(() => {
    mockGenerate = jest.fn();
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => ({
      images: {
        generate: mockGenerate,
      },
    } as any));

    illustrator = new IllustratorOpenAI(mockApiKey);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with the provided API key', () => {
      expect(illustrator).toBeInstanceOf(IllustratorOpenAI);
    });
  });

  describe('generateImage', () => {
    const mockPrompt = 'A futuristic cityscape at sunset';
    const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    it('should successfully generate an image with default size and return base64 data URI', async () => {
      mockGenerate.mockResolvedValue({
        data: [{ b64_json: mockBase64 }],
      });

      const result = await illustrator.generateImage(mockPrompt);

      expect(mockGenerate).toHaveBeenCalledWith({
        model: 'gpt-image-1',
        prompt: mockPrompt,
        size: '1024x1024',
      });
      expect(result).toBe(`data:image/png;base64,${mockBase64}`);
    });

    it('should successfully generate an image with custom size', async () => {
      const customSize: '1792x1024' = '1792x1024';
      mockGenerate.mockResolvedValue({
        data: [{ b64_json: mockBase64 }],
      });

      const result = await illustrator.generateImage(mockPrompt, customSize);

      expect(mockGenerate).toHaveBeenCalledWith({
        model: 'gpt-image-1',
        prompt: mockPrompt,
        size: customSize,
      });
      expect(result).toBe(`data:image/png;base64,${mockBase64}`);
    });

    it('should save base64 image to file when saveToFile is provided', async () => {
      const filePath = '/tmp/test-image.png';
      mockGenerate.mockResolvedValue({
        data: [{ b64_json: mockBase64 }],
      });

      const result = await illustrator.generateImage(mockPrompt, '1024x1024', filePath);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        filePath,
        expect.any(Buffer)
      );
      expect(result).toBe(`Saved image to ${filePath}`);
    });

    it('should return URL when API returns URL instead of base64', async () => {
      const mockUrl = 'https://example.com/image.png';
      mockGenerate.mockResolvedValue({
        data: [{ url: mockUrl }],
      });

      const result = await illustrator.generateImage(mockPrompt);

      expect(result).toBe(mockUrl);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should throw error when no image data is returned', async () => {
      mockGenerate.mockResolvedValue({
        data: [],
      });

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'No image data returned'
      );
    });

    it('should throw error when data array is undefined', async () => {
      mockGenerate.mockResolvedValue({});

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'No image data returned'
      );
    });

    it('should throw error when neither b64_json nor url is present', async () => {
      mockGenerate.mockResolvedValue({
        data: [{}],
      });

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'No image URL or data returned'
      );
    });

    it('should handle API errors', async () => {
      mockGenerate.mockRejectedValue(new Error('OpenAI API error'));

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'OpenAI API error'
      );
    });

    it('should handle all valid size options', async () => {
      const sizes: Array<'1024x1024' | '1792x1024' | '1024x1792'> = [
        '1024x1024',
        '1792x1024',
        '1024x1792',
      ];

      for (const size of sizes) {
        mockGenerate.mockResolvedValue({
          data: [{ b64_json: mockBase64 }],
        });

        await illustrator.generateImage(mockPrompt, size);

        expect(mockGenerate).toHaveBeenCalledWith(
          expect.objectContaining({ size })
        );
      }
    });

    it('should properly encode buffer from base64', async () => {
      const filePath = '/tmp/encoded-image.png';
      mockGenerate.mockResolvedValue({
        data: [{ b64_json: mockBase64 }],
      });

      await illustrator.generateImage(mockPrompt, '1024x1024', filePath);

      const callArgs = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe(filePath);
      expect(Buffer.isBuffer(callArgs[1])).toBe(true);
      expect(callArgs[1].toString('base64')).toBe(mockBase64);
    });
  });
});
