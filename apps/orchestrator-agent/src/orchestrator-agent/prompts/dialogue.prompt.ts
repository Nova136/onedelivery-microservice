export const DIALOGUE_PROMPTS = {
    MULTI_INTENT_GUIDANCE:
        "I've noted your requests about {{categories}}. To ensure we handle everything correctly, let's address them one by one, starting with {{currentCategory}}.\n\n",
    MISSING_DATA:
        "To help you with your {{intent}}, I just need a bit more information. Could you please provide your {{missingField}}?",
    CONFIRMATION:
        "I've gathered the following details for your {{intent}}:\n\n{{summaryList}}\n\nDoes everything look correct? Shall I go ahead and submit this for you?",
    HANDOFF_SUBMITTING:
        "Thank you. I've gathered all the necessary details for your {{intent}}. I'm now submitting this request ({{idLabel}}: {{identifier}}) to our specialized team.",
    HANDOFF_SUCCESS:
        "Great news! I've successfully submitted your {{intent}} request ({{idLabel}}: {{identifier}}). {{toolResult}}",
    HANDOFF_ERROR:
        "I'm sorry, I encountered a slight issue while submitting your request ({{idLabel}}: {{identifier}}). Could you please try again in a moment?",
    NEXT_INTENT_TRANSITION:
        "\n\nNow, let's move on to your request regarding {{nextCategory}}.",
    REJECTION_RESPONSE:
        "No problem at all. What would you like to change or clarify?",
    FALLBACK_RESPONSE:
        "I'm sorry, I'm not quite sure how to handle that specific request. Could you please provide a bit more detail or clarify what you need?",
};
