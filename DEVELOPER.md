# Tetlatsontekiliani — Developer Guide

This document contains in-depth technical documentation, architectural decisions, codebase walkthroughs, API specifications, and development guidelines for engineers contributing to **Tetlatsontekiliani**.

---

## Technology Stack

- **Core Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **UI Runtime**: [React 19](https://react.dev/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with custom dark-mode token palette
- **Mapping & Geospatial**: [Leaflet 1.9.4](https://leafletjs.com/) with `@types/leaflet` & [Geolib 4.0](https://github.com/manuelbieh/geolib)
- **Data Analytics & Math**: [d3-array 3.2](https://d3js.org/d3-array) & [d3-scale 4.0](https://d3js.org/d3-scale)
- **AI & LLM SDKs**: [`@google/genai` 2.30](https://www.npmjs.com/package/@google/genai) and native REST clients for OpenAI, Anthropic, LM Studio, Nvidia, and OpenRouter
- **Testing**: Node.js Native Test Runner (`node:test`, `node:assert/strict`) via `tsx`

---

## Verification Commands

Run these commands during development to ensure code quality:

```bash
# Run the test suite (Node.js native test runner via tsx)
npm test

# Run ESLint across the codebase
npm run lint

# Automatically fix fixable ESLint issues
npm run lint:fix

# Run TypeScript type-checking without emitting files
npm run typecheck

# Run full pipeline: lint + typecheck + tests
npm run check

# Create production build
npm run build
```

