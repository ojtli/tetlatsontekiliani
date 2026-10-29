# Tetlatsontekiliani — Tico Address Benchmark

*Tetlatsontekiliani* means Judge in nahuatl. This project will be the judge of the Tico AI

A comprehensive benchmarking, evaluation, and comparative analytics platform designed to measure the geocoding accuracy of Large Language Models (LLMs) acting as geocoders against complex colloquial Costa Rican addresses.

---

## Project Overview

**Tetlatsontekiliani** benchmarks frontier LLMs (including OpenAI GPT, Google Gemini, Anthropic Claude, LM Studio local models, and Nvidia Nemotron) on their ability to accurately resolve ambiguous, non-standard, or colloquial addresses into precise geographical coordinates.

The system measures geodesic distance from ground-truth coordinates, calculates response latencies, isolates outliers, aggregates deep statistical metrics (percentiles, IQR, empirical cumulative distribution functions, Pareto frontiers), and provides visual mapping tools with error vectors and cross-run comparative analysis over time.

---

## The Costa Rican Address Challenge

Geocoding is fundamental to modern digital infrastructure — powering e-commerce logistics, emergency medical dispatch (911), food delivery, postal services, and urban navigation. While commercial geocoding services (such as Here and OpenStreetMap) perform reliably in countries with standardized, grid-based addressing systems (e.g., `123 Main Street, Springfield, IL 62701`), they systematically fail in regions governed by colloquial, descriptive, and landmark-relative directions.

Costa Rica is one of the world's most prominent and challenging real-world examples of this paradigm. In Costa Rica, official street names and building numbers exist on civil registry maps but are virtually ignored in everyday life, commerce, package shipping, and emergency response. Instead, the entire nation navigates using a relational, informal directional system based on landmarks and spatial offsets.

### Benchmark Dataset & Ground Truth Methodology

A benchmark is only as rigorous as the integrity of its evaluation data. This benchmark avoids synthetic or idealized addresses, evaluating providers against the ground truth of actual Costa Rican postal delivery offices:

- **Authentic Postal Delivery Source ("Correos de Costa Rica")**: The benchmark datasets ([`data/inputs-correos.json`](data/inputs-correos.json)) were gathered directly from service branch directories of the official national postal service, [**Correos de Costa Rica**](https://correos.go.cr/oficinas/). These inputs reflect the authentic, raw, and unstandardized syntax used by real citizens, merchants, and postal couriers daily across Costa Rica's seven provinces.
- **Manual Geocoding & High-Precision Ground Truth**: Because no automated geocoder can be trusted to establish ground truth for colloquial Costa Rican addresses, every single address in the benchmark was manually investigated, geocoded, and validated by human experts. The expected coordinates represent an estimated true representation of the intended location of the address.
- **Explicit Calibration & Negative Testing (Null Validation)**: The benchmark intentionally supports unresolvable, corrupt, or non-address inputs with ground-truth `expectedResult: null`. This allows measuring **rejection calibration**: verifying whether a model has the safety and self-awareness to return `null` (`✓ Null`), as opposed to hallucinating coordinates for unresolvable text (`False Pos`).

---

## Key Capabilities & Modules

### 1. Interactive Provider Tester (`/lab`)

The Interactive Provider Tester (`/lab`) provides real-time single-address evaluation against any combination of configured LLMs or traditional geocoders. Users can select models from a curated catalog of modern releases, toggle between direct native vendor APIs and the OpenRouter aggregator, and inspect live execution metrics including round-trip latency in milliseconds, geodesic distance from ground truth, raw response JSON, extracted coordinates, and error diagnostics.

### 2. Batch Job Runner (`/run-job`)

The Batch Job Runner (`/run-job`) executes automated batch benchmarks across real Costa Rican postal delivery addresses using Server-Sent Events (SSE) to stream live progress, processed addresses, and provider results directly to the browser. It supports both standard runs against the complete dataset and targeted retrials for failed items, with support for graceful cancellation that immediately halts execution while safely persisting all processed data to `data/results/`.

### 3. Benchmark Results Viewer (`/results`)

The Benchmark Results Viewer (`/results`) delivers comprehensive analysis of saved benchmark runs through synchronized table, statistical, and interactive map views. It presents advanced analytical metrics including D3-powered empirical cumulative distribution function (ECDF) reach curves, interquartile range (IQR) box plots, Pareto-optimal efficiency frontiers, and podium performance awards alongside a sortable, filterable accuracy table with standardized DistancePill badges and a dynamic Leaflet map featuring geodetic error vectors connecting predicted pins to ground-truth targets.

### 4. Cross-Date Comparison & Temporal Analysis (`/compare`)

The Cross-Date Comparison & Temporal Analysis module (`/compare`) tracks provider accuracy regressions and improvements over time by aligning two or three benchmark runs side-by-side with automatic chronological baseline selection. It features delta-ranked sortable comparison grids highlighting distance variations and fixed errors, interactive comparison maps rendering multi-run error vectors simultaneously, and a smart merge utility that combines complementary benchmark runs into unified datasets without duplicating tests or overwriting existing metrics.


---

## Getting Started & Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy the template from [`.env.example`](.env.example) to `.env.local` and populate the keys for the providers you want to evaluate:
```bash
cp .env.example .env.local
```

### 3. Run the Development Server
The application runs on **port 3200**:
```bash
npm run dev
```
Open [http://localhost:3200](http://localhost:3200) to access the application.

### 4. Run the Test Suite
```bash
npm test
```
Executes all unit and integration tests across geospatial math, coordinate extraction, model resolution, merge rules, retrials, and cross-run comparison logic.

## Ojtli Project

The Ojtli project is being developed to achieve an accurate geocodification of the Tico addresses, it proposes a different approach not using LLMs, it does have a custom built machine learning model to handle the linguistic aspects plus a deterministic geographical algorithm to approximate the positioning. This benchmark will eventually include the results of Ojtli too, in the meantime more information can be found at [https://ojtli.app](https://ojtli.app)
