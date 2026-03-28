import { OrchestratorStateType } from "../state";
import { SemanticRouterService } from "../../modules/semantic-router/semantic-router.service";
import { ChatOpenAI } from "@langchain/openai";
import { getSlidingWindowMessages } from "../utils/message-window";
import { Logger } from "@nestjs/common";

const ROUTING_PROMPTS = {
  CHECK_PROMPT: `The user was asked if they want to proceed with their remaining questions.
User message: "{{content}}"
Does the user want to proceed? Answer ONLY "YES" or "NO".`
};

export interface RoutingDependencies {
  semanticRouter: SemanticRouterService;
  lightModel: ChatOpenAI;
}

const logger = new Logger("RoutingNode");

export const createRoutingNode = (deps: RoutingDependencies) => {
  return async (state: OrchestratorStateType) => {
    logger.log(`Processing state for session ${state.session_id}`);
    const { semanticRouter, lightModel } = deps;
    
    // Use sliding window for context
    const contextMessages = getSlidingWindowMessages(state.messages, 3); // Routing needs less context
    
    // 1. Semantic Routing (Broad Category)
    // Only be sticky for SOP categories (resolution, logistics) to allow topic switching for general/faq
    if (state.current_category && (state.current_category === "cancel_order" || state.current_category === "request_refund")) {
      return {}; 
    }

    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content as string;

    let isAwaitingConfirmation = state.is_awaiting_confirmation;
    let remainingIntents = state.remaining_intents;
    let hasTruncated = state.has_truncated_intents;

    // Helper to ensure at most ONE SOP intent is processed at a time
    const ensureSingleSop = (intents: any[]) => {
      const sopCategories = ["cancel_order", "request_refund"];
      let foundSop = false;
      const finalDecomposed = [];
      const finalRemaining = [];

      for (const intent of intents) {
        if (sopCategories.includes(intent.category)) {
          if (!foundSop) {
            finalDecomposed.push(intent);
            foundSop = true;
          } else {
            finalRemaining.push(intent);
          }
        } else {
          finalDecomposed.push(intent);
        }
      }
      return { finalDecomposed, finalRemaining };
    };

    // 1b. Handle Continuation if we were awaiting confirmation
    if (isAwaitingConfirmation && remainingIntents.length > 0) {
      // Use LLM to check if the user said "yes" to proceed
      const checkPrompt = ROUTING_PROMPTS.CHECK_PROMPT.replace("{{content}}", content);
      
      const checkResponse = await lightModel.invoke([
        { role: "system", content: checkPrompt }
      ]);
      
      const wantsToProceed = checkResponse.content.toString().trim().toUpperCase() === "YES";
      
      if (wantsToProceed) {
        const { finalDecomposed, finalRemaining } = ensureSingleSop(remainingIntents);
        const nextBatch = finalDecomposed.slice(0, 3);
        const furtherRemaining = [...finalDecomposed.slice(3), ...finalRemaining];
        const newHasTruncated = furtherRemaining.length > 0;
        
        return {
          decomposed_intents: nextBatch,
          remaining_intents: furtherRemaining,
          has_truncated_intents: newHasTruncated,
          is_awaiting_confirmation: false,
          layers: [{ name: "Routing", status: "completed", data: `Continued with ${nextBatch.length} remaining intents` }]
        };
      } else {
        // User said no or something else, reset the confirmation flag and remaining intents
        // but continue to normal classification below
        isAwaitingConfirmation = false;
        remainingIntents = [];
        hasTruncated = false;
      }
    }

    const { categories, decomposed } = await semanticRouter.classifyCategory(contextMessages, state.summary, state.user_orders);
    
    // 2. Prioritization and Queueing Logic
    const priorityOrder = ["escalate", "cancel_order", "request_refund", "faq", "general", "end_session"];
    
    // Sort decomposed intents based on priority
    const sortedDecomposed = [...decomposed].sort((a, b) => {
      const indexA = priorityOrder.indexOf(a.category);
      const indexB = priorityOrder.indexOf(b.category);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });

    const { finalDecomposed, finalRemaining } = ensureSingleSop(sortedDecomposed);
    const limitedDecomposed = finalDecomposed.slice(0, 3);
    const newRemainingIntents = [...finalDecomposed.slice(3), ...finalRemaining];
    const newHasTruncated = newRemainingIntents.length > 0;
    
    return {
      decomposed_intents: limitedDecomposed,
      remaining_intents: newRemainingIntents,
      has_truncated_intents: newHasTruncated,
      multi_intent_acknowledged: false,
      is_awaiting_confirmation: isAwaitingConfirmation,
      layers: [{ name: "Routing", status: "completed", data: `Routed ${limitedDecomposed.length} intents` }]
    };
  };
};
