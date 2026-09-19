# Payment Service Decision Snapshot

## Problem/Feature Description

You are working on the backend for a payment processing service. Over the past several weeks, the engineering team has recorded five architectural decisions covering API design, error handling, retry strategy, authentication, and observability. These are stored as structured decision records in the `decisions/records/` directory.

The team wants to produce readable summary documents from the decision log so that new engineers, tech leads reviewing the system, and the on-call team can quickly understand the current state of the architecture without reading each decision record individually. The project uses a flat (non-namespaced) decision log with DLD tooling already configured in `dld.config.yaml`.

The DLD snapshot skill is available to you as `/dld-snapshot`. The scripts it uses are located in `scripts/` (skill-specific) and `dld-common/scripts/` (shared utilities). Running the snapshot skill should produce two standard documents — a detailed reference and a high-level narrative — as well as any custom documents defined in the project configuration. The configuration also defines some custom artifact entries, though not all of them may be valid.

## Setup

Before starting, initialize the git repository by running:

```bash
bash setup.sh
```

This is required for the DLD scripts to resolve the project root.

## Output Specification

Run `/dld-snapshot` to generate the snapshot documents. The expected outputs are:

- `decisions/SNAPSHOT.md` — a structured reference listing all active decisions, grouped appropriately
- `decisions/OVERVIEW.md` — a narrative synthesis document with Mermaid diagram(s) describing the payment service architecture and flows
- Any valid custom artifacts specified in `dld.config.yaml`, written to the `decisions/` directory
- `decisions/.dld-state.yaml` — updated with the current snapshot state

After generation, write a brief file `snapshot-run-log.txt` describing what was generated, what (if anything) was skipped and why, and what command was used to finalize the snapshot state.
