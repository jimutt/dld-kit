# Project Notes

## Overview

This service handles order processing for our e-commerce platform. It exposes a REST API consumed by the frontend and internal microservices.

## Development Setup

- Requires Node.js 20+
- Run `npm install` before starting
- Use `npm run dev` for local development with hot reload
- Tests: `npm test` (Jest)

## Conventions

- Use conventional commits (`feat:`, `fix:`, `chore:`, etc.)
- Open a PR for all changes — no direct pushes to `main`
- All new endpoints need integration tests
