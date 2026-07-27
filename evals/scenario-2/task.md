# Implement Input Validation in the Data Processor

## Problem Description

A data processing service handles records from multiple external sources. The core of this service is `src/processor.py`, which transforms raw input dictionaries into normalized output records. Over the past few months, the team has seen a steady stream of production incidents where malformed inputs — missing required fields, values of the wrong type — caused cryptic exceptions deep inside the processing logic. These errors are hard to diagnose because the failures appear far from the point of entry.

The team has recorded a proposed architectural decision (DL-001) in the decision log that describes how input validation should be handled going forward. Your job is to implement this decision. Read the decision record at `decisions/records/DL-001.md` to understand exactly what needs to be built.

The project is already set up with Decision-Linked Development (DLD). The configuration is in `dld.config.yaml`, decision records live in `decisions/records/`, and shared scripts for managing decisions are available at:

- `.tessl/skills/dld-common/scripts/update-status.sh` — updates a decision's status field
- `.tessl/skills/dld-common/scripts/regenerate-index.sh` — regenerates `decisions/INDEX.md`
- `.tessl/skills/dld-implement/scripts/verify-annotations.sh` — validates that implemented decisions are properly marked in the codebase

## Setup

Before starting, initialize the git repository by running:

```bash
bash setup.sh
```

This is required for the DLD scripts to resolve the project root.

## Output Specification

Complete the following:

1. Implement the validation logic described in DL-001 by modifying `src/processor.py` (or adding a new module, as appropriate).
2. Update the decision record `decisions/records/DL-001.md` to reflect that the decision has been implemented: populate the `references` field and change its status to `accepted` using the provided scripts.
3. Regenerate `decisions/INDEX.md` using the provided script.
4. Run the annotation verification script to confirm the implementation is complete.

When finished, write a file named `steps.md` that lists the steps you followed to implement the decision, including any decisions you looked up along the way and why, and the output of the verification script.
