import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

/**
 * Returns a sliding window of messages, ensuring we keep full conversation turns (Human + AI).
 * @param messages The full array of messages.
 * @param maxTurns The maximum number of conversation turns to keep.
 * @returns A sliced array of messages.
 */
export function getSlidingWindowMessages(messages: BaseMessage[], maxTurns: number = 5): BaseMessage[] {
  if (messages.length === 0) return [];

  const turns: BaseMessage[][] = [];
  let currentTurn: BaseMessage[] = [];

  for (const message of messages) {
    // If it's a HumanMessage, it usually starts a new turn
    if (message instanceof HumanMessage && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [];
    }
    currentTurn.push(message);
  }

  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  // Take the last N turns
  const slicedTurns = turns.slice(-maxTurns);
  
  // Flatten back to a single array of messages
  return slicedTurns.flat();
}
