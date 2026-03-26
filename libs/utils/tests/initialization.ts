// utils libs env and mocks initialization

import { setupInMemoryMicroservices } from '@libs/utils/tests/e2e-setup';
// import { s3MockBucketLocation } from './s3-mock-config';

jest.setTimeout(300000); // 5 minutes

jest.mock('@aws-sdk/client-s3', () => {
  // Minimal AWS SDK v3 mock to allow Jest to bootstrap.
  // If any S3 behaviors are needed by tests, we can extend the `send()` mock.
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({
        $metadata: { httpStatusCode: 200 },
      }),
    })),
  };
});

jest.mock('@aws-sdk/client-sns', () => {
  return {
    SNSClient: jest.fn().mockImplementation(() => {
      return {
        send: jest.fn().mockImplementation(async () => ({
          $metadata: {
            httpStatusCode: 200,
          },
        })),
      };
    }),
    SetSMSAttributesCommand: jest.fn().mockImplementation((params) => {
      return { ...params };
    }),
    PublishCommand: jest.fn().mockImplementation((params) => {
      return { ...params };
    }),
    AddPermissionCommand: jest.fn().mockImplementation(() => {
      return {};
    }),
    SNS: jest.fn().mockImplementation(() => {
      return {
        createPlatformEndpoint: jest.fn().mockImplementation(async () => ({
          EndpointArn: 'this is endpointarn',
        })),
      };
    }),
  };
});

jest.mock('@aws-sdk/client-sts', () => {
  return {
    STSClient: jest.fn().mockImplementation(() => {
      return {
        send: jest.fn().mockImplementation(async () => ({
          $metadata: {
            httpStatusCode: 200,
          },
        })),
      };
    }),
    AssumeRoleCommand: jest.fn().mockImplementation(() => 'true'),
  };
});

const argv = process.argv?.filter((el) => el.includes('--disablePGMem='));
const disablePGMem = !!(argv[0]?.replace('--disablePGMem=', '') === 'true');

setupInMemoryMicroservices(disablePGMem);
