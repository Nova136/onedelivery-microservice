import "dotenv/config";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// Import your actual service and LangChain message types
import { AppService } from "../src/app.service";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
} from "@langchain/core/messages";


let currentTestHistory: any[] = [
  {
    id: "7c962672-822c-4fe5-b240-0772a54593eb",
    type: "human",
    content: "Hi",
    toolCallId: null,
    sequence: 1,
    createdAt: "2026-03-25T14:12:03.579Z",
  },
  {
    id: "f5b34c89-2841-4a14-8f5c-bbed81241e9b",
    type: "ai",
    content:
      "I'm sorry, but I can only assist with OneDelivery-related queries such as food orders, refunds, and general FAQ. How can I help you with your delivery today?",
    toolCallId: null,
    sequence: 2,
    createdAt: "2026-03-25T14:12:04.227Z",
  },
  {
    id: "69febd74-73a1-4c70-9583-1488c96477d6",
    type: "human",
    content:
      "What are your delivery hours? Also, cancel my order FD-0000-000002 right now! It is too slow",
    toolCallId: null,
    sequence: 3,
    createdAt: "2026-03-25T14:12:13.702Z",
  },
  {
    id: "a97f9323-854c-4234-a30a-e3cf65ef31d9",
    type: "system",
    content:
      '--- PREVIOUS BACKEND ACTIONS ---\n[ACTION TAKEN]: Search_Internal_SOP({"intentCode":"CANCEL_ORDER"})\n[ACTION RESULT]: ### INTERNAL RULEBOOK: Cancelling an ongoing order. ###\n\nREQUIRED DATA TO COLLECT FIRST:\n- orderId\n- reason for cancellation (extract this from the user\'s message if provided naturally, e.g., \'I don\'t want it anymore\', \'taking too long\')\n\nWORKFLOW STEPS (FOLLOW EXACTLY):\n1. Ensure you have gathered all the required data from the user. If the user already provided a reason, proceed immediately. If the reason for cancellation is not provided, you MUST ask the user for it (but let them know they can skip it).\n2. Empathize with the user\'s need to cancel.\n3. Execute the Route_To_Logistics tool, passing the gathered data.\n4. Wait for the Route_To_Logistics tool to return a success or rejection string.\n5. If successful, confirm to the user that the order has been cancelled and their refund is processing.\n6. If rejected, politely explain why and ask if they\'d like to be transferred to human support.\n7. If the user agrees to be transferred, execute the Escalate_To_Human tool.\n\nPERMITTED TOOLS:\nRoute_To_Logistics, Escalate_To_Human\n[ACTION TAKEN]: Route_To_Logistics({"action":"cancel_order","userId":"83593ca4-b975-4fef-a521-4a2a8d72dd81","sessionId":"f9df1095-5165-40a7-a364-7e3e925e138d","orderId":"FD-0000-000002","description":"It is too slow"})\n[ACTION RESULT]: SUCCESS: Order FD-0000-000002 has been successfully cancelled and a refund has been initiated.',
    toolCallId: null,
    sequence: 4,
    createdAt: "2026-03-25T14:12:28.898Z",
  },
  {
    id: "c7b1c853-4ad5-40c5-9cf0-4982082e52c1",
    type: "ai",
    content:
      "Done! I've cancelled order FD-0000-000002 and your refund is on its way. As for delivery hours, I can't provide that information right now. Anything else I can help with?",
    toolCallId: null,
    sequence: 5,
    createdAt: "2026-03-25T14:12:28.909Z",
  },
  {
    id: "8ef5c2b4-52b0-46bc-a668-7490e9dc8b86",
    type: "human",
    content: "That's all for me. Thanks !",
    toolCallId: null,
    sequence: 6,
    createdAt: "2026-03-25T14:13:05.347Z",
  },
  {
    id: "0e01f00c-2fbc-437e-bf08-7633d9aba6a6",
    type: "system",
    content:
      '--- PREVIOUS BACKEND ACTIONS ---\n[ACTION TAKEN]: End_Chat_Session({"userId":"83593ca4-b975-4fef-a521-4a2a8d72dd81","sessionId":"f9df1095-5165-40a7-a364-7e3e925e138d"})\n[ACTION RESULT]: Successfully ended the chat session. You may now politely say goodbye to the user.',
    toolCallId: null,
    sequence: 7,
    createdAt: "2026-03-25T14:13:06.695Z",
  },
  {
    id: "9d4cd199-42aa-4613-bf29-6f0a56ecd403",
    type: "ai",
    content: "Thank you for contacting OneDelivery. Have a great day!",
    toolCallId: null,
    sequence: 8,
    createdAt: "2026-03-25T14:13:06.709Z",
  },
];

const mockCommonService = {
  sendViaRMQ: async (client: any, pattern: any, data: any) => {
    // This intercepts the call inside processChatMessageBySessionId
    if (pattern.cmd === "user.chat.getHistory") {
      return {
        id: data.sessionId,
        userId: data.userId,
        status: "CLOSED",
        reviewed: false,
        messages: currentTestHistory,
      };
    }
    // Mock for user.chat.updateSession (marking as reviewed)
    return { success: true };
  },
};

// Mock other dependencies required by the AppService constructor
const mockMemoryService = {
  getHistory: async () => [],
  saveHistory: async () => {},
};

const mockClientProxy = {
  send: () => ({ subscribe: () => {} }),
  emit: () => {},
};

// Instantiate the actual service logic
const qaService = new AppService(
  mockMemoryService as any,
  mockCommonService as any,
  mockClientProxy as any, // INCIDENT_SERVICE
  mockClientProxy as any, // USER_SERVICE
);

/**
 * 2. DATASET DEFINITION
 */
const DATASET_NAME = "OneDelivery-QA-Agent-Dataset";

const testCases = [
  {
    inputs: {
      userId: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
      sessionId: "f9df1095-5165-40a7-a364-7e3e925e138d",
      message: "Please review this chat session. Session ID: 83593ca4-b975-4fef-a521-4a2a8d72dd81. User ID: f9df1095-5165-40a7-a364-7e3e925e138d. Extract the order ID from the conversation if mentioned. Log any incidents using log_incident if applicable. Then call save_sentiment with the overall sentiment score for this session.",
      // This is the history that will be "moved" to the mock
      // i should change this to something else right ?
    },
    outputs: {
      expected_tool: "log_incident",
      expected_type: "LATE_DELIVERY",
      expected_order_id: "FD-0000-000002",
    },
    metadata: { category: "incident_logging" },
  },
];

/**
 * OVERRIDE TOOLS WITH REALISTIC MOCKS
 * This ensures your test logs look like your server logs.
 */
qaService['tools'] = {
  log_incident: {
    invoke: async (args: any) => {
      console.log(`[Test-Tool] log_incident called with:`, args);
      return JSON.stringify({
        summary: "Incident logged successfully.",
        data: {
          success: true,
          incidentId: "test-uuid-" + Math.random().toString(36).substr(2, 9),
          type: args.type || "LATE_DELIVERY",
          orderId: args.orderId || "UNKNOWN"
        }
      });
    }
  } as any,
  save_sentiment: {
    invoke: async (args: any) => {
      console.log(`[Test-Tool] save_sentiment called with:`, args);
      return JSON.stringify({ summary: "Sentiment saved successfully.", data: { success: true } });
    }
  } as any
};

/**
 * 3. THE TARGET FUNCTION (The Predictor)
 */
async function target(inputs: any) {
  /**
   * STEP 1: Move the history from the dataset to the mock bridge.
   * This ensures the Service 'sees' the messages for this specific test case.
   */
//   this.currentTestHistory = this.currentTestHistory || [];

  /**
   * STEP 2: Execute the actual service method.
   */
  try {
    const result = await qaService.processChatMessageBySessionId(
      inputs.userId,
      inputs.sessionId,
    );
    return { output: result };
  } catch (error) {
    console.error(`Error processing session ${inputs.sessionId}:`, error);
    return { output: `Error: ${error.message}` };
  }
}

const qaEvaluator = async ({ run, example }: any) => {
  const agentOutput = run.outputs?.output || "";
  
  const llm = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });
  const structuredLlm = llm.withStructuredOutput(
    z.object({
      passed: z.boolean(),
      reasoning: z.string(),
    }),
  );

  const prompt = `
    Review the QA Agent's performance.
    Agent Result String: "${agentOutput}"
    Expected Action: Log an incident for order ${example.outputs.expected_order_id}

    Criteria:
    1. Does the output indicate an incident was logged?
    2. Does it confirm the review is complete?
  `;

  const result = await structuredLlm.invoke(prompt);
  return {
    key: "incident_logged_correctly",
    score: result.passed ? 1 : 0,
    comment: result.reasoning,
  };
};

/**
 * 5. MAIN EXECUTION
 */
async function main() {
  const client = new Client();

  // Create or update dataset
  try {
    await client.readDataset({ datasetName: DATASET_NAME });
    console.log(`Dataset "${DATASET_NAME}" found.`);
  } catch {
    console.log(`Creating dataset: ${DATASET_NAME}...`);
    const dataset = await client.createDataset(DATASET_NAME);
    for (const tc of testCases) {
      await client.createExample(tc.inputs, tc.outputs, {
        datasetId: dataset.id,
        metadata: tc.metadata,
      });
    }
  }

  console.log("--- Starting Evaluation ---");
  await evaluate(target, {
    data: DATASET_NAME,
    evaluators: [qaEvaluator],
    experimentPrefix: "qa-agent-history-fix",
    client,
  });
  console.log("--- Evaluation Complete ---");
}

main().catch(console.error);
