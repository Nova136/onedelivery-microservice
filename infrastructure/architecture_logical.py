from diagrams import Diagram, Cluster, Edge
from diagrams.aws.network import APIGateway
from diagrams.aws.ml import Sagemaker
from diagrams.aws.compute import ECS
from diagrams.onprem.client import User
from diagrams.onprem.queue import RabbitMQ
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.auth import Oauth2Proxy
from diagrams.programming.language import NodeJS, TypeScript
from diagrams.programming.framework import React
from diagrams.saas.logging import Datadog

graph_attr = {
    "fontsize": "14",
    "bgcolor": "white",
    "pad": "2.5",
    "splines": "ortho",
    "nodesep": "1.8",
    "ranksep": "2.4",
    "fontname": "Helvetica",
    "compound": "true",
}

node_attr = {
    "fontsize": "10",
    "fontname": "Helvetica",
}

with Diagram(
    "OneDelivery — Logical Architecture",
    filename="/Users/yihangchia/Documents/Coderepo/NUSISS/onedelivery-microservice/infrastructure/architecture_logical",
    outformat="png",
    show=False,
    graph_attr=graph_attr,
    node_attr=node_attr,
    direction="TB",
):
    # =========================================================================
    # Row 1 — Presentation
    # =========================================================================
    with Cluster("Presentation Layer"):
        client   = User("Browser / Mobile")
        frontend = React("Frontend SPA\nGitHub Pages")

    # =========================================================================
    # Row 2 — Gateway
    # =========================================================================
    with Cluster("Gateway Layer"):
        http_api = APIGateway(
            "HTTP REST API\n"
            "CORS · JWT verify\n"
            "GET POST PUT PATCH DELETE HEAD"
        )
        ws_api = APIGateway(
            "WebSocket API  (prod)\n"
            "$connect · sendMessage · $disconnect\n"
            "CUSTOM authorizer  JWT + RBAC"
        )

    # =========================================================================
    # Row 3 — Orchestration
    # =========================================================================
    with Cluster("AI Orchestration  (orchestrator-agent  :9010)"):
        orch = NodeJS("Orchestrator\nLangGraph state machine")

        with Cluster("Inbound Pipeline"):
            privacy    = TypeScript("Privacy Service\nPII redaction")
            moderation = TypeScript("Moderation Guard\nInput · Output eval")

        router = TypeScript(
            "Semantic Router  (GPT-4o-mini)\n"
            "ACTION · FAQ · ESCALATE · END_SESSION"
        )

    # =========================================================================
    # Row 4 — AI Agents
    # =========================================================================
    with Cluster("AI Agent Layer"):
        with Cluster("Core Agents"):
            action_agent = NodeJS(
                "Action Agent\n"
                "GPT-4o\n"
                "Routes to specialists"
            )
            faq_agent = NodeJS(
                "FAQ Agent\n"
                "GPT-4o-mini\n"
                "Semantic FAQ / SOP Q&A"
            )

        with Cluster("Specialist Agents"):
            logi_agent = NodeJS("Logistics Agent  :9011\nGPT-4o · ETA & tracking")
            res_agent  = NodeJS("Resolution Agent  :9012\nGPT-4o · Refund  RMQ-only")
            guardian   = NodeJS("Guardian Agent  :9013\nSOP compliance gate")
            qa_agent   = NodeJS("QA Agent  :9014\nSession scoring · cron")

    # =========================================================================
    # Row 5 — Domain Services  +  Event Bus
    # =========================================================================
    with Cluster("Domain Service Layer  (NestJS · TypeORM · per-schema)"):
        domain = ECS(
            "order  :9003    logistics  :9002\n"
            "payment  :9004  audit  :9001\n"
            "user  :9005     incident  :9006\n"
            "knowledge  :9007  ← pgvector"
        )

    event_bus = RabbitMQ(
        "RabbitMQ  (CloudAMQP  AMQPS)\n"
        "Async event bus\n"
        "per-service queues"
    )

    # =========================================================================
    # Row 6 — Data  +  External AI
    # =========================================================================
    with Cluster("Data Layer"):
        pg = PostgreSQL(
            "PostgreSQL 17  +  pgvector\n"
            "Isolated schemas per service\n"
            "Vector similarity  threshold 0.25\n"
            "ws.connections · ws.rate_limit"
        )

    with Cluster("External AI Services"):
        gpt4o      = Sagemaker("OpenAI  GPT-4o\nAction · Resolution\nLogistics · Guardian")
        gpt4o_mini = Sagemaker("OpenAI  GPT-4o-mini\nSemantic Router · FAQ\nQA Agent")
        langsmith  = Datadog("LangSmith\nLLM tracing · eval\nCI pipeline")

    # =========================================================================
    # EDGES — no labels except at the very top entry points
    # =========================================================================

    # ── HTTP REST  (blue, bold) ───────────────────────────────────────────────
    client   >> Edge(label="HTTPS REST", color="#0055CC", style="bold", fontsize="11", penwidth="4") >> http_api
    frontend >> Edge(                    color="#0055CC", style="bold",                penwidth="3") >> http_api
    http_api >> Edge(                    color="#0055CC",                               penwidth="3") >> orch
    http_api >> Edge(                    color="#0055CC",                               penwidth="3") >> domain

    # ── WebSocket  (purple, bold) ─────────────────────────────────────────────
    client   >> Edge(label="WSS",        color="#7700CC", style="bold", fontsize="11", penwidth="4") >> ws_api
    frontend >> Edge(                    color="#7700CC", style="bold",                penwidth="3") >> ws_api
    ws_api   >> Edge(                    color="#7700CC",                               penwidth="3") >> event_bus
    event_bus >> Edge(                   color="#7700CC",                               penwidth="3") >> orch
    orch     >> Edge(                    color="#7700CC", style="bold",                penwidth="4") >> ws_api

    # ── Orchestrator internal  (dark grey dashed) ─────────────────────────────
    orch >> Edge(color="#555555", style="dashed", penwidth="2") >> privacy
    orch >> Edge(color="#555555", style="dashed", penwidth="2") >> moderation
    orch >> Edge(color="#555555", style="dashed", penwidth="2") >> router

    # ── Semantic routing  (orange) ────────────────────────────────────────────
    router >> Edge(color="#FF8800", style="bold", penwidth="3") >> action_agent
    router >> Edge(color="#FF8800", style="bold", penwidth="3") >> faq_agent

    # ── Agent → RabbitMQ → Specialist  (orange dashed) ───────────────────────
    action_agent >> Edge(color="#CC6600", penwidth="3") >> event_bus
    orch         >> Edge(color="#CC6600", style="dashed", penwidth="2") >> event_bus
    event_bus    >> Edge(color="#CC6600", penwidth="3") >> logi_agent
    event_bus    >> Edge(color="#CC6600", penwidth="3") >> res_agent
    event_bus    >> Edge(color="#CC6600", style="dashed", penwidth="2") >> qa_agent

    # ── Guardian gate  (red) ──────────────────────────────────────────────────
    res_agent >> Edge(color="#CC0000", style="bold", penwidth="3") >> guardian
    guardian  >> Edge(color="#CC0000", style="bold", penwidth="3") >> res_agent

    # ── Agents → Domain services  (teal dashed) ───────────────────────────────
    faq_agent  >> Edge(color="#008888", style="dashed", penwidth="2") >> domain
    logi_agent >> Edge(color="#008888", style="dashed", penwidth="2") >> domain
    res_agent  >> Edge(color="#008888", style="dashed", penwidth="2") >> domain

    # ── Domain events → RabbitMQ  (brown dashed) ──────────────────────────────
    domain >> Edge(color="#886600", style="dashed", penwidth="2") >> event_bus

    # ── → Data Layer  (green dashed) ──────────────────────────────────────────
    domain   >> Edge(color="#006633", style="dashed", penwidth="3") >> pg
    orch     >> Edge(color="#006633", style="dashed", penwidth="2") >> pg
    guardian >> Edge(color="#006633", style="dashed", penwidth="2") >> pg
    ws_api   >> Edge(color="#006633", style="dashed", penwidth="2") >> pg

    # ── → OpenAI  (solid grey) ────────────────────────────────────────────────
    action_agent >> Edge(color="#555555", style="bold", penwidth="3") >> gpt4o
    logi_agent   >> Edge(color="#555555", style="bold", penwidth="3") >> gpt4o
    res_agent    >> Edge(color="#555555", style="bold", penwidth="3") >> gpt4o
    guardian     >> Edge(color="#555555", style="bold", penwidth="3") >> gpt4o
    router       >> Edge(color="#777777", style="bold", penwidth="3") >> gpt4o_mini
    faq_agent    >> Edge(color="#777777", style="bold", penwidth="3") >> gpt4o_mini
    qa_agent     >> Edge(color="#777777", style="bold", penwidth="3") >> gpt4o_mini

    # ── → LangSmith  (dotted grey) ────────────────────────────────────────────
    orch         >> Edge(color="#AAAAAA", style="dotted", penwidth="2") >> langsmith
    action_agent >> Edge(color="#AAAAAA", style="dotted", penwidth="2") >> langsmith
    qa_agent     >> Edge(color="#AAAAAA", style="dotted", penwidth="2") >> langsmith
