// const fs = require('fs');
const path = require('path');
const { existsSync,rmdirSync,unlinkSync,readdirSync,lstatSync} = require('fs');

export const s3MockBucketLocation = path.join(__dirname, '..', '..', '..', 's3-mock-buckets');

export function deleteS3MockBucketLocation(pathArg) {
  if (existsSync(pathArg)) {
    readdirSync(pathArg).forEach(function (file) {
      var curPath = path.join(pathArg, file);
      if (lstatSync(curPath).isDirectory()) { // recurse
        deleteS3MockBucketLocation(curPath);
      } else { // delete file
        unlinkSync(curPath);
      }
    });
    rmdirSync(pathArg);
  }
}