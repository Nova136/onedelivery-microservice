// utils libs env and mocks initialization

import { setupInMemoryMicroservices } from '@libs/utils/tests/e2e-setup';
// import { s3MockBucketLocation } from './s3-mock-config';

jest.setTimeout(300000); // 5 minutes

jest.mock('aws-sdk/clients/s3', () => {
  const AWSMock = require('mock-aws-s3');
  const path = require('path');
  const crypto = require('crypto');
  const { writeFileSync,readFile,existsSync,readFileSync,mkdirSync} = require('fs');

  const { s3MockBucketLocation } = require('./s3-mock-config');
  const s3BasPath = s3MockBucketLocation;
  AWSMock.config.basePath = s3BasPath; // Can configure a basePath for your local buckets

  let s3 = AWSMock.S3({
    params: { Bucket: 'testbuckett' },
  });
  return jest.fn(() => ({
    createPresignedPost: jest.fn().mockImplementation(s3.createPresignedPost),
    upload: jest.fn().mockImplementation(s3.putObject),
    deleteObject: jest.fn().mockImplementation(s3.deleteObject),
    // getSignedUrlPromise: jest.fn().mockImplementation(async (operation, params, callback) => {
    //   return s3.getSignedUrl(operation, params, callback).promise();
    // }),
    // createSignedUrl: jest.fn().mockImplementation(s3.createSignedUrl),
    getSignedUrlPromise: jest.fn().mockImplementation((operation: string, params: any) => {
      const searchPath = path.join(s3BasPath, params.Bucket, params.Key);
      return Promise.resolve(searchPath);
    }),
    createSignedUrl: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve('/testbuckett/7da9dd56-ec6c-4639-97e6-28853261375e-file-upload-test.txt'),
      ),
    getObject: jest.fn().mockImplementation((params) => ({
      promise: () =>
        new Promise((resolve, reject) => {
          const url = path.join(s3BasPath, params.Bucket, params.Key);
          if (existsSync(url)) {
            resolve({
              Body: readFileSync(url),
            });
          } else {
            reject('NotFound');
          }
        }),
    })),
    headObject: jest.fn().mockImplementation((search, callback) => ({
      promise: () =>
        new Promise((resolve, reject) => {
          const searchPath = path.join(s3BasPath, search.Bucket, search.Key);
          readFile(searchPath, 'utf8', (err, data) => {
            if (!err) {
              var props = {
                Key: search.Key,
                ETag: '"' + crypto.createHash('md5').update(data).digest('hex') + '"',
                ContentLength: data.length,
              };

              if (!!callback) {
                callback(null, props);
              }

              resolve(props);
            } else {
              if (err.code === 'ENOENT') {
                err.statusCode = 404;
                err.code = 'NotFound';
              }

              if (!!callback) {
                callback(err, search);
              }

              reject(err);
            }
          });
        }),
    })),
    createMultipartUpload: jest.fn().mockImplementation((params) => ({
      promise: () =>
        new Promise((resolve, reject) => {
          const searchPath = path.join(s3BasPath, params.Bucket, params.Key);
          resolve({
            UploadId: 'mock-upload-id',
            Bucket: params.Bucket,
            Key: params.Key,
            Location: searchPath,
          });
        }),
    })),
    completeMultipartUpload: jest.fn().mockImplementation((params) => ({
      promise: () =>
        new Promise((resolve, reject) => {
          const searchPath = path.join(s3BasPath, params.Bucket, params.Key);
          resolve({
            Bucket: params.Bucket,
            Key: params.Key,
            UploadId: params.UploadId,
            ETag: 'mocked-etag',
            Location: searchPath,
          });
        }),
    })),
    uploadPart: jest.fn().mockImplementation(s3.putObject),
    copyObject: jest.fn().mockImplementation((search, callback) => ({
      promise: () => {
        const bucketPath = path.join(s3MockBucketLocation, search.Bucket, path.dirname(path.join(search.Key)));
        if (!existsSync(bucketPath)) {
          mkdirSync(bucketPath, { recursive: true });
        }
        const oldPath = path.join(s3MockBucketLocation, search.CopySource);
        const newPath = path.join(s3MockBucketLocation, search.Bucket, search.Key);
        var data = readFileSync(oldPath);
        writeFileSync(newPath, data);
        return true;
      },
    })),
  }));
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
