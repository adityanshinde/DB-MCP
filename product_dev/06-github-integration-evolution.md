# GitHub Integration Evolution Plan

## Current State

- 15 GitHub tools covering repo access, code search, C# analysis, history, and PRs
- Repository allowlist with wildcard support
- File size limits and caching
- C# is the only language with deep static analysis

## Strategic Goal

Evolve from a GitHub file browser into a **universal code intelligence platform** that understands any codebase in any language, enabling AI assistants to reason about architecture, dependencies, patterns, and changes at scale.

---

## Phase 1: Multi-Language Deep Analysis

### Why C# Only?
Current C# tools (`csharpTools.ts`, 48KB) are excellent but limit the product to .NET shops.

### New Language Support

#### Python
**Tools**:
- `github_get_python_function` — Extract function/class definitions
- `github_find_python_imports` — Trace import dependencies
- `github_get_python_class_hierarchy` — MRO and inheritance tree
- `github_search_python_symbols` — Search classes, functions, modules

**Parser**: Use `tree-sitter-python` for AST extraction without execution.

#### JavaScript / TypeScript
**Tools**:
- `github_get_js_function` — Extract function/component definitions
- `github_find_js_dependencies` — npm package dependency graph
- `github_trace_js_imports` — ES module import chains
- `github_get_react_component` — Extract React component props, hooks, JSX

**Parser**: `tree-sitter-javascript`, `tree-sitter-typescript`

#### Java
**Tools**:
- `github_get_java_method` — Method definitions with annotations
- `github_find_java_class_hierarchy` — Inheritance and interfaces
- `github_trace_java_dependencies` — Maven/Gradle dependency graph
- `github_search_java_symbols` — Class, method, field search

**Parser**: `tree-sitter-java`

#### Go
**Tools**:
- `github_get_go_function` — Function definitions
- `github_find_go_imports` — Package import graph
- `github_get_go_interface_implementations` — Interface satisfaction

**Parser**: `tree-sitter-go`

#### Rust
**Tools**:
- `github_get_rust_function` — Function and trait implementations
- `github_find_rust_dependencies` — Cargo.toml dependency analysis
- `github_trace_rust_modules` — Module hierarchy

**Parser**: `tree-sitter-rust`

#### Ruby
**Tools**:
- `github_get_ruby_method` — Method and class definitions
- `github_find_ruby_inheritance` — Class ancestry

**Parser**: `tree-sitter-ruby`

---

## Phase 2: Architecture Intelligence

### 1. Dependency Vulnerability Scanning
- Parse `package.json`, `requirements.txt`, `Cargo.toml`, `pom.xml`, `go.mod`
- Query OSV / GitHub Advisory Database for known CVEs
- Report vulnerable dependencies with severity and fix versions

**Tool**: `github_check_dependency_vulnerabilities`

### 2. Code Complexity Analysis
- Calculate cyclomatic complexity per function
- Identify hotspots (files with highest complexity)
- Track complexity trends over commits

**Tool**: `github_analyze_code_complexity`

### 3. Test Coverage Integration
- Parse coverage reports (lcov, cobertura, json)
- Identify untested files and functions
- Coverage diff between branches

**Tool**: `github_get_test_coverage`

### 4. API Endpoint Discovery
- Parse OpenAPI/Swagger specs
- Extract REST endpoints from Express, FastAPI, Spring, etc.
- GraphQL schema introspection from code

**Tool**: `github_discover_api_endpoints`

### 5. Documentation Coverage
- Identify undocumented public APIs
- Check README completeness
- Detect stale documentation (code changed, docs didn't)

**Tool**: `github_analyze_documentation_coverage`

---

## Phase 3: Collaboration & Workflow Intelligence

### 1. PR Review Assistant
- Auto-suggest reviewers based on file ownership (CODEOWNERS)
- Detect merge conflicts before they happen
- Identify related PRs touching the same files
- Surface test failures and their root causes

**Tool**: `github_analyze_pull_request`

### 2. Code Review Metrics
- Average review time per team
- Reviewer load distribution
- "Time to first review" tracking
- Approval patterns (who blocks, who rubber-stamps)

**Tool**: `github_get_code_review_metrics`

### 3. Release & Changelog Generation
- Generate changelogs from commit messages since last tag
- Categorize changes (features, fixes, breaking)
- Suggest version bump (semver)

**Tool**: `github_generate_changelog`

### 4. Contributor Analytics
- Identify key contributors and knowledge silos
- Bus factor analysis (how many people know each file?)
- Onboarding friction (files only touched by departed employees)

**Tool**: `github_analyze_contributor_health`

---

## Phase 4: AI-Native Code Understanding

### 1. Semantic Code Search
- Use vector embeddings of code snippets
- Search by meaning, not just syntax (e.g., "find authentication middleware")
- Integrate with OpenAI embeddings or CodeBERT

**Tool**: `github_semantic_search_code`

### 2. Auto-Generated Architecture Diagrams
- Generate C4 model diagrams from code structure
- Identify bounded contexts, microservices boundaries
- Visualize data flow between components

**Tool**: `github_generate_architecture_diagram`

### 3. Code Summarization
- Auto-generate docstrings and comments for undocumented functions
- Summarize what a PR does in natural language
- Explain complex algorithms in the codebase

**Tool**: `github_summarize_code`

### 4. Refactoring Suggestions
- Detect code smells (duplication, long methods, god classes)
- Suggest specific refactoring patterns
- Estimate refactoring effort

**Tool**: `github_suggest_refactoring`

---

## Technical Implementation Strategy

### Tree-Sitter Integration
Instead of regex-based parsing (current C# approach), adopt Tree-sitter for all languages:

```typescript
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';

function parsePythonFunctions(source: string): FunctionDefinition[] {
  const parser = new Parser();
  parser.setLanguage(Python);
  const tree = parser.parse(source);
  // Walk AST, extract function nodes
}
```

**Benefits**:
- Accurate parsing (handles nested structures, strings, comments)
- Fast (C-based parser)
- Incremental parsing for large files
- 40+ language grammars available

### Language Server Protocol (LSP) Bridge
For languages with mature LSP servers:
- Spawn LSP server process
- Send `textDocument/definition`, `textDocument/references` requests
- Cache LSP responses
- Supports: TypeScript (tsserver), Python (pylsp), Rust (rust-analyzer), Go (gopls)

### GitHub Copilot Integration
- Leverage Copilot's code understanding for deeper analysis
- Use Copilot chat API for code explanation
- (Requires GitHub partnership / API access)

---

## Caching Strategy for Code Intelligence

Code analysis is CPU-intensive. Aggressive caching needed:

| Data Type | Cache TTL | Storage |
|-----------|-----------|---------|
| File content | 10 min | L1 + L2 |
| Repo tree | 3 hours | L1 + L2 |
| AST parse results | 1 hour | L1 + L2 |
| Symbol index | 6 hours | L2 only |
| Commit history | 5 min | L1 + L2 |
| PR comments | 10 min | L1 + L2 |
| Dependency scan | 24 hours | L2 only |
| Complexity analysis | 24 hours | L2 only |

---

## Security & Rate Limit Considerations

1. **GitHub API Abuse**: Tree traversal + file fetching can exhaust 5,000 req/hour quickly
   - Solution: Cache tree results for 3+ hours
   - Use GitHub GraphQL API for batched queries (reduces request count by 10x)

2. **Code Execution Risk**: Never execute fetched code
   - All analysis is static (AST traversal)
   - No dynamic evaluation, no `eval()`, no subprocess execution

3. **Private Repository Access**: GitHub PAT scope determines access
   - Document minimum required scopes: `repo` (private repos), `read:org`
   - Warn if PAT has excessive permissions

4. **Repository Size Limits**: 
   - Cap tree traversal at 250 entries (already implemented)
   - Cap file size at 1MB (already implemented)
   - Reject repos with >10,000 files unless explicitly allowed
