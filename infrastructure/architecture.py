from diagrams import Diagram, Cluster, Edge
from diagrams.aws.network import APIGateway, ALB, VPCRouter, InternetGateway
from diagrams.aws.compute import ECS, Lambda, ECR
from diagrams.aws.database import RDS
from diagrams.onprem.client import User
from diagrams.onprem.queue import RabbitMQ

graph_attr = {
    "fontsize": "15",
    "bgcolor": "white",
    "pad": "2.0",
    "splines": "ortho",
    "nodesep": "1.8",
    "ranksep": "2.5",
    "fontname": "Helvetica",
    "compound": "true",
    "labelfloat": "false",
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

    with Cluster("API Gateway  (AWS Managed)"):
        http_api = APIGateway("HTTP API\nCORS *  ·  ANY /{proxy+}")
        ws_api   = APIGateway("WebSocket API\n$connect · sendMessage · $disconnect")

    with Cluster("AWS  ap-southeast-1"):

        ecr = ECR("Amazon ECR\n12 repositories")

        with Cluster("VPC  10.0.0.0/16"):

            with Cluster("Public Subnets  ×3 AZ"):

                igw      = InternetGateway("Internet\nGateway")
                vpc_link = VPCRouter("VPC Link")
                alb      = ALB("ALB  port 80\ninternet-facing\npath-based routing")

                with Cluster("Lambda Functions  (nodejs20.x)"):
                    lam_auth = Lambda("ws-authorizer\nJWT · RBAC · rate-limit")
                    lam_conn = Lambda("ws-connect\nstore connectionId")
                    lam_disc = Lambda("ws-disconnect\ndelete connectionId")
                    lam_send = Lambda("ws-send-message\npublish to RabbitMQ")

                with Cluster("ECS Fargate Cluster"):
                    with Cluster("HTTP Services  (11)"):
                        svcs = ECS(
                            "order :9003    logistics :9002\n"
                            "payment :9004  audit :9001\n"
                            "user :9005     incident :9006\n"
                            "knowledge :9007\n"
                            "guardian-agent :9013\n"
                            "logistics-agent :9011\n"
                            "qa-agent :9014"
                        )
                    orch = ECS("orchestrator-agent :9010\nHTTP + RMQ consumer\nWS Management API push")
                    res  = ECS("resolution-agent\nRabbitMQ-only")

            with Cluster("Private Subnets  ×3 AZ"):
                rds = RDS("RDS PostgreSQL 17\nper-service schemas\nws.connections · ws.rate_limit")

    with Cluster("External"):
        rmq = RabbitMQ("CloudAMQP  RabbitMQ\nfree tier")

    # ── HTTP flow  (blue) ──────────────────────────────────────────────────────
    client   >> Edge(label="① HTTP / HTTPS",           color="#0055AA", style="bold",   fontsize="11", penwidth="5") >> http_api
    http_api >> Edge(label="② HTTP_PROXY",             color="#0055AA",                 fontsize="11", penwidth="5") >> vpc_link
    vpc_link >> Edge(label="③",                        color="#0055AA",                 fontsize="11", penwidth="5") >> alb
    alb      >> Edge(label="④ /orchestrator-agent/*",  color="#0055AA",                 fontsize="11", penwidth="5") >> orch
    alb      >> Edge(label="④ /order/* /logistics/*",  color="#0055AA",                 fontsize="11", penwidth="5") >> svcs

    # ── WebSocket connect  (purple) ────────────────────────────────────────────
    client   >> Edge(label="① WSS ?token=JWT",         color="#7700AA", style="bold",   fontsize="11", penwidth="5") >> ws_api
    ws_api   >> Edge(label="② CUSTOM auth",            color="#7700AA",                 fontsize="11", penwidth="5") >> lam_auth
    lam_auth >> Edge(label="③ Allow/Deny + userId",    color="#7700AA",                 fontsize="11", penwidth="5") >> ws_api
    ws_api   >> Edge(label="④ $connect",               color="#7700AA",                 fontsize="11", penwidth="5") >> lam_conn
    ws_api   >> Edge(label="④ $disconnect",            color="#7700AA",                 fontsize="11", penwidth="5") >> lam_disc
    ws_api   >> Edge(label="④ sendMessage",            color="#7700AA",                 fontsize="11", penwidth="5") >> lam_send

    # ── Async reply loop  (orange) ─────────────────────────────────────────────
    lam_send >> Edge(label="⑤",  color="#AA5500", style="bold", fontsize="11", penwidth="5") >> rmq
    rmq      >> Edge(label="⑥",  color="#AA5500", style="bold", fontsize="11", penwidth="5") >> orch
    orch     >> Edge(label="⑦",  color="#AA5500", style="bold", fontsize="11", penwidth="5") >> ws_api
    ws_api   >> Edge(label="⑧",  color="#AA5500", style="bold", fontsize="11", penwidth="5") >> client

    # ── Lambda → RDS  (dashed blue) ───────────────────────────────────────────
    lam_auth >> Edge(label="rate_limit upsert",     color="#336699", style="dashed", fontsize="10", penwidth="5") >> rds
    lam_conn >> Edge(label="INSERT ws.connections", color="#336699", style="dashed", fontsize="10", penwidth="5") >> rds
    lam_disc >> Edge(label="DELETE ws.connections", color="#336699", style="dashed", fontsize="10", penwidth="5") >> rds
    lam_send >> Edge(label="SELECT userId",         color="#336699", style="dashed", fontsize="10", penwidth="5") >> rds

    # ── ECS → RDS  (dashed blue) ──────────────────────────────────────────────
    orch >> Edge(label="TypeORM", color="#336699", style="dashed", fontsize="10", penwidth="5") >> rds
    svcs >> Edge(label="TypeORM", color="#336699", style="dashed", fontsize="10", penwidth="5") >> rds

    # ── ECS / Lambda → RabbitMQ  (dashed brown) ───────────────────────────────
    svcs >> Edge(label="service events", color="#996600", style="dashed", fontsize="10", penwidth="5") >> rmq
    res  >> Edge(label="consume queue",  color="#996600", style="dashed", fontsize="10", penwidth="5") >> rmq

    # ── Internet egress via IGW  (dotted grey) ────────────────────────────────
    igw >> Edge(color="#999999", style="dotted", penwidth="5") >> ecr
    igw >> Edge(color="#999999", style="dotted", penwidth="5") >> rmq
