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
    "splines": "curved",
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
    frontend = React("Web Application\nSPA")

    # =========================================================================
    # Row 2 — Gateway
    # =========================================================================
    with Cluster("Gateway Layer"):
        http_api = APIGateway(
        "REST API Gateway\n"
        "Auth & Routing\n"
        "Standard CRUD"
        )
        ws_api = APIGateway(
        "WebSocket Gateway\n"
        "Connection Management\n"
        "Stateful Streaming"
        )

    # =========================================================================
    # Row 3 — Orchestration
    # =========================================================================
with Cluster("AI Orchestration Layer"):
    orch = NodeJS("Orchestrator Agent\nState Machine")

        with Cluster("Inbound Pipeline"):
            privacy    = TypeScript("Privacy Service\nPII redaction")
            moderation = TypeScript("Moderation Guard\nInput · Output eval")

        router = TypeScript(
        "Semantic Router\n"
        "Intent Classification"
        )

    # =========================================================================
    # Row 4 — AI Agents
    # =========================================================================
    with Cluster("AI Agent Layer"):
        with Cluster("Core Agents"):
            action_agent = NodeJS(
                "Action Agent\n"
            "Complex Routing\n"
            "Multi-step Planning"
            )
            faq_agent = NodeJS(
                "FAQ Agent\n"
            "Semantic Q&A\n"
            "Knowledge Retrieval"
            )

        with Cluster("Specialist Agents"):
        logi_agent = NodeJS("Logistics Agent\nETA & Tracking")
        res_agent  = NodeJS("Resolution Agent\nRefunds & Compensation")
        guardian   = NodeJS("Guardian Agent\nSOP Compliance Gate")
        qa_agent   = NodeJS("QA Agent\nSession Scoring")

    # =========================================================================
    # Row 5 — Domain Services  +  Event Bus
    # =========================================================================
with Cluster("Domain Service Layer"):
        domain = ECS(
        "Order · Logistics\n"
        "Payment · Audit\n"
        "User · Incident\n"
        "Knowledge"
        )

    event_bus = RabbitMQ(
    "Event Bus\n"
    "Async Message Broker\n"
    "Decoupled Queues"
    )

    # =========================================================================
    # Row 6 — Data  +  External AI
    # =========================================================================
    with Cluster("Data Layer"):
        pg = PostgreSQL(
        "Relational Database\n"
        "+ Vector Store\n"
        "Isolated Logical Schemas\n"
        "Semantic Similarity Search"
        )

    with Cluster("External AI Services"):
    gpt4o      = Sagemaker("Primary Foundation Models\nComplex Reasoning")
    gpt4o_mini = Sagemaker("Secondary Foundation Models\nFast Classification")
    langsmith  = Datadog("Observability Platform\nTracing & Evaluation\nCI Pipeline")

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
    res_agent  >> Edge(color="#CC0000", style="bold", penwidth="3") >> guardian
    guardian   >> Edge(color="#CC0000", style="bold", penwidth="3") >> res_agent
    logi_agent >> Edge(color="#CC0000", style="bold", penwidth="3") >> guardian
    guardian   >> Edge(color="#CC0000", style="bold", penwidth="3") >> logi_agent

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
