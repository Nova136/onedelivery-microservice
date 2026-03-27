// Lightweight setup for unit tests — does NOT bootstrap microservices.

jest.setTimeout(30000);

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'mock response', tool_calls: [] }),
    bindTools: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('langsmith/traceable', () => ({
  traceable: jest.fn().mockImplementation((fn) => fn),
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
