# ADR 001: System Architecture & Stack Selection

**Status**: Accepted  
**Date**: 2026-05-01

## Context
We are building CELSOR NEXUS, an institutional-grade crypto macro-intelligence platform. The system needs to ingest real-time on-chain data, process it through machine learning and LLM pipelines, and distribute high-conviction trading signals via WebSockets, push notifications, and emails. We need a stack that is highly performant, scalable, and easy to maintain while supporting complex background processing and AI integrations.

## Decision
We have selected the following technology stack and architectural patterns:

1. **Framework**: Next.js 14 (App Router) with React 18 and TypeScript.
2. **Database**: Supabase (PostgreSQL with pgvector for RAG).
3. **Background Jobs**: BullMQ backed by Upstash Redis.
4. **Real-time Communication**: Socket.io for WebSocket broadcasting.
5. **AI/ML Layer**: OpenAI `gpt-4o` for narrative generation, `text-embedding-3-small` for vector search, integrated via LangChain concepts (implemented natively for lower overhead).
6. **Styling**: Tailwind CSS + Framer Motion for high-end institutional aesthetics.
7. **Containerization**: Docker with multi-stage builds.

## Consequences
- **Positive**: Next.js provides a unified full-stack environment, speeding up development.
- **Positive**: Supabase provides built-in Auth, Row-Level Security, and pgvector out of the box, reducing DevOps overhead.
- **Positive**: BullMQ + Redis ensures that heavy AI processing and blockchain RPC calls do not block the main API threads.
- **Negative**: Using a custom server for Socket.io breaks some of Next.js's standard Vercel edge deployment benefits, requiring containerized deployment (e.g., AWS ECS or Google Cloud Run).
- **Negative**: Dependence on OpenAI introduces latency and cost, which we mitigate via Redis caching and pre-computed heuristics (scoring).
