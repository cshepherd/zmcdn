import { IllustratorFLUX } from './IllustratorFLUX';

// Mock global fetch
global.fetch = jest.fn();

describe('IllustratorFLUX', () => {
  let illustrator: IllustratorFLUX;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    illustrator = new IllustratorFLUX(mockApiKey);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with the provided API key', () => {
      expect(illustrator).toBeInstanceOf(IllustratorFLUX);
    });
  });

  describe('generateImage', () => {
    const mockPrompt = 'A beautiful sunset over the ocean';
    const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    it('should successfully generate an image with default size', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ b64_json: mockBase64Image }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await illustrator.generateImage(mockPrompt);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.deepinfra.com/v1/openai/images/generations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockApiKey}`,
          },
          body: JSON.stringify({
            prompt: mockPrompt,
            size: '512x512',
            model: 'black-forest-labs/FLUX-1-schnell',
            n: 1,
          }),
        }
      );
      expect(result).toBe(mockBase64Image);
    });

    it('should successfully generate an image with custom size', async () => {
      const customSize = '1024x1024';
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ b64_json: mockBase64Image }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await illustrator.generateImage(mockPrompt, customSize);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.deepinfra.com/v1/openai/images/generations',
        expect.objectContaining({
          body: expect.stringContaining(`"size":"${customSize}"`),
        })
      );
      expect(result).toBe(mockBase64Image);
    });

    it('should throw an error when API request fails', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'Image generation failed with status 500'
      );
    });

    it('should throw an error when response has no data array', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'No image data in response'
      );
    });

    it('should throw an error when data array is empty', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: [] }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'No image data in response'
      );
    });

    it('should throw an error when b64_json is missing', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: [{}] }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'No image data in response'
      );
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(illustrator.generateImage(mockPrompt)).rejects.toThrow(
        'Network error'
      );
    });
  });
});
