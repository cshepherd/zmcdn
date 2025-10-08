import { GameMasterQwen } from './GameMasterQwen';

// Mock global fetch
global.fetch = jest.fn();

describe('GameMasterQwen', () => {
  let gameMaster: GameMasterQwen;
  const mockApiKey = 'test-qwen-key';

  beforeEach(() => {
    gameMaster = new GameMasterQwen(mockApiKey);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with the provided API key', () => {
      expect(gameMaster).toBeInstanceOf(GameMasterQwen);
    });
  });

  describe('generateSceneDirection', () => {
    const mockSceneState = {
      zmcdnSessionID: 'test-session-123',
      playerLocation: 'West of House',
      lastZMachineInput: 'open mailbox',
      lastZMachineOutput: 'Opening the small mailbox reveals a leaflet.',
    };

    const mockJsonResponse = {
      visual_prompt: 'A rustic mailbox in front of a white house',
      reuse_key: 'west_of_house_mailbox_open',
      style_tags: 'retro-320x200, muted palette',
      repaint: true,
    };

    const createMockStreamReader = (content: string) => {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      let position = 0;

      return {
        read: jest.fn(async () => {
          if (position >= data.length) {
            return { done: true, value: undefined };
          }
          const chunk = data.slice(position, position + 10);
          position += 10;
          return { done: false, value: chunk };
        }),
      };
    };

    it('should successfully generate scene direction with valid response', async () => {
      const apiResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(mockJsonResponse),
            },
          },
        ],
      });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => createMockStreamReader(apiResponse),
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await gameMaster.generateSceneDirection(mockSceneState);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.deepinfra.com/v1/openai/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockApiKey}`,
          },
          body: expect.stringContaining('"model":"Qwen/Qwen3-32B"'),
        }
      );

      expect(JSON.parse(result)).toEqual(mockJsonResponse);
    });

    it('should remove <think> tags from content', async () => {
      const contentWithThink = `<think>Some reasoning here</think>${JSON.stringify(mockJsonResponse)}`;
      const apiResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: contentWithThink,
            },
          },
        ],
      });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => createMockStreamReader(apiResponse),
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await gameMaster.generateSceneDirection(mockSceneState);

      expect(result).not.toContain('<think>');
      expect(result).not.toContain('</think>');
      expect(JSON.parse(result)).toEqual(mockJsonResponse);
    });

    it('should extract JSON content between first { and last }', async () => {
      const contentWithExtra = `Here is some text before {${JSON.stringify(mockJsonResponse).slice(1, -1)}} and after`;
      const apiResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: contentWithExtra,
            },
          },
        ],
      });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => createMockStreamReader(apiResponse),
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await gameMaster.generateSceneDirection(mockSceneState);

      expect(result).not.toContain('Here is some text before');
      expect(result).not.toContain('and after');
      expect(result.startsWith('{')).toBe(true);
      expect(result.endsWith('}')).toBe(true);
    });

    it('should store answers in history and include them in next request', async () => {
      const apiResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(mockJsonResponse),
            },
          },
        ],
      });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => createMockStreamReader(apiResponse),
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // First call
      await gameMaster.generateSceneDirection(mockSceneState);

      // Second call
      await gameMaster.generateSceneDirection(mockSceneState);

      const secondCallBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
      expect(secondCallBody.messages.length).toBeGreaterThan(2); // system + previous answer + current
    });

    it('should limit answer history to maxAnswerHistory', async () => {
      const apiResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(mockJsonResponse),
            },
          },
        ],
      });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => createMockStreamReader(apiResponse),
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Make 10 calls (more than maxAnswerHistory of 8)
      for (let i = 0; i < 10; i++) {
        await gameMaster.generateSceneDirection(mockSceneState);
      }

      const lastCallBody = JSON.parse((global.fetch as jest.Mock).mock.calls[9][1].body);
      // Should have system message + 8 history messages + current = 10 total
      expect(lastCallBody.messages.length).toBeLessThanOrEqual(10);
    });

    it('should throw error when API request fails', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(gameMaster.generateSceneDirection(mockSceneState)).rejects.toThrow(
        'API request failed with status 500'
      );
    });

    it('should handle malformed JSON response gracefully', async () => {
      const malformedResponse = 'not valid json {';

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => createMockStreamReader(malformedResponse),
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await gameMaster.generateSceneDirection(mockSceneState);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse JSON response:',
        expect.any(Error)
      );
      expect(result).toBe(malformedResponse);

      consoleErrorSpy.mockRestore();
    });

    it('should handle response without choices', async () => {
      const apiResponse = JSON.stringify({});

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => createMockStreamReader(apiResponse),
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await gameMaster.generateSceneDirection(mockSceneState);

      expect(result).toBe(apiResponse);
    });

    it('should handle response without body reader', async () => {
      const mockResponse = {
        ok: true,
        body: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await gameMaster.generateSceneDirection(mockSceneState);

      expect(result).toBe('');
    });

    it('should include scene state in request', async () => {
      const apiResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(mockJsonResponse),
            },
          },
        ],
      });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => createMockStreamReader(apiResponse),
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await gameMaster.generateSceneDirection(mockSceneState);

      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      const lastMessage = callBody.messages[callBody.messages.length - 1];

      expect(lastMessage.content).toContain(mockSceneState.zmcdnSessionID);
      expect(lastMessage.content).toContain(mockSceneState.playerLocation);
      expect(lastMessage.content).toContain(mockSceneState.lastZMachineInput);
      expect(lastMessage.content).toContain(mockSceneState.lastZMachineOutput);
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(gameMaster.generateSceneDirection(mockSceneState)).rejects.toThrow(
        'Network error'
      );
    });
  });
});
