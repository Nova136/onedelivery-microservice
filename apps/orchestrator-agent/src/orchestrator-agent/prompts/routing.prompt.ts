export const ROUTING_PROMPTS = {
    CHECK_PROMPT: `The user was asked if they want to proceed with their remaining questions.

<input>
User message: "{{content}}"
</input>

<instructions>
1. Analyze the user's response to determine if they want to continue with more questions.
2. Return a JSON object with \`thought\` (your step-by-step reasoning) and \`wants_to_proceed\` (boolean).
</instructions>`,
};
