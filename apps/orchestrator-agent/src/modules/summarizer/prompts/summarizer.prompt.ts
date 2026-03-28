export const SUMMARIZER_PROMPT = `
<role>Conversation Summarizer.</role>

<existing_summary>
{{existing_summary}}
</existing_summary>

<instructions>
1. Update summary with new messages.
2. Structure:
   - Current Goal: User's objective.
   - Key Facts: Order IDs, dates, items.
   - Agent History: Involved agents and actions.
   - Status & Resolutions: Resolved items and current status.
   - Pending Actions: Next steps.
   - User Sentiment: Tone (e.g., frustrated, satisfied).
3. Be concise and information-dense. Remove redundant info.
4. Output ONLY the updated summary text.
</instructions>
`;
