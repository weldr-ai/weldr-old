# Weldr Agent

The Weldr Agent is an AI-powered development assistant that autonomously plans, implements, and manages software projects. It orchestrates the complete development lifecycle from user requirements to working code.

## Core Concepts

### Workflow Engine

The agent operates through a **state-based workflow engine** that manages the entire development process. The workflow progresses through distinct phases:

- **Planning** → **Coding** → **Finalizing** → **Completed**

Each phase has conditional steps that execute based on the current state, ensuring the right actions happen at the right time. The workflow supports retry logic, timeout handling, and graceful recovery from interruptions.

### Dual-Agent Architecture

The agent uses two specialized AI agents that work together:

#### Planner Agent
- Analyzes user requirements and project context
- Breaks down work into structured tasks with acceptance criteria
- Identifies needed integrations and dependencies
- Creates declarations (components, endpoints, database models)
- Orchestrates the overall development strategy

#### Coder Agent
- Executes individual tasks from the execution plan
- Implements code changes using a rich set of tools
- Tracks progress across multiple tasks with retry logic
- Manages task dependencies and execution order
- Commits changes when tasks are completed

### Task Management

Tasks are the atomic units of work in the system:

- **Task Types**: Declaration-based tasks (implementing specific components/endpoints) and generic tasks
- **Task Context**: Each task includes acceptance criteria, implementation notes, and sub-tasks
- **Progress Tracking**: Tasks move through states: `pending` → `in_progress` → `completed` / `failed`
- **Retry Logic**: Failed tasks automatically retry up to 3 times with exponential backoff
- **Execution Plan**: Tasks are ordered based on dependencies and executed sequentially

### Declarations System

The agent extracts and tracks **code declarations** - structured representations of code artifacts that form a **semantic graph** of the entire codebase:

- **Types**: Pages, endpoints, database models, components, utilities
- **Extraction**: Automatically parses code to identify declarations and their relationships
- **Dependency Graph**: Tracks call dependencies between declarations, building a complete dependency graph for the full codebase incrementally
- **Graph Semantic Enrichment**: Enriches the declarations in the dependency graph with semantic data that can be used by the agent to effectively edit the code or humans to understand the implementation details of their systems without reading or understanding code
- **Canvas Visualization**: High-level declarations are visualized as nodes on a canvas with automatic layout, allowing users to understand the underlying implementation structure and relationships at a glance
- **Progress Tracking**: Each declaration tracks implementation progress (`pending`, `in_progress`, `enriching`, `completed`)
- **Relationships**: Declarations maintain both structural (dependency) and semantic relationships for proper execution order and code understanding

### Integrations System

A modular integration framework that extends project capabilities:

- **Categories**: Authentication, Database, Backend, Frontend
- **Dependency Management**: Integrations declare dependencies and install in correct order
- **Installation Queue**: Integrations are queued, validated, and installed automatically
- **Environment Variables**: Automatic configuration and mapping of required environment variables
- **Post-Install Hooks**: Custom setup scripts run after installation

### Branch-Based Development

Each project operates on a **branch-version model**:

- **Branches**: Isolated development environments for each project
- **Versions**: Snapshots of work within a branch, tracking status and progress
- **Git Integration**: Automatic git repository initialization and commit management
- **State Persistence**: Branch state is persisted locally or synced to cloud storage (S3)
- **Worktree Support**: Uses git worktrees in local mode for efficient branch management

### Real-Time Streaming

The agent provides real-time updates through a streaming system:

- **Event Types**: Status updates, task progress, code changes, node updates
- **Redis Backend**: Uses Redis for pub/sub messaging
- **WebSocket Support**: Clients receive live updates as work progresses
- **Progress Visibility**: Real-time feedback on planning, coding, and finalization phases

## Key Features

### Intelligent Code Generation

- **Context-Aware**: Understands project structure, existing code, and dependencies
- **Multi-File Operations**: Can create, edit, and delete files across the codebase
- **Code Search**: Semantic and text-based search to find relevant code
- **Declaration Queries**: Query related declarations to understand code relationships

### Rich Tool Set

The agent has access to a comprehensive set of tools:

**File Operations**
- `read_file`, `write_file`, `edit_file`, `delete_file`
- `list_dir` for directory exploration

**Code Search**
- `search_codebase` for semantic code search
- `grep` for text pattern matching
- `fzf` for fuzzy file finding
- `find` for file system queries

**Package Management**
- `install_packages`, `remove_packages` for dependency management

**Development Tools**
- `query_related_declarations` to understand code relationships
- `add_integrations` to install project integrations
- `done` to mark tasks as complete

### Workflow Recovery

The agent can recover from interruptions:

- **Startup Recovery**: Automatically resumes incomplete workflows on server restart
- **State Persistence**: Workflow state is saved to the database
- **Version Tracking**: Each version tracks its status and can be resumed
- **Local/Cloud Modes**: Supports both local development and cloud deployment

### Build & Deployment

- **Build System**: Integrates with project build tools (pnpm, bun, etc.)
- **Snapshot Creation**: Creates Tigris snapshots for cloud deployments
- **S3 Sync**: Syncs branch state to/from S3 for cloud persistence
- **Dev Server Management**: Manages local development servers

### Error Handling & Resilience

- **Retry Logic**: Automatic retries with configurable attempts and delays
- **Timeout Protection**: Steps can have timeouts to prevent hanging
- **Error Logging**: Comprehensive logging with context (project, version, task IDs)
- **Graceful Degradation**: Failed tasks don't block the entire workflow

## Architecture

### Request Flow

1. **Trigger**: User sends a message via `/trigger` endpoint
2. **Context Setup**: Workflow context is initialized with project, branch, and user
3. **Workflow Execution**: The workflow engine evaluates conditions and executes steps
4. **Agent Execution**: Planner or Coder agents process the work
5. **Tool Execution**: Agents use tools to interact with the codebase
6. **Streaming Updates**: Progress is streamed to clients in real-time
7. **State Persistence**: Changes are saved to database and file system
8. **Completion**: Workflow completes and commits changes

### Data Flow

- **Database**: Stores projects, branches, versions, tasks, declarations, integrations
- **File System**: Each branch has its own directory with the codebase
- **Redis**: Handles real-time event streaming
- **S3/Tigris**: Cloud storage for branch state and snapshots (cloud mode)

### Key Components

- **Workflow Engine** (`src/workflow/`): Orchestrates the development process
- **AI Agents** (`src/ai/agents/`): Planner and Coder agents
- **Tools** (`src/ai/tools/`): Capabilities available to agents
- **Integrations** (`src/integrations/`): Modular integration system
- **Routes** (`src/routes/`): HTTP API endpoints
- **Lib** (`src/lib/`): Utilities for git, build, branch state, etc.

## Development

### Prerequisites

- Node.js 22+
- bun
- Redis (for streaming)
- PostgreSQL (via @weldr/db package)
- Git

### Environment Variables

See `.env.example` for required configuration.

### Running

```bash
# Development
bun dev

# Production
bun build
bun start
```

### Local vs Cloud Mode

The agent supports two deployment modes:

- **Local Mode**: Uses git worktrees, local file system, no S3 sync
- **Cloud Mode**: Uses S3 for branch state, Tigris for snapshots, full cloud integration

## API Endpoints

- `POST /trigger` - Trigger workflow with user message
- `GET /events` - Stream workflow events (SSE)
- `POST /install-integrations` - Install project integrations
- `POST /revert` - Revert version changes
- `GET /health` - Health check

## Integration with Weldr Platform

The agent is part of the larger Weldr platform:

- **Web App**: Provides UI for interacting with the agent
- **API Package**: Shared API definitions and types
- **Database Package**: Shared database schema and queries
- **Shared Package**: Common utilities and types
