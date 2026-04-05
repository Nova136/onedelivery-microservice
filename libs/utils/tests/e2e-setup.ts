import { createLogisticApp } from "@apps/logistics/test/setup-e2e-logistics";
import { createOrderApp } from "@apps/order/test/setup-e2e-order";
import { createPaymentApp } from "@apps/payment/test/setup-e2e-payment";
import { createAuditApp } from "@apps/audit/test/setup-e2e-audit";
import { createUserApp } from "@apps/user/test/setup-e2e-user";
import { createIncidentApp } from "@apps/incident/test/setup-e2e-incident";
import { createKnowledgeApp } from "@apps/knowledge/test/setup-e2e-knowledge";
import { createGuardianAgentApp } from "@apps/guardian-agent/test/setup-e2e-guardian-agent";
import { createLogisticsAgentApp } from "@apps/logistics-agent/test/setup-e2e-logistics-agent";
import { createOrchestratorAgentApp } from "@apps/orchestrator-agent/test/setup-e2e-orchestrator-agent";
import { createQaAgentApp } from "@apps/qa-agent/test/setup-e2e-qa-agent";
import { createResolutionAgentApp } from "@apps/resolution-agent/test/setup-e2e-resolution-agent";
import { db_config } from "@libs/utils/common-typeorm-config";
import {
    killPorts,
    setupInMemoryDataSource,
    setupTestingDataSource,
} from "@libs/utils/tests/in-memory-datasource";
import * as fs from "node:fs";
import {
    deleteS3MockBucketLocation,
    s3MockBucketLocation,
} from "./s3-mock-config";
const path = require("path");
// const { killPortProcess } = require('kill-port-process');
// const pidFromPort = require('pid-from-port');

export let logisticApp: any;
export let orderApp: any;
export let paymentApp: any;
export let auditApp: any;
export let userApp: any;
export let incidentApp: any;
export let knowledgeApp: any;
export let guardianAgentApp: any;
export let logisticsAgentApp: any;
export let orchestratorAgentApp: any;
export let resolutionAgentApp: any;
export let qaAgentApp: any;

export let token: any;

export let user_e2e_port: any;
export let audit_e2e_port: any;
export let logistics_e2e_port: any;
export let order_e2e_port: any;
export let payment_e2e_port: any;
export let incident_e2e_port: any;
export let knowledge_e2e_port: any;
export let guardian_agent_e2e_port: any;
export let logistics_agent_e2e_port: any;
export let orchestrator_agent_e2e_port: any;
export let resolution_agent_e2e_port: any;
export let qa_agent_e2e_port: any;

export let inMemPostgres: any;
export let dbInitialBackup: any;

export let batchJobApp: any;

export function setupInMemoryMicroservices(disablePGMem?: boolean) {
    let isE2eTest = false;

    try {
        beforeAll(async () => {
            const testPath = expect.getState().testPath || "";
            if (!testPath.includes("e2e")) {
                return; // Skip heavy E2E framework initialization for unit tests
            }
            isE2eTest = true;

            // Got critical security: GMS-2020-2 - execa => need to remove kill-port-process package
            await forceKillPorts();

            const configDS = {
                ...db_config,
                entities: [
                    path
                        .join(
                            __dirname,
                            "../../../",
                            "apps/**/*.entity{.ts,.js}",
                        )
                        .replace(/\\/g, "/"),
                ],
                cache: false,
            };

            if (!disablePGMem) {
                inMemPostgres = await setupInMemoryDataSource(
                    {
                        ...db_config,
                        entities: [
                            path.join(
                                __dirname,
                                "../../../",
                                "apps/**/*.entity{.ts,.js}",
                            ),
                        ],
                    },
                    [
                        "logistics",
                        "order",
                        "payment",
                        "audit",
                        "users",
                        "incident",
                        "knowledge",
                        "faq",
                        "sop",
                    ],
                );
            } else {
                inMemPostgres = await setupTestingDataSource(configDS);
            }

            audit_e2e_port = 3001;
            logistics_e2e_port = 3002;
            order_e2e_port = 3003;
            payment_e2e_port = 3004;
            user_e2e_port = 3005;
            incident_e2e_port = 3006;
            knowledge_e2e_port = 3007;
            guardian_agent_e2e_port = 3008;
            logistics_agent_e2e_port = 3009;
            orchestrator_agent_e2e_port = 3010;
            resolution_agent_e2e_port = 3011;
            qa_agent_e2e_port = 3012;

            logisticApp = await createLogisticApp();
            orderApp = await createOrderApp();
            paymentApp = await createPaymentApp();
            auditApp = await createAuditApp();
            userApp = await createUserApp();
            incidentApp = await createIncidentApp();
            knowledgeApp = await createKnowledgeApp();
            guardianAgentApp = await createGuardianAgentApp();
            logisticsAgentApp = await createLogisticsAgentApp();
            orchestratorAgentApp = await createOrchestratorAgentApp();
            resolutionAgentApp = await createResolutionAgentApp();
            qaAgentApp = await createQaAgentApp();

            //tokenFromRegister.body.LanguageId;

            dbInitialBackup = inMemPostgres.db.backup();
        });

        afterEach(async () => {
            if (!isE2eTest) return;
            // Restore database to initial state between tests
            if (inMemPostgres?.db && dbInitialBackup) {
                try {
                    inMemPostgres.db.restore(dbInitialBackup);
                } catch (error) {
                    // Ignore restore errors
                }
            }
        });

        afterAll(async () => {
            if (!isE2eTest) return;

            await Promise.allSettled([
                inMemPostgres?.ds?.close(),

                logisticApp?.app?.close(),
                logisticApp?.microservice?.close(),
                orderApp?.app?.close(),
                orderApp?.microservice?.close(),
                paymentApp?.app?.close(),
                paymentApp?.microservice?.close(),
                auditApp?.app?.close(),
                auditApp?.microservice?.close(),
                userApp?.app?.close(),
                userApp?.microservice?.close(),
                incidentApp?.app?.close(),
                incidentApp?.microservice?.close(),
                knowledgeApp?.app?.close(),
                knowledgeApp?.microservice?.close(),
                guardianAgentApp?.app?.close(),
                guardianAgentApp?.microservice?.close(),
                logisticsAgentApp?.app?.close(),
                logisticsAgentApp?.microservice?.close(),
                orchestratorAgentApp?.app?.close(),
                orchestratorAgentApp?.microservice?.close(),
                resolutionAgentApp?.app?.close(),
                resolutionAgentApp?.microservice?.close(),
                qaAgentApp?.app?.close(),
                qaAgentApp?.microservice?.close(),
            ]);

            // Wait a bit to ensure the OS has closed sockets before killing any remaining port holders
            await new Promise((resolve) => {
                setTimeout(async () => {
                    try {
                        await forceKillPorts();
                    } finally {
                        resolve(undefined);
                    }
                }, 500);
            });
        });
    } catch (error) {
        // Setup error - continue
    }

    async function forceKillPorts() {
        const allPort = [
            3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 3011,
            3012,
        ];

        // for await (const port of allPort) {
        //   await pidFromPort(port)
        //     .then(async () => port)
        //     .then(killPortProcess)
        //     .catch((error) => {});
        // }

        await killPorts(allPort);
    }
}

export async function mockBucketLocation() {
    deleteS3MockBucketLocation(s3MockBucketLocation);
    const safeBucket = path.join(process.env.FILE_AWS_SAFE_BUCKET_NAME);

    var bucketPath = path.join(
        __dirname,
        "../../..",
        "s3-mock-buckets",
        safeBucket,
    );

    if (!fs.existsSync(bucketPath)) {
        fs.mkdirSync(bucketPath, { recursive: true });
    }
    return true;
}
