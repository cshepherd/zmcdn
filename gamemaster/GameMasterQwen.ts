/**
 * GameMasterQwen handles communication with the Qwen LLM for game narration and scene direction
 */
export class GameMasterQwen {
  private apiKey: string;
  private lastAnswers: string[] = [];
  private readonly maxAnswerHistory = 8;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate scene direction from game state
   * @param sceneState The current game state including location and recent I/O
   * @returns The Game Master's response text
   */
  async generateSceneDirection(sceneState: {
    zmcdnSessionID: string;
    playerLocation: string;
    lastZMachineInput: string;
    lastZMachineOutput: string;
  }): Promise<string> {
    const gameMasterPrompt = `/no_think You are the Art Director for retro fantasy pixel art.
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

    const messages = [];
    messages.push({
      role: "system",
      content: `${gameMasterPrompt}`,
    });
    for (let idx = 0; idx < this.lastAnswers.length; idx++) {
      messages.push({
        role: "user",
        content: `${this.lastAnswers[idx]}`,
      });
    }
    messages.push({
      role: "user",
      content: `${JSON.stringify(sceneState)}`,
    });

    console.log("contacting Qwen");
    console.log(JSON.stringify(messages));

    const response = await fetch(
      "https://api.deepinfra.com/v1/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-32B",
          messages,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
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

    // Parse JSON and extract content
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

    // Store answer for context in future calls
    this.lastAnswers.push(filteredContent);
    if (this.lastAnswers.length > this.maxAnswerHistory) {
      this.lastAnswers.splice(0, this.lastAnswers.length - this.maxAnswerHistory);
    }

    return filteredContent;
  }
}