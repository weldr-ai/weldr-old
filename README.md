# Weldr

> **⚠️ Note**: This project is under active development. Things can break unexpectedly.

Chat to build: Weldr generates code and models the repo as a semantic call graph, with key pieces highlighted on a visual canvas.

## What is Weldr?

Weldr is a chat-native AI coding platform. You talk; agents produce a working codebase that’s immediately represented as a semantic call graph. The canvas spotlights the important, high-level parts of the system so humans can understand the architecture at a glance, while agents can parse and query the code directly.

<div align="center">
  <table>
    <tr>
      <td align="center" colspan="2">
        <img src=".github/screenshots/full-editor.png" alt="Full Editor" width="100%"/>
        <br />
        <sub><b>Full Editor</b></sub>
      </td>
    </tr>
    <tr>
      <td align="center">
        <img src=".github/screenshots/integrations-setup.png" alt="Integrations Setup" width="100%"/>
        <br />
        <sub><b>Integrations Setup</b></sub>
      </td>
      <td align="center">
        <img src=".github/screenshots/branches-and-version.png" alt="Branches and Version" width="100%"/>
        <br />
        <sub><b>Branches and Version</b></sub>
      </td>
    </tr>
    <tr>
      <td align="center">
        <img src=".github/screenshots/endpoint.png" alt="Endpoint" width="100%"/>
        <br />
        <sub><b>Endpoint Node</b></sub>
      </td>
      <td align="center">
        <img src=".github/screenshots/db-table.png" alt="Database Table" width="100%"/>
        <br />
        <sub><b>Database Table Node</b></sub>
      </td>
    </tr>
  </table>
</div>

## Core Concepts

### AI-Powered Development

- **Dual-Agent Architecture**: Planner decides what to build; Coder writes and edits code.
- **Workflow Engine**: Stateful orchestration across planning, coding, finalizing, and completion with retries and progress tracking.
- **Task Management**: Small, traceable units of work with dependency awareness.

### Semantic Code Understanding

- **Declarations System** — Extracts pages, endpoints, models, and other artifacts into a semantic graph of the repo.
- **Call Graph** — A complete, incrementally maintained call graph across the codebase.
- **Semantic Enrichment** — Descriptions, tags, usage patterns, and embeddings layered over declarations and relationships.
- **Visual Canvas** — High-level nodes surfaced on an interactive canvas for instant architectural comprehension.

### Project Management

- **Branch-Based Development**: Git-integrated branching and version history with timeline views.
- **Integration System**: Modular add-ons for auth, database, backend, frontend, and more coming.
- **Version Control**: Every change is tracked and reversible.

## Apps

- **agent** - AI-powered development assistant service
- **web** - Next.js-based user interface and development environment

## Packages

- **api** - tRPC API routers and shared API definitions
- **auth** - Authentication client and server components
- **db** - Database schema, migrations, and Drizzle ORM setup
- **emails** - Email templates for authentication and notifications
- **shared** - Common utilities, types, validators, and state management
- **ui** - Shared component library and design system

## Setup

### Prerequisites

- Node.js >= 22
- bun >= 10.20.0
- PostgreSQL
- Redis
- Docker (for MinIO local storage)
- Git

### Installation

1. Clone the repository:

```bash
git clone https://github.com/weldr-ai/weldr.git
cd weldr
```

2. Install dependencies:

```bash
bun install
```

3. Start local S3 storage (MinIO):

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts MinIO on:

- API: `http://localhost:19000`
- Console: `http://localhost:19001` (login: minioadmin/minioadmin)

4. Set up environment variables:

Create a `.env` file in the root directory:

```env
# Mode Configuration
WELDR_MODE=local

# S3-Compatible Storage (MinIO for local)
S3_ENDPOINT=http://localhost:19000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_REGION=us-east-1

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/weldr

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000

# AI Providers (at least one required)
ANTHROPIC_API_KEY=your-key
OPENAI_API_KEY=your-key
GEMINI_API_KEY=your-key

# Agent URL
AGENT_URL=http://localhost:8080

# Project ID (optional, for running agent in single-project mode)
# PROJECT_ID=your-project-id
```

5. Set up the database:

```bash
bun db:push
bun db:seed
```

6. Start development servers:

```bash
bun dev
```

This will start:

- Agent server on `http://localhost:8080`
- Web application on `http://localhost:3000`

### Storage Architecture

Weldr uses S3-compatible storage for project files:

- **Local development**: MinIO (included in `docker-compose.dev.yml`)
- **Cloud deployment**: Tigris (on Fly.io)

The storage holds AgentFS database files (`.db`) which contain all project state:

- `branches/{branchId}.db` - Active branch state
- `snapshots/{versionId}.db` - Version snapshots

For more detailed setup instructions and contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).
