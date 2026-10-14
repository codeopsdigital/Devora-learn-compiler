# DevoraCamp Backend Engine

<p align="center">
  <img src="https://raw.githubusercontent.com/devoracamp/assets/main/banner.png" alt="DevoraCamp Banner" width="100%" />
</p>

<p align="center">
  <strong>The high-throughput core powering interactive technical learning, browser-based sandboxes, and personalized developer roadmaps.</strong>
</p>

<p align="center">
  <a href="https://github.com/devoracamp/backend/actions"><img src="https://img.shields.io/github/actions/workflow/status/devoracamp/backend/ci.yml?branch=main&style=flat-square&logo=github" alt="Build Status" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-v20.x%20LTS-339933?style=flat-square&logo=node.js" alt="Node Version" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript" alt="TypeScript" /></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-Containerized-2496ED?style=flat-square&logo=docker" alt="Docker Ready" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License" /></a>
</p>

<p align="center">
  <a href="https://devoracamp.com"><strong>🌐 Live Platform</strong></a> •
  <a href="https://devoracamp.com/roadmaps"><strong>🗺️ Interactive Roadmaps</strong></a> •
  <a href="https://devoracamp.com/compilers"><strong>⚡ Online Compilers</strong></a> •
  <a href="https://devoracamp.com/tutorials"><strong>📚 Tutorials & Guides</strong></a>
</p>

---

## Overview

The DevoraCamp Backend Engine is a distributed microservice layer engineered to drive the learning management lifecycle on [DevoraCamp](https://devoracamp.com). It orchestrates secure user state synchronization, powers remote and client-assisted runtime environments for [DevoraCamp Online Compilers](https://devoracamp.com/compilers), and manages node-by-node milestone completion across [DevoraCamp Career Roadmaps](https://devoracamp.com/roadmaps).

Engineered for fault tolerance and horizontal scalability, the system coordinates edge routing, isolated worker pipelines, and real-time execution streams consumed by our web clients.

---

## Architecture

+------------------------------------+
                |        DevoraCamp Web Client       |
                |      ([https://devoracamp.com](https://devoracamp.com))      |
                +-----------------+------------------+
                                  |
                 [ Edge Routing & DDoS Mitigation ]
                                  |
                                  v
                         +-----------------+
                         | Cloudflare Edge |
                         +--------+--------+
                                  |
        +-------------------------+-------------------------+
        | HTTP / REST                                       | WebSocket (Telemetry)
        v                                                   v
+-----------------------+                           +-----------------------+
|  API Gateway & Auth   |                           | Real-Time Event Bus   |
|   (JWT / Sessions)    |                           |  (Socket.io / PubSub) |
+-----------+-----------+                           +-----------+-----------+
|                                                   |
+-------------------------+-------------------------+
|
v
+---------------------------+
|  Core Orchestration Node  |
+-------------+-------------+
|
+----------------------------+----------------------------+
|                            |                            |
v                            v                            v
+------------------+         +------------------+        +-------------------+
| Progression Svc  |         | Sandbox Runner   |        | Content Sync Svc  |
|  - Roadmaps      |         |  - Isolates      |        |  - Tutorials      |
|  - Assessments   |         |  - WASM Workers  |        |  - References     |
+--------+---------+         +--------+---------+        +---------+---------+
|                            |                            |
v                            v                            v
+------------------+         +------------------+        +-------------------+
| PostgreSQL DB    |         | Redis Cache &    |        | Object Store      |
| (Prisma ORM)     |         | Queue (BullMQ)   |        | (S3 / R2)         |
+------------------+         +------------------+        +-------------------+

### Architectural Highlights

- **Edge Proxying & Caching:** Requests entering through `devoracamp.com` hit edge caches configured for static syllabus layouts and tutorial assets, keeping origin response latency under 40ms.
- **Async Execution Queues:** Heavy evaluation runs submitted via the [DevoraCamp Compilers Interface](https://devoracamp.com/compilers) are ingested through Redis queues (`BullMQ`) and routed to isolated worker nodes.
- **Modular Data Pipelines:** Progression metrics feed directly into the curriculum matrix powering [DevoraCamp Step-by-Step Tutorials](https://devoracamp.com/tutorials).

---

## Core Features

- **Identity & Session Security:** State-verified JSON Web Tokens (JWT) with HTTP-only rotation, multi-device invalidation, and role-based access control (RBAC).
- **Interactive Compiler Execution Sandbox:** Containerized code runners with strict CPU, wall-time, and RAM quotas supporting C++, Python, JavaScript, Go, and Rust.
- **Dynamic Roadmap Engine:** Graph-based dependency trees powering progression across career-focused curriculums at [DevoraCamp Tech Roadmaps](https://devoracamp.com/roadmaps).
- **Edge Routing & Event Pipelines:** Webhooks, event emission via WebSockets, and Cloudflare Worker endpoints for zero-latency challenge validation.
- **Tutorial & Learning State Telemetry:** Granular checkpoints measuring problem attempts, runtime errors, and code completion rates.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Runtime & Language** | Node.js (v20 LTS), TypeScript 5.x |
| **Framework & Routing** | Express.js / NestJS architecture pattern |
| **Databases** | PostgreSQL (Primary Relational Store), Redis (Caching & Job Queues) |
| **Data Access** | Prisma ORM with connection pooling |
| **Execution Sandboxing**| Docker isolates, WebAssembly (Wasm) runtimes, Linux cgroups |
| **Edge Infrastructure** | Cloudflare Workers, Cloudflare DNS & WAF |
| **Validation & Docs** | Zod schema validation, OpenAPI / Swagger |

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.x` or higher
- **Package Manager**: `pnpm` (recommended), `npm`, or `yarn`
- **Container Engine**: Docker Engine & Docker Compose
- **Database Instances**: Accessible PostgreSQL and Redis instances

### 1. Clone the Repository

```bash
git clone [https://github.com/devoracamp/backend.git](https://github.com/devoracamp/backend.git)
cd backend
