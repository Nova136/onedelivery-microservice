from diagrams import Diagram, Cluster, Edge
from diagrams.aws.network import APIGateway, ALB
from diagrams.aws.compute import ECS, ECR, Lambda
from diagrams.aws.database import RDS
from diagrams.aws.management import Cloudwatch
from diagrams.onprem.client import User, Users
from diagrams.onprem.queue import RabbitMQ

graph_attr = {
    "fontsize": "14",
    "bgcolor": "white",
    "pad": "2.5",
    "splines": "curved",
    "nodesep": "1.6",
    "ranksep": "2.2",
    "fontname": "Helvetica",
    "compound": "true",
}

node_attr = {
    "fontsize": "10",
    "fontname": "Helvetica",
}

with Diagram(
    "OneDelivery — AWS Physical Architecture",
    filename="/Users/yihangchia/Documents/Coderepo/NUSISS/onedelivery-microservice/infrastructure/architecture",
    outformat="png",
    show=False,
    graph_attr=graph_attr,
    node_attr=node_attr,
    direction="TB",
):
    # ── Clients ───────────────────────────────────────────────────────────────
    browser = User("Browser / Mobile\nnova136.github.io\n/onedelivery-frontend")

    # ── AWS managed edge ──────────────────────────────────────────────────────
    with Cluster("AWS API Gateway"):
        http_api = APIGateway(
            "HTTP API\n"
            "CORS · credentials=true\n"
            "GET POST PUT PATCH DELETE HEAD\n"
            "overwrite:path → ALB"
        )
        ws_api = APIGateway(
            "WebSocket API\n"
            "stage: prod\n"
            "$connect · $disconnect · sendMessage\n"
            "CUSTOM authorizer (JWT + RBAC)"
        )
        cw = Cloudwatch("CloudWatch\nAccess Logs")

    # ── VPC ───────────────────────────────────────────────────────────────────
    with Cluster("ap-southeast-1  |  VPC  10.0.0.0/16"):

        ecr = ECR("Amazon ECR\n12 repositories")

        with Cluster("Public Subnets  ×3 AZ"):

            alb = ALB(
                "ALB  :80\n"
                "internet-facing · path-based\n"
                "/order/* /logistics/* /payment/*\n"
                "/audit/* /user/* /incident/*\n"
                "/knowledge/* /orchestrator-agent/*\n"
                "/logistics-agent/* /guardian-agent/*\n"
                "/qa-agent/*"
            )

            with Cluster("Lambda Functions  (nodejs22.x · VPC)"):
                lam_auth = Lambda("ws-authorizer\nJWT · RBAC\nrate-limit → RDS")
                lam_conn = Lambda("ws-connect\nINSERT ws.connections")
                lam_disc = Lambda("ws-disconnect\nDELETE ws.connections")

            lam_send = Lambda("ws-send-message\npublish → RabbitMQ\n(no VPC · internet access)")

            with Cluster("ECS Fargate Cluster"):

                with Cluster("Domain Services  (7)"):
                    domain = ECS(
                        "order         :9003\n"
                        "logistics      :9002\n"
                        "payment        :9004\n"
                        "audit          :9001\n"
                        "user           :9005\n"
                        "incident       :9006\n"
                        "knowledge      :9007  ← pgvector"
                    )

                with Cluster("Orchestrator Agent"):
                    orch = ECS(
                        "orchestrator-agent  :9010\n"
                        "LangGraph state machine\n"
                        "Semantic Router · PII redaction\n"
                        "Moderation · Memory"
                    )

                with Cluster("Specialist Agents  —  HTTP  (3)"):
                    logi  = ECS("logistics-agent  :9011\nGPT-4o · ETA & tracking")
                    guard = ECS("guardian-agent  :9013\nSOP compliance gate\npgvector search")
                    qa    = ECS("qa-agent  :9014\nPost-session scoring\ncron trend analysis")

                with Cluster("Specialist Agents  —  RMQ only  (1)"):
                    res = ECS(
                        "resolution-agent  :9012\n"
                        "Refund processing  GPT-4o\n"
                        "Structured JSON  ·  no HTTP"
                    )

        with Cluster("Private Subnets  ×3 AZ"):
            rds = RDS(
                "RDS PostgreSQL 17.6\n"
                "db.t3.micro  ·  gp3  20 GB\n"
                "pgvector extension  ·  SSL\n"
                "schemas: order · logistics · payment\n"
                "audit · user · incident · knowledge\n"
                "orchestrator · ws · agents"
            )

    # ── External ──────────────────────────────────────────────────────────────
    with Cluster("External"):
        rmq = RabbitMQ(
            "CloudAMQP  RabbitMQ\n"
            "AMQPS  :5671  ·  free tier\n"
            "per-service queues\n"
            "orchestrator_agent_queue"
        )

    # =========================================================================
    # ── ① HTTP REST flow  (blue) ─────────────────────────────────────────────
    # =========================================================================
    browser  >> Edge(label="HTTPS REST",  color="#0055CC", style="bold", fontsize="11", penwidth="4") >> http_api
    http_api >> Edge(label="HTTP_PROXY",  color="#0055CC", style="bold", fontsize="11", penwidth="4") >> alb
    alb      >> Edge(                     color="#0055CC",                               penwidth="3") >> orch
    alb      >> Edge(                     color="#0055CC",                               penwidth="3") >> domain
    alb      >> Edge(                     color="#0055CC",                               penwidth="3") >> logi

    # =========================================================================
    # ── ② WebSocket flow  (purple) ───────────────────────────────────────────
    # =========================================================================
    browser  >> Edge(label="WSS",         color="#7700CC", style="bold", fontsize="11", penwidth="4") >> ws_api
    ws_api   >> Edge(                     color="#7700CC",                               penwidth="3") >> lam_auth
    lam_auth >> Edge(                     color="#7700CC", style="dashed",               penwidth="2") >> ws_api
    ws_api   >> Edge(                     color="#7700CC",                               penwidth="3") >> lam_conn
    ws_api   >> Edge(                     color="#7700CC",                               penwidth="3") >> lam_disc
    ws_api   >> Edge(                     color="#7700CC",                               penwidth="3") >> lam_send
    lam_send >> Edge(                     color="#7700CC",                               penwidth="3") >> rmq
    rmq      >> Edge(                     color="#7700CC",                               penwidth="3") >> orch
    orch     >> Edge(                     color="#7700CC", style="bold",                 penwidth="4") >> ws_api

    # =========================================================================
    # ── ③ Agentic RabbitMQ routing  (orange) ─────────────────────────────────
    # =========================================================================
    orch >> Edge(color="#CC6600", penwidth="3") >> rmq
    rmq  >> Edge(color="#CC6600", penwidth="3") >> logi
    rmq  >> Edge(color="#CC6600", penwidth="3") >> res
    rmq  >> Edge(color="#CC6600", style="dashed", penwidth="2") >> qa

    # =========================================================================
    # ── ④ Guardian SOP gate  (red) ───────────────────────────────────────────
    # Resolution agent: refund approval gate
    # Logistics agent: cancellation approval gate
    # =========================================================================
    res   >> Edge(color="#CC0000", style="bold", penwidth="3") >> guard
    guard >> Edge(color="#CC0000", style="bold", penwidth="3") >> res
    logi  >> Edge(color="#CC0000", style="bold", penwidth="3") >> guard
    guard >> Edge(color="#CC0000", style="bold", penwidth="3") >> logi

    # =========================================================================
    # ── Domain service events → RabbitMQ  (brown dashed) ─────────────────────
    # =========================================================================
    domain >> Edge(color="#886600", style="dashed", penwidth="2") >> rmq

    # =========================================================================
    # ── TypeORM / pgvector → RDS  (green dashed) ─────────────────────────────
    # =========================================================================
    domain   >> Edge(color="#006633", style="dashed", penwidth="3") >> rds
    orch     >> Edge(color="#006633", style="dashed", penwidth="2") >> rds
    logi     >> Edge(color="#006633", style="dashed", penwidth="2") >> rds
    res      >> Edge(color="#006633", style="dashed", penwidth="2") >> rds
    guard    >> Edge(color="#006633", style="dashed", penwidth="2") >> rds
    lam_auth >> Edge(color="#006633", style="dashed", penwidth="2") >> rds
    lam_conn >> Edge(color="#006633", style="dashed", penwidth="2") >> rds
    lam_disc >> Edge(color="#006633", style="dashed", penwidth="2") >> rds

    # =========================================================================
    # ── CloudWatch + ECR  (grey) ──────────────────────────────────────────────
    # =========================================================================
    http_api >> Edge(color="#888888", style="dashed", penwidth="2") >> cw
    ws_api   >> Edge(color="#888888", style="dashed", penwidth="2") >> cw
    ecr      >> Edge(color="#AAAAAA", style="dotted", penwidth="2") >> orch
