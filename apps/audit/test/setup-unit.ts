// Lightweight setup for unit tests — does NOT bootstrap microservices.
// AWS SDK modules are mocked to prevent real network calls during unit tests.

jest.setTimeout(30000);

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
