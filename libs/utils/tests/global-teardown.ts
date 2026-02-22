import { deleteS3MockBucketLocation, s3MockBucketLocation } from "./s3-mock-config";

export default async () => {
  deleteS3MockBucketLocation(s3MockBucketLocation);
};