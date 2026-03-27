// Lightweight setup for unit tests — does NOT bootstrap microservices.

jest.setTimeout(30000);

// Annotation is both callable (Annotation<T>({...})) and has a .Root method
const mockAnnotation = jest.fn().mockReturnValue({ reducer: jest.fn(), default: jest.fn() });
mockAnnotation.Root = jest.fn().mockReturnValue({});

jest.mock('@langchain/langgraph', () => ({
  StateGraph: jest.fn().mockImplementation(() => ({
    addNode: jest.fn().mockReturnThis(),
    addEdge: jest.fn().mockReturnThis(),
    addConditionalEdges: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({ messages: [] }),
      getGraph: jest.fn().mockReturnValue({ drawMermaid: jest.fn().mockReturnValue('') }),
    }),
  })),
  START: 'START',
  END: 'END',
  Annotation: mockAnnotation,
}));

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockReturnValue({
      formatMessages: jest.fn().mockResolvedValue([]),
      pipe: jest.fn().mockReturnValue({ invoke: jest.fn().mockResolvedValue({ content: 'ok' }) }),
    }),
  },
  MessagesPlaceholder: jest.fn(),
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'mock response', tool_calls: [] }),
    bindTools: jest.fn().mockReturnThis(),
    withStructuredOutput: jest.fn().mockReturnThis(),
    pipe: jest.fn().mockReturnValue({ invoke: jest.fn().mockResolvedValue({ safe: true }) }),
  })),
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  })),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 } }),
  })),
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 } }),
  })),
  PublishCommand: jest.fn().mockImplementation((params) => params),
  SetSMSAttributesCommand: jest.fn().mockImplementation((params) => params),
  AddPermissionCommand: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 } }),
  })),
  AssumeRoleCommand: jest.fn().mockImplementation(() => 'true'),
}));
