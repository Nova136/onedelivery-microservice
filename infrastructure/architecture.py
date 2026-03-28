from diagrams import Diagram, Cluster, Edge
from diagrams.aws.network import APIGateway, ALB, VPCRouter, InternetGateway
from diagrams.aws.compute import ECS, Lambda, ECR
from diagrams.aws.database import RDS
from diagrams.onprem.client import User
from diagrams.onprem.queue import RabbitMQ

graph_attr = {
    "fontsize": "18",
    "bgcolor": "white",
    "pad": "1.0",
    "splines": "curved",
    "nodesep": "1.0",
    "ranksep": "1.5",
    "fontname": "Helvetica",
    "rankdir": "TB",
}

node_attr = {
    "fontsize": "11",
    "fontname": "Helvetica",
}

with Diagram(
    "OneDelivery — AWS Architecture",
    filename="/Users/yihangchia/Documents/Coderepo/NUSISS/onedelivery-microservice/infrastructure/architecture",
    outformat="png",
    show=False,
    graph_attr=graph_attr,
    node_attr=node_attr,
    direction="TB",
):
    client = User("Client\nBrowser / Mobile")

    # ── Top: API Gateway layer ──────────────────────────────────────
    with Cluster("API Gateway  (AWS Managed Service)"):
        http_api = APIGateway("HTTP API\nCORS *  ·  ANY /{proxy+}")
        ws_api   = APIGateway("WebSocket API\n$connect · sendMessage · $disconnect")

    with Cluster("AWS  ap-southeast-1"):
        with Cluster("VPC  10.0.0.0/16"):

            with Cluster("Public Subnets  ×3 AZ  (10.0.0/20, 10.0.16/20, 10.0.32/20)"):

                igw      = InternetGateway("Internet Gateway")
                vpc_link = VPCRouter("VPC Link\nHTTP API → ALB")
                alb      = ALB("Application Load Balancer\nport 80  ·  internet-facing\npath-based routing")

                with Cluster("Lambda Functions  (nodejs20.x)"):
                    lam_auth = Lambda("ws-authorizer\nJWT · RBAC · rate-limit")
                    lam_conn = Lambda("ws-connect\nstore connectionId")
                    lam_disc = Lambda("ws-disconnect\ndelete connectionId")
                    lam_send = Lambda("ws-send-message\npublish to RabbitMQ")

                with Cluster("ECS Fargate Cluster"):
                    orch = ECS("orchestrator-agent  :9010\nHTTP  +  RMQ consumer\nWS push-back callback")

                    with Cluster("HTTP Services  (11 services)"):
                        svcs = ECS(
                            "order :9003   logistics :9002   payment :9004\n"
                            "audit :9001   user :9005         incident :9006\n"
                            "knowledge :9007   guardian-agent :9013\n"
                            "logistics-agent :9011   qa-agent :9014"
                        )

                    res = ECS("resolution-agent\nRabbitMQ-only  (no HTTP)")

            with Cluster("Private Subnets  ×3 AZ  (10.0.64/20, 10.0.80/20, 10.0.96/20)"):
                rds = RDS("RDS PostgreSQL 17\nper-service schemas\nws.connections  ·  ws.rate_limit")

    with Cluster("External Services"):
        rmq = RabbitMQ("CloudAMQP  RabbitMQ\narmadillo.rmq.cloudamqp.com\nfree tier")
        ecr = ECR("Amazon ECR\n12 repositories")

    # ── HTTP flow ──────────────────────────────────────────────────
    client >> Edge(label="① HTTP/HTTPS", color="#0055AA", style="bold", fontsize="11") >> http_api
    http_api >> Edge(label="② HTTP_PROXY", color="#0055AA", fontsize="11") >> vpc_link
    vpc_link >> Edge(label="③", color="#0055AA", fontsize="11") >> alb
    alb >> Edge(label="④ /orchestrator-agent/*", color="#0055AA", fontsize="11") >> orch
    alb >> Edge(label="④ /order/* /logistics/* ...", color="#0055AA", fontsize="11") >> svcs

    # ── WebSocket connect ──────────────────────────────────────────
    client >> Edge(label="① WSS  ?token=JWT", color="#7700AA", style="bold", fontsize="11") >> ws_api
    ws_api >> Edge(label="② CUSTOM auth", color="#7700AA", fontsize="11") >> lam_auth
    lam_auth >> Edge(label="③ Allow/Deny  +  userId", color="#7700AA", fontsize="11") >> ws_api
    ws_api >> Edge(label="④ $connect", color="#7700AA", fontsize="11") >> lam_conn
    ws_api >> Edge(label="④ $disconnect", color="#7700AA", fontsize="11") >> lam_disc
    ws_api >> Edge(label="④ sendMessage", color="#7700AA", fontsize="11") >> lam_send

    # ── Async WS reply loop ────────────────────────────────────────
    lam_send >> Edge(label="⑤ publish  ws.chat", color="#AA5500", style="bold", fontsize="11") >> rmq
    rmq      >> Edge(label="⑥ consume  ws.chat", color="#AA5500", style="bold", fontsize="11") >> orch
    orch     >> Edge(label="⑦ WS Management API\nPOST @connections/:id", color="#AA5500", style="bold", fontsize="11") >> ws_api
    ws_api   >> Edge(label="⑧ push  reply + sessionId", color="#AA5500", style="bold", fontsize="11") >> client

    # ── Lambda ↔ RDS ───────────────────────────────────────────────
    lam_auth >> Edge(label="rate_limit upsert",    color="#336699", style="dashed", fontsize="10") >> rds
    lam_conn >> Edge(label="INSERT ws.connections", color="#336699", style="dashed", fontsize="10") >> rds
    lam_disc >> Edge(label="DELETE ws.connections", color="#336699", style="dashed", fontsize="10") >> rds
    lam_send >> Edge(label="SELECT userId",          color="#336699", style="dashed", fontsize="10") >> rds

    # ── ECS ↔ RDS ──────────────────────────────────────────────────
    orch >> Edge(label="TypeORM", color="#336699", style="dashed", fontsize="10") >> rds
    svcs >> Edge(label="TypeORM", color="#336699", style="dashed", fontsize="10") >> rds

    # ── ECS ↔ RabbitMQ ─────────────────────────────────────────────
    svcs >> Edge(label="service events", color="#996600", style="dashed", fontsize="10") >> rmq
    res  >> Edge(label="consume queue",  color="#996600", style="dashed", fontsize="10") >> rmq

    # ── Internet egress via IGW ─────────────────────────────────────
    igw >> Edge(label="ECR image pulls",   color="#999999", style="dotted", fontsize="10") >> ecr
    igw >> Edge(label="RabbitMQ egress",   color="#999999", style="dotted", fontsize="10") >> rmq
