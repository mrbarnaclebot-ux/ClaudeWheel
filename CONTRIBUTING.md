# Contributing to Claude Wheel

Thank you for your interest in contributing to Claude Wheel! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. We expect all contributors to:

- Be respectful and constructive in discussions
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Git
- A code editor (VS Code recommended)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/ClaudeWheel.git
cd ClaudeWheel
```

3. Add the upstream remote:

```bash
git remote add upstream https://github.com/mrbarnaclebot-ux/ClaudeWheel.git
```

---

## Development Setup

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Configure your .env file
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Configure your .env.local file
npm run dev
```

### Database

1. Create a Supabase project
2. Run the schema from `backend/supabase-schema.sql`
3. Configure your environment variables

---

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-new-algorithm` - New features
- `fix/wallet-connection-bug` - Bug fixes
- `docs/update-readme` - Documentation
- `refactor/cleanup-services` - Code refactoring

### Commit Messages

Write clear, concise commit messages:

```
type: short description

- Detailed explanation if needed
- List of changes
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance tasks

Example:
```
feat: add rebalance algorithm mode

- Implement target allocation tracking
- Add automatic rebalancing logic
- Update config schema for new options
```

---

## Pull Request Process

1. **Update your fork** with the latest upstream changes:

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

2. **Create a feature branch**:

```bash
git checkout -b feature/your-feature-name
```

3. **Make your changes** and commit them

4. **Push to your fork**:

```bash
git push origin feature/your-feature-name
```

5. **Open a Pull Request** on GitHub

### PR Requirements

- [ ] Code follows the style guidelines
- [ ] Changes are documented
- [ ] No console errors or warnings
- [ ] Tested locally with both frontend and backend
- [ ] PR description explains the changes

---

## Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Define types/interfaces for data structures
- Avoid `any` type when possible

```typescript
// Good
interface UserToken {
  id: string
  tokenMint: string
  symbol: string
}

// Avoid
const token: any = {...}
```

### React/Next.js

- Use functional components with hooks
- Keep components focused and small
- Use meaningful component names

```typescript
// Good
export function TokenCard({ token }: { token: UserToken }) {
  return (...)
}

// Avoid
export function Card({ data }: { data: any }) {
  return (...)
}
```

### CSS/Tailwind

- Use Tailwind utility classes
- Follow the existing design system colors
- Keep styles consistent with the theme

```tsx
// Good - uses design system
<div className="bg-bg-card border border-border-subtle rounded-lg p-4">

// Avoid - hardcoded colors
<div className="bg-[#1a1a24] border-[#333] rounded-lg p-4">
```

### Backend

- Use async/await for asynchronous operations
- Handle errors gracefully
- Log important operations

```typescript
// Good
async function processToken(tokenId: string): Promise<Result> {
  try {
    const token = await getToken(tokenId)
    console.log(`Processing token: ${token.symbol}`)
    // ... logic
    return { success: true }
  } catch (error) {
    console.error(`Failed to process token: ${error.message}`)
    return { success: false, error: error.message }
  }
}
```

---

## Reporting Issues

### Bug Reports

When reporting bugs, include:

1. **Description**: Clear description of the bug
2. **Steps to Reproduce**: How to trigger the bug
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**: OS, Node version, browser
6. **Screenshots**: If applicable

### Feature Requests

When requesting features, include:

1. **Use Case**: Why is this feature needed?
2. **Proposed Solution**: How should it work?
3. **Alternatives**: Other approaches considered

---

## Questions?

Feel free to:
- Open a GitHub issue for questions
- Join our [community on X](https://x.com/i/communities/2008530158354063511)

---

Thank you for contributing to Claude Wheel!
