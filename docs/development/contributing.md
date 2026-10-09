# Contributing Guide

Local development, validation, commits and integration are the default. The remote stores committed results; GitHub Actions are disabled, including manual runs, APK/Docker builds and branch cleanup.

Repository governance is maintained in `docs:README.md` (read locally with `git show docs:README.md`). This guide describes contribution steps; current user instructions and governance define the active task boundaries. Plans, implementation records and the live handoff are maintained only in the independent `docs` branch; `main:docs/` contains product and development documentation.

Thank you for your interest in the Atria project! This document explains how to contribute code, documentation, and other improvements to Atria.

## Setting Up the Development Environment

1. Clone the repository locally (or use your existing checkout):

```bash
git clone https://github.com/ZZZdragondYNGPHX/Atria.git
cd Atria
```

2. Install dependencies with `npm install`.
3. Start the development server with `node server.js`.

By default it listens on `http://localhost:8000`; configure the port through command-line arguments or `config.yaml`. A fork is optional for external contributions.

## Branching Strategy

- **`main`** — The stable branch, always kept in a releasable state. Completed product tasks integrate into local `main`; optional PRs target `main`.
- Create feature branches from `main` for new development.

```bash
git checkout -b feat/my-new-feature main
```

> [!IMPORTANT]
> Atria's stable branch is `main`.

Recommended branch naming conventions:

| Prefix | Purpose | Example |
|------|------|------|
| `feat/` | New feature | `feat/memory-graph-export` |
| `fix/` | Bug fix | `fix/chat-sync-race-condition` |
| `docs/` | Documentation improvement | `docs/extension-api-examples` |
| `refactor/` | Code refactoring | `refactor/preset-manager` |
| `chore/` | Build/toolchain | `chore/update-dependencies` |

## Commit Convention

Atria follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | Description |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code formatting (no logic changes) |
| `refactor` | Refactoring (no new features or bug fixes) |
| `perf` | Performance optimization |
| `test` | Test-related changes |
| `chore` | Build/toolchain/dependency updates |

**Examples:**

```
feat(memory-graph): add hierarchical compression for event nodes

fix(search-tools): handle empty query in web search

docs(extension-api): add examples for registerExtensionApi
```

## Local Development Workflow

1. Check Git status, protect unrelated work and create/use the appropriate task branch.
2. Implement the change and run the smallest sufficient local checks.
3. Commit locally and write/update the task Record in the independent `docs` branch.
4. Integrate completed product work into local `main`; verify the integration without repeating unaffected checks.
5. Push committed results for storage and clean up completed local/remote task branches.
6. For a multi-stage task, update its Record/HANDOFF and stop at the approved stage boundary.

A pull request may be used when explicit review is needed; it is not the default merge gate. Do not wait for disabled remote CI.

## Code Style

### Basic Rules

- **Indentation**: 4 spaces
- **Quotes**: Single quotes (JavaScript)
- **Semicolons**: Required
- **Line endings**: LF (`\n`), do not use CRLF
- **End of file**: Keep one trailing newline

> [!IMPORTANT]
> All files must use LF line endings. Windows users should configure Git:
> ```bash
> git config core.autocrlf input
> ```
> Or ensure `* text=auto eol=lf` is set in `.gitattributes`.

### Naming Conventions

| Context | Style | Example |
|------|------|------|
| Variables and functions | `camelCase` | `loadSettings()` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT` |
| CSS class names | `kebab-case` | `chat-message-container` |
| File names | `kebab-case` | `preset-manager.js` |

### Module System

- **Frontend code**: ES Modules (`import`/`export`)
- **Backend code**: ES Modules (`import`/`export`)

### Comments

- Key logic and public APIs should have JSDoc comments
- Complex algorithms or business logic should include inline comments explaining intent
- Avoid meaningless comments (e.g., `// increment counter` followed by `counter++`)

## Project Structure Overview

```
Atria/
├── server.js              # Server entry point
├── src/                   # Backend source code
│   ├── endpoints/         # API routes
│   └── middleware/        # Middleware
├── public/                # Frontend assets
│   ├── scripts/           # Frontend scripts
│   │   ├── extensions/    # Built-in extensions
│   │   │   └── third-party/  # Third-party plugins
│   │   └── ...            # Core modules
│   └── ...                # Static assets
├── docs/                  # Documentation (English at root)
│   ├── zh-CN/             # Simplified Chinese documentation
│   └── zh-TW/             # Traditional Chinese documentation
└── config.yaml            # Server configuration
```

## Testing

- Select the smallest sufficient checks for the changed behavior and risk; do not default to full lint/test/build.
- Prefer unit/integration tests, browser automation and simulators.
- Request manual device evidence only for a specific essential gap automation cannot cover.
- Repeat passed checks only after a relevant new change or unresolved failure.
- Report the checks actually executed and preserve missing evidence.

## Documentation Contributions

Documentation is located in the `docs/` directory and uses Markdown format:

- English documentation: `docs/` (root)
- Simplified Chinese documentation: `docs/zh-CN/`
- Traditional Chinese documentation: `docs/zh-TW/`

Documentation contributions follow the local workflow above. Plans, Records and HANDOFF belong to the independent `docs` branch. When writing documentation, please note:

- Use accurate technical terminology
- Keep code and API names in English
- Use code blocks and tables where appropriate
- For cross-references, English uses unprefixed paths (e.g., `/development/contributing`); Chinese versions use `/zh-CN/` or `/zh-TW/` prefixes
- All files must use LF line endings

## Reporting Issues

If you find a bug or have a feature suggestion, please submit it via GitHub Issues. When filing an Issue, please include:

- Problem description
- Reproduction steps (if applicable)
- Expected behavior vs. actual behavior
- Environment information (OS, Node.js version, browser)

## Code of Conduct

Please respect all contributors and users. Maintain a friendly and professional tone in all communications.

## Related Pages

- [Frontend Plugin Development](/development/frontend-plugin) — Getting started with third-party plugin development
- [Extension API Reference](/development/extension-api/) — Complete API documentation
- [Character Customization Walkthrough](/recipes/card-customization-walkthrough) — Customize a character card with the Studio
