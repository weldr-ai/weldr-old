# Weldr Web

The Weldr Web application is a Next.js-based user interface that provides an interactive development environment for collaborating with the AI agent. It offers real-time visualization, chat interaction, and project management capabilities.

## Core Concepts

### Visual Canvas Editor

A **ReactFlow-based visual editor** that displays the codebase as an interactive graph:

- **Node-Based Visualization**: High-level declarations (pages, endpoints, database models) are rendered as nodes on a canvas
- **Automatic Layout**: Nodes are automatically positioned with collision detection and spacing algorithms
- **Interactive Navigation**: Users can zoom, pan, and arrange nodes to understand code structure
- **Real-Time Updates**: Nodes update in real-time as the agent implements code, showing progress states
- **Type-Specific Rendering**: Different node types (endpoint, db-model, page) have specialized visual representations

### Real-Time Chat Interface

An **interactive chat system** for communicating with the AI agent:

- **Multimodal Input**: Support for text messages and file attachments
- **Streaming Responses**: Real-time streaming of agent responses as they're generated
- **Message History**: Persistent chat history with full conversation context
- **Status Indicators**: Visual feedback showing agent status (planning, coding, finalizing)
- **Tool Call Visualization**: See what tools the agent is using in real-time
- **Reference Integration**: Chat messages can reference code declarations for context

### Event Streaming System

A **Server-Sent Events (SSE) based streaming system** for real-time updates:

- **Live Updates**: Real-time updates for chat messages, node changes, and workflow status
- **Automatic Reconnection**: Handles connection drops with exponential backoff retry logic
- **Event Types**: Supports multiple event types (text, tool-call, node, status, update_branch)
- **State Synchronization**: Keeps UI in sync with agent workflow state
- **Last Event ID Tracking**: Resumes from last received event after reconnection

### Timeline & Branch Management

A **version control interface** for managing project evolution:

- **Version Timeline**: Visual timeline showing all versions and their relationships
- **Branch Types**: Support for stream branches (linear) and variant branches (parallel)
- **Branch Navigation**: Navigate between branches, view ancestry, and sibling variants
- **Version Revert**: Revert to previous versions with full history preservation
- **Commit Visualization**: See conventional commit types and messages
- **Fork Indicators**: Visual indicators showing branch relationships and forks

### Project Management

A **comprehensive project management system**:

- **Project Creation**: Create new projects with AI-powered project initialization
- **Project Settings**: Configure project metadata, environment variables, and integrations
- **Integration Management**: Install and configure integrations through a visual interface
- **Environment Variables**: Manage environment variables with secure storage
- **Project List**: View and navigate between all user projects
- **Command Center**: Quick access command palette for project navigation

### Development Server Management

A **local development server orchestrator**:

- **Automatic Server Management**: Spawns and manages local dev servers for each branch
- **Port Management**: Automatic port allocation and conflict resolution
- **Server Lifecycle**: Start, stop, and restart servers based on branch activity
- **Preview URLs**: Generate preview URLs for running applications
- **Process Tracking**: Tracks running dev server processes with metadata persistence

### Integration Configuration

A **visual interface for managing integrations**:

- **Integration Templates**: Browse and select from available integration templates
- **Configuration Forms**: Dynamic forms for configuring integration-specific settings
- **Installation Status**: Track integration installation progress and status
- **Dependency Resolution**: Visual feedback on integration dependencies and requirements
- **Environment Variable Mapping**: Configure environment variables for integrations

### Authentication & Billing

A **user management and subscription system**:

- **Better Auth Integration**: Full authentication with email, password, and social providers
- **Session Management**: View and manage active sessions across devices
- **Subscription Management**: Handle subscription plans, upgrades, and cancellations
- **Account Settings**: Update profile, email, password, and account preferences
- **Billing UI**: Visual interface for subscription management and payment

### Key Components

- **Editor** (`components/editor/`): Canvas-based code visualization
- **Chat** (`components/chat/`): Real-time chat interface
- **Timeline** (`components/timeline/`): Version and branch management
- **Projects** (`components/projects/`): Project management UI
- **Integrations** (`components/integrations/`): Integration configuration
- **Hooks** (`hooks/`): Custom React hooks for event streaming, messages, status

## Development

### Prerequisites

- Node.js 22+
- Bun
- Redis (for agent communication)
- PostgreSQL (via @weldr/db package)

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

### Integration with Weldr Platform

The web app is part of the larger Weldr platform:

- **Agent App**: Communicates with agent service via API and SSE
- **API Package**: Shared API definitions and tRPC routers
- **Database Package**: Shared database schema and queries
- **Auth Package**: Shared authentication client and server
- **UI Package**: Shared component library and design system
- **Shared Package**: Common utilities and types

