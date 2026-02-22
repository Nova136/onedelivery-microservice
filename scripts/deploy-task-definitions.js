#!/usr/bin/env node
/**
 * Generates one task definition per microservice from the generic template, writes to
 * .aws/task-definitions/resolved/<name>.json, registers each, updates the ECS service, then
 * deregisters previous task definition revisions for that family (keeps only the new one).
 *
 * Template: .aws/task-definitions/task-definition.json (placeholder: ${MICROSERVICE_NAME})
 * Microservices: .aws/task-definitions/microservice.txt (one name per line)
 *
 * Requires: AWS CLI configured (env or profile). Env: ECS_CLUSTER (default onedelivery-cluster), AWS_REGION (default ap-southeast-1).
 *
 * Usage: node scripts/deploy-task-definitions.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TASK_DEF_FILE = path.join(ROOT, '.aws', 'task-definitions', 'task-definition.json');
const MICROSERVICE_FILE = path.join(ROOT, '.aws', 'task-definitions', 'microservice.txt');
const RESOLVED_DIR = path.join(ROOT, '.aws', 'task-definitions', 'resolved');

const ECS_CLUSTER = process.env.ECS_CLUSTER || 'onedelivery-cluster';
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';

function readMicroserviceNames() {
  const content = fs.readFileSync(MICROSERVICE_FILE, 'utf8');
  return content
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function main() {
  if (!fs.existsSync(TASK_DEF_FILE)) {
    console.error('Missing', TASK_DEF_FILE);
    process.exit(1);
  }
  if (!fs.existsSync(MICROSERVICE_FILE)) {
    console.error('Missing', MICROSERVICE_FILE);
    process.exit(1);
  }

  const template = fs.readFileSync(TASK_DEF_FILE, 'utf8');
  const names = readMicroserviceNames();
  console.log('Microservices:', names.join(', '));

  if (!fs.existsSync(RESOLVED_DIR)) {
    fs.mkdirSync(RESOLVED_DIR, { recursive: true });
  }

  for (const name of names) {
    const resolved = template.split('${MICROSERVICE_NAME}').join(name);
    const outPath = path.join(RESOLVED_DIR, `${name}.json`);
    fs.writeFileSync(outPath, resolved, 'utf8');
    console.log('Wrote', outPath);

    const absPath = path.resolve(outPath).replace(/\\/g, '/');
    const taskDefArn = execSync(
      `aws ecs register-task-definition --cli-input-json file://${absPath} --region ${AWS_REGION} --query taskDefinition.taskDefinitionArn --output text`,
      { encoding: 'utf8' }
    ).trim();

    execSync(
      `aws ecs update-service --cluster ${ECS_CLUSTER} --service ${name} --task-definition ${taskDefArn} --force-new-deployment --region ${AWS_REGION} --no-cli-pager`,
      { stdio: 'inherit' }
    );
    console.log('Registered and updated service:', name);

    const family = `onedelivery-${name}`;
    let listOut;
    try {
      listOut = execSync(
        `aws ecs list-task-definitions --family-prefix ${family} --region ${AWS_REGION} --query taskDefinitionArns --output text`,
        { encoding: 'utf8' }
      ).trim();
    } catch {
      listOut = '';
    }
    const arns = listOut ? listOut.split(/\s+/) : [];
    for (const arn of arns) {
      if (arn !== taskDefArn) {
        try {
          execSync(`aws ecs deregister-task-definition --task-definition ${arn} --region ${AWS_REGION} --no-cli-pager`, {
            stdio: 'inherit',
          });
          console.log('Deregistered previous revision:', arn.split('/').pop());
        } catch (e) {
          console.warn('Could not deregister', arn, e.message);
        }
      }
    }
  }

  console.log('Done.');
}

main();
