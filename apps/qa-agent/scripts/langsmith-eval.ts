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

let chatHistoryLateDelivery: any[] = [
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

let chatHistoryMissingItem: any[] = [
    {
        id: "0c25af71-1110-44ff-9b62-db04e3bdee46",
        type: "human",
        content: "I need a refund for FD-0000-000001. 1 Laksa was missing.",
        toolCallId: null,
        sequence: 1,
        createdAt: "2026-03-26T13:28:16.636Z",
    },
    {
        id: "44365f10-fb43-4c1a-a7e0-d6a99e838cd2",
        type: "system",
        content:
            '--- PREVIOUS BACKEND ACTIONS ---\n[ACTION TAKEN]: Search_Internal_SOP({"intentCode":"REQUEST_REFUND"})\n[ACTION RESULT]: ### INTERNAL RULEBOOK: Asking for money back for missing or wrong items or quality issue or late delivery. ###\n\nREQUIRED DATA TO COLLECT FIRST:\n- orderId\n- issueCategory (missing_item, quality_issue, wrong_item, late_delivery)\n- description\n- items (array of objects with item name and quantity. NOTE: Only require this if the category is missing_item or wrong_item. DO NOT assume or infer quantity from singular/plural words. You MUST explicitly ask the user for the exact numeric quantity if it is not explicitly provided.)\n\nWORKFLOW STEPS (FOLLOW EXACTLY):\n1. Ensure you have gathered all the required data from the user. Ask clarifying questions if anything is missing.\n2. Empathize with the user and apologize for the mistake with their food.\n3. Execute the Route_To_Resolution tool, passing the gathered data.\n4. Wait for the Route_To_Resolution tool to return a success or rejection string.\n5. If successful, confirm the specific refund amount with the user so they know what to expect.\n6. If rejected, politely explain that the request requires a manual review and ask if they\'d like to be transferred to human support.\n7. If the user agrees to be transferred, execute the Escalate_To_Human tool.\n\nPERMITTED TOOLS:\nRoute_To_Resolution, Escalate_To_Human\n[ACTION TAKEN]: Route_To_Resolution({"action":"request_refund","userId":"83593ca4-b975-4fef-a521-4a2a8d72dd81","sessionId":"183bc374-a771-4273-9c1c-0dfa76f43e49","orderId":"FD-0000-000001","issueCategory":"missing_item","description":"1 Laksa was missing.","items":[{"name":"Laksa","quantity":1}]})\n[ACTION RESULT]: SUCCESS: Refund of $6.5 processed for order FD-0000-000001.',
        toolCallId: null,
        sequence: 2,
        createdAt: "2026-03-26T13:28:32.305Z",
    },
    {
        id: "25b3308b-da6f-4b18-940c-eda91da599fd",
        type: "ai",
        content:
            "I've processed a refund of $6.5 for the missing Laksa from order FD-0000-000001. Sorry for the inconvenience! Anything else I can help with?",
        toolCallId: null,
        sequence: 3,
        createdAt: "2026-03-26T13:28:32.316Z",
    },
    {
        id: "17cf9f40-432f-4e97-9735-e5d2c030c9fd",
        type: "human",
        content: "That's all for me! Thank you very much. I like the service",
        toolCallId: null,
        sequence: 4,
        createdAt: "2026-03-26T13:28:53.914Z",
    },
    {
        id: "56f5294a-e6c6-4688-bc31-bf6133595470",
        type: "system",
        content:
            '--- PREVIOUS BACKEND ACTIONS ---\n[ACTION TAKEN]: End_Chat_Session({"userId":"83593ca4-b975-4fef-a521-4a2a8d72dd81","sessionId":"183bc374-a771-4273-9c1c-0dfa76f43e49"})\n[ACTION RESULT]: Successfully ended the chat session. You may now politely say goodbye to the user.',
        toolCallId: null,
        sequence: 5,
        createdAt: "2026-03-26T13:28:54.501Z",
    },
];

let chatHistoryNoIssue: any[] = [
    {
        id: "04b928ab-a2b6-417b-a0b8-5fc03c6ddf54",
        type: "human",
        content: "Why is the sky blue?",
        toolCallId: null,
        sequence: 1,
        createdAt: "2026-03-26T13:50:19.759Z",
    },
    {
        id: "6650c501-fca5-4e9d-bf84-2692f7e9c586",
        type: "ai",
        content:
            "I'm sorry, but I can only assist with OneDelivery-related queries such as food orders, refunds, and general FAQ. How can I help you with your delivery today?",
        toolCallId: null,
        sequence: 2,
        createdAt: "2026-03-26T13:50:20.754Z",
    },
    {
        id: "f2441c60-e53d-4049-bceb-f028a8381faa",
        type: "human",
        content: "Can I manually change my delivery address in the app?",
        toolCallId: null,
        sequence: 3,
        createdAt: "2026-03-26T13:50:28.773Z",
    },
    {
        id: "96f1f2da-9285-405a-b2f9-64e9704cc386",
        type: "system",
        content:
            '--- PREVIOUS BACKEND ACTIONS ---\n[ACTION TAKEN]: Search_FAQ({"query":"Can I manually change my delivery address in the app?"})\n[ACTION RESULT]: ### SEARCH RESULTS ###\n[FAQ 1]\nQuestion: Can I change my delivery address after I place the order?\nAnswer: To ensure your food arrives hot and our drivers aren\'t sent off-route, you cannot manually change your delivery address in the app once the order is confirmed. If you accidentally entered the wrong address, please reach out to support immediately. If the new address is very close to the original one, we might be able to accommodate it, but if it is too far, the order may need to be cancelled.\n\n[FAQ 2]\nQuestion: How can I pay for my delivery?\nAnswer: We accept a variety of payment methods including major Credit/Debit Cards, our native in-app Wallet, and PayPal. We also accept Cash on Delivery for orders under $50. If you are paying with cash, please try to have exact change ready for your driver. Note: Some international cards or specific digital wallets might not be supported yet.\n\n[FAQ 3]\nQuestion: How much is the delivery fee and how is it calculated?\nAnswer: Your delivery fee is dynamic! It is calculated based on a few factors: the distance between the restaurant and your drop-off location, the time of day, and how busy our delivery network is right now (surge pricing). You will always see the exact delivery fee upfront on the checkout page before you confirm your order.',
        toolCallId: null,
        sequence: 4,
        createdAt: "2026-03-26T13:50:35.209Z",
    },
    {
        id: "a5d4c3f0-49da-4f77-a0f6-7abbf0ccac32",
        type: "ai",
        content:
            "No, you cannot manually change your delivery address in the app once the order is confirmed. If you entered the wrong address, it's best to reach out to support immediately. If the new address is very close to the original one, they might be able to accommodate it, but if it's too far, the order may need to be cancelled.",
        toolCallId: null,
        sequence: 5,
        createdAt: "2026-03-26T13:50:35.220Z",
    },
    {
        id: "710bdc22-c8e0-4cf7-9811-5c4fdda9f410",
        type: "human",
        content: "That's all for me. Thank you for the service !",
        toolCallId: null,
        sequence: 6,
        createdAt: "2026-03-26T13:50:49.893Z",
    },
    {
        id: "c4b59b74-9e06-49ea-b976-2433b3e45081",
        type: "system",
        content:
            '--- PREVIOUS BACKEND ACTIONS ---\n[ACTION TAKEN]: End_Chat_Session({"userId":"83593ca4-b975-4fef-a521-4a2a8d72dd81","sessionId":"45e7c5f5-3425-4432-b3c3-c44567f9711a"})\n[ACTION RESULT]: Successfully ended the chat session. You may now politely say goodbye to the user.',
        toolCallId: null,
        sequence: 7,
        createdAt: "2026-03-26T13:50:51.730Z",
    },
    {
        id: "858dec34-46f4-4dd9-8493-c0bc5772be28",
        type: "ai",
        content: "Thank you for contacting OneDelivery. Have a great day!",
        toolCallId: null,
        sequence: 8,
        createdAt: "2026-03-26T13:50:51.740Z",
    },
];

const chatHistoryBySessionId: Record<string, any[]> = {
    "f9df1095-5165-40a7-a364-7e3e925e138d": chatHistoryLateDelivery,
    "183bc374-a771-4273-9c1c-0dfa76f43e49": chatHistoryMissingItem,
    "45e7c5f5-3425-4432-b3c3-c44567f9711a": chatHistoryNoIssue,
};

const mockCommonService = {
    sendViaRMQ: async (client: any, pattern: any, data: any) => {
        // This intercepts the call inside processChatMessageBySessionId
        if (pattern.cmd === "user.chat.getHistory") {
            const messages = chatHistoryBySessionId[data.sessionId] || [];
            return {
                id: data.sessionId,
                userId: data.userId,
                status: "CLOSED",
                reviewed: false,
                messages,
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
const BASE_DATASET_NAME = "OneDelivery-QA-Agent-Dataset";

const testCases = [
    {
        inputs: {
            userId: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
            sessionId: "f9df1095-5165-40a7-a364-7e3e925e138d",
            message: `Please review this chat session. (ID: f9df1095-5165-40a7-a364-7e3e925e138d, User: 83593ca4-b975-4fef-a521-4a2a8d72dd81). 
        
        CRITICAL CHECK: Is the user reporting a mistake we made, or just asking a question?
        - If they are asking a question (FAQ/Policy): CALL save_sentiment ONLY.
        - If they are reporting a failure (Late/Wrong/Broken): CALL log_incident AND save_sentiment.
        
        Do not log incidents for address change requests or general inquiries.`, // This is the history that will be "moved" to the mock
            // i should change this to something else right ?
        },
        outputs: {
            expected_tool: "log_incident",
            expected_sentiment_tool: "save_sentiment",
            expected_type: "LATE_DELIVERY",
            expected_order_id: "FD-0000-000002",
        },
        metadata: { category: "incident_logging" },
    },
    {
        inputs: {
            userId: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
            sessionId: "183bc374-a771-4273-9c1c-0dfa76f43e49",
            message: `Please review this chat session. (ID: 183bc374-a771-4273-9c1c-0dfa76f43e49, User: 83593ca4-b975-4fef-a521-4a2a8d72dd81). 
        
        CRITICAL CHECK: Is the user reporting a mistake we made, or just asking a question?
        - If they are asking a question (FAQ/Policy): CALL save_sentiment ONLY.
        - If they are reporting a failure (Late/Wrong/Broken): CALL log_incident AND save_sentiment.
        
        Do not log incidents for address change requests or general inquiries.`, // This is the history that will be "moved" to the mock
            // i should change this to something else right ?
        },
        outputs: {
            expected_tool: "log_incident",
            expected_sentiment_tool: "save_sentiment",
            expected_type: "MISSING_ITEMS",
            expected_order_id: "FD-0000-000001",
        },
        metadata: { category: "incident_logging" },
    },

    {
        inputs: {
            userId: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
            sessionId: "45e7c5f5-3425-4432-b3c3-c44567f9711a",
            message: `Please review this chat session. (ID: 45e7c5f5-3425-4432-b3c3-c44567f9711a, User: 83593ca4-b975-4fef-a521-4a2a8d72dd81). 
        
        CRITICAL CHECK: Is the user reporting a mistake we made, or just asking a question?
        - If they are asking a question (FAQ/Policy): CALL save_sentiment ONLY.
        - If they are reporting a failure (Late/Wrong/Broken): CALL log_incident AND save_sentiment.
        
        Do not log incidents for address change requests or general inquiries.`, // This is the history that will be "moved" to the mock
            // i should change this to something else right ?
        },
        outputs: {
            expected_tool: "none",
            expected_sentiment_tool: "save_sentiment",
            expected_type: "none",
            expected_order_id: "none",
        },
        metadata: { category: "incident_logging" },
    },
];

/**
 * OVERRIDE TOOLS WITH REALISTIC MOCKS
 * This ensures your test logs look like your server logs.
 */
qaService["tools"] = {
    log_incident: {
        invoke: async (args: any) => {
            console.log(`[Test-Tool] log_incident called with:`, args);
            return JSON.stringify({
                summary: "Incident logged successfully.",
                data: {
                    success: true,
                    incidentId:
                        "test-uuid-" + Math.random().toString(36).substr(2, 9),
                    type: args.type || "LATE_DELIVERY",
                    orderId: args.orderId || "UNKNOWN",
                },
            });
        },
    } as any,
    save_sentiment: {
        invoke: async (args: any) => {
            console.log(`[Test-Tool] save_sentiment called with:`, args);
            return JSON.stringify({
                summary: "Sentiment saved successfully.",
                data: { success: true },
            });
        },
    } as any,
};

/**
 * 3. THE TARGET FUNCTION (Updated to return tool metadata)
 */
async function target(inputs: any) {
    // Capture tool calls in a local array for this specific run
    const toolCallsMade: any[] = [];

    // Temporarily override tools to capture their arguments
    const originalLog = qaService["tools"].log_incident;
    const originalSave = qaService["tools"].save_sentiment;

    qaService["tools"].log_incident = {
        invoke: async (args: any) => {
            toolCallsMade.push({ tool: "log_incident", args });
            return originalLog.invoke(args);
        },
    } as any;

    qaService["tools"].save_sentiment = {
        invoke: async (args: any) => {
            toolCallsMade.push({ tool: "save_sentiment", args });
            return originalSave.invoke(args);
        },
    } as any;

    try {
        const result = await qaService.processChatMessageBySessionId(
            inputs.userId,
            inputs.sessionId,
        );

        // RETURN EVERYTHING to LangSmith so the Evaluator can see it
        return {
            output: result,
            toolCalls: toolCallsMade,
        };
    } catch (error) {
        return { output: `Error: ${error.message}`, toolCalls: [] };
    } finally {
        // Restore original tools to prevent memory leaks/state pollution
        qaService["tools"].log_incident = originalLog;
        qaService["tools"].save_sentiment = originalSave;
    }
}

/**
 * 3. THE EVALUATOR (LLM Judge)
 */
const qaEvaluator = async ({ run, example }: any) => {
    const agentOutput = run.outputs?.output || "";
    const tools = run.outputs?.toolCalls || [];

    const llm = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });
    const structuredLlm = llm.withStructuredOutput(
        z.object({
            passed: z.boolean(),
            reasoning: z.string(),
        }),
    );

    //   const prompt = `
    //     Check the QA Agent's performance. The agent was given the following user message and chat history:
    //     User Message: "${example.inputs.message}"
    //     Chat History: ${JSON.stringify(chatHistoryBySessionId[example.inputs.sessionId])}
    //     Expected Incident Behavior: ${example.outputs.expected_tool}
    //     Expected Sentiment Tool: ${example.outputs.expected_sentiment_tool}

    //     Agent Summary: "${agentOutput}"
    //     Tools Triggered by Agent: ${JSON.stringify(tools)}

    //     Evaluation Criteria:
    //     1. If expected incident behavior is 'none', then 'log_incident' must NOT be called.
    //     2. If expected incident behavior is 'log_incident', then 'log_incident' MUST be called.
    //     3. If 'log_incident' was called, was the incident type provided as expected (expected incident type: ${example.outputs.expected_type})?
    //     3. Was 'save_sentiment' called with a sentiment score between -1.0 and 1.0?
    //     `;
    const prompt = `
    Role: Strict QA Auditor
    
    Data to Review:
    - User Request: "${example.inputs.message}"
    - Agent Summary: "${agentOutput}"
    - Tool Calls Made: ${JSON.stringify(tools)}

    Golden Truth (Expected):
    - Incident Tool Needed: ${example.outputs.expected_tool}
    - Expected Type: ${example.outputs.expected_type}
    - Expected Order ID: ${example.outputs.expected_order_id}

    Pass/Fail Criteria:
    1. If Expected Incident is 'none', Tool Calls MUST NOT contain 'log_incident'.
    2. If Expected Incident is 'log_incident', Tool Calls MUST contain 'log_incident' with the correct 'type' and 'orderId'.
    3. 'save_sentiment' MUST be called in all cases with a score between -1.0 and 1.0.

    Compare the "Tool Calls Made" against the "Golden Truth". Do not use outside intuition about whether a cancellation "should" be an incident; follow the Golden Truth strictly.
`;
    const result = await structuredLlm.invoke(prompt);

    console.log("prompt :: ", prompt);
    return {
        key: "qa_logic_accuracy",
        score: result.passed ? 1 : 0,
        comment: result.reasoning,
    };
};

/**
 * 5. MAIN EXECUTION
 */
async function main() {
    const client = new Client();
    const datasetName = `${BASE_DATASET_NAME}-${Date.now()}`;

    // Always create a fresh dataset for each run so examples match local testCases exactly.
    console.log(`Creating dataset: ${datasetName}...`);
    const dataset = await client.createDataset(datasetName);
    for (const tc of testCases) {
        await client.createExample(tc.inputs, tc.outputs, {
            datasetId: dataset.id,
            metadata: tc.metadata,
        });
    }

    console.log("--- Starting Evaluation ---");
    await evaluate(target, {
        data: datasetName,
        evaluators: [qaEvaluator],
        experimentPrefix: "qa-agent-history-fix",
        client,
    });
    console.log("--- Evaluation Complete ---");
}

main().catch(console.error);
