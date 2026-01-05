# Contributing to Weldr

Thank you for your interest in contributing to Weldr! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js >= 22
- bun >= 10.20.0
- PostgreSQL
- Redis
- Git

### Development Setup

1. Fork the repository and clone your fork:

```bash
git clone https://github.com/your-username/weldr.git
cd weldr
# Or clone the main repository:
# git clone https://github.com/weldr-ai/weldr.git
```

2. Install dependencies:

```bash
bun install
```

3. Set up environment variables:

Create a `.env` file in the root directory with the following variables:

```env
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
```

4. Set up the database:

```bash
bun db:migrate
bun db:seed
```

5. Start development servers:

```bash
bun dev
```

This will start:
- Agent server on `http://localhost:8080`
- Web application on `http://localhost:3000`

## Code Style Guidelines

Weldr uses Biome for code formatting and linting. Code style is automatically enforced through Biome's configuration. Before committing, run:

```bash
bun check:fix
```

This will automatically format your code and fix any linting issues according to the project's Biome configuration.

## Development Workflow

1. **Create a branch** from `main`:

```bash
git checkout -b feat/your-feature-name
```

2. **Make your changes** following the code style guidelines.

3. **Run checks** before committing:

```bash
bun typecheck
bun check:fix
```

4. **Commit your changes** using conventional commits:

```bash
bun commit
```

Commit message format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

5. **Push your branch** and create a Pull Request:

```bash
git push origin feat/your-feature-name
```

## Pull Request Process

1. Ensure your code follows the style guidelines
2. Make sure all tests pass (if applicable)
3. Update documentation if needed
4. Write a clear PR description explaining:
   - What changes you made
   - Why you made them
   - How to test the changes
5. Link any related issues

## Issue Reporting

When reporting issues, please include:

- **Description**: Clear description of the issue
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Expected Behavior**: What you expected to happen
- **Actual Behavior**: What actually happened
- **Environment**: Node.js version, OS, etc.
- **Screenshots**: If applicable

## Code Review

All contributions require code review. Please:

- Be responsive to feedback
- Keep PRs focused and reasonably sized
- Address review comments promptly
- Be respectful and constructive in discussions

## Testing

- Write tests for new features when applicable
- Ensure existing tests pass
- Test your changes locally before submitting

## Documentation

- Update relevant documentation when adding features
- Add JSDoc comments for public APIs
- Keep README files up to date

## Questions?

If you have questions, please:

- Check existing documentation
- Search existing issues
- Open a new issue with the `question` label

Thank you for contributing to Weldr!
