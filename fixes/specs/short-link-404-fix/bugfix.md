# Bugfix Requirements Document

## Introduction

Snip is a URL shortener (Node.js/Express backend, React + Vite frontend, deployed on Vercel). When a user submits a long URL, the backend stores it and returns a short code; visiting the short URL should issue a 301 redirect to the original URL.

Users report that visiting a generated short link returns a 404 ("Short URL not found or has been deleted") instead of redirecting. The user has confirmed this happens in **both** the local and the Vercel-deployed environments.

Two independent root causes produce the same 404 symptom:

1. **Non-durable storage.** When `MONGODB_URI` is unset, the backend uses an in-memory store (`memoryUrlStore.js`) whose data lives only in process memory. On Vercel's serverless functions, the create request and the later redirect request can be served by different instances or after a cold start, so the code lookup returns `null`. Locally, the same loss happens on any server restart.

2. **Routing/validation mismatch for custom codes.** The API accepts custom codes matching `/^[a-zA-Z0-9_-]+$/` with no length limit, but `vercel.json` only forwards paths matching `^/([a-zA-Z0-9_-]{4,12})$` to the backend, and the Mongo schema enforces a 4–12 length. A custom code shorter than 4 or longer than 12 characters is created successfully (in memory mode) yet its short link is never routed to the redirect handler in production (the static frontend serves it → 404). Under Mongo mode the same input instead fails with a generic 500, so validation is inconsistent across stores.

This document captures the defective behavior, the expected correct behavior, and the existing behavior that must be preserved.

## Bug Analysis

### Current Behavior (Defect)

What currently happens when the bug is triggered.

1.1 WHEN a short link is created while `MONGODB_URI` is unset (in-memory store) and the redirect request is later served by a different serverless instance or after a process/cold-start restart THEN the system returns 404 ("Short URL not found or has been deleted") instead of redirecting, because the in-memory mapping is no longer present.

1.2 WHEN a custom code whose length is less than 4 or greater than 12 characters is created and then visited in the Vercel-deployed environment THEN the system never forwards the request to the redirect handler (the static frontend serves the path) and the visitor receives a 404.

1.3 WHEN a custom code whose length is outside the 4–12 range is submitted THEN the system behaves inconsistently across stores: the in-memory store accepts it (creating an unroutable link), while the Mongo store rejects it with a generic 500 "Server error" rather than a clear validation message.

### Expected Behavior (Correct)

What should happen instead.

2.1 WHEN a short link is created and later visited THEN the system SHALL resolve the short code and issue a 301 redirect to the original URL regardless of which serverless instance handles the redirect or whether the process restarted between create and visit.

2.2 WHEN a custom code is accepted at creation time THEN the system SHALL ensure the resulting short link is routable to the redirect handler in every environment, so any short link the system hands back issues a 301 redirect when visited.

2.3 WHEN a custom code whose length is outside the supported 4–12 range is submitted THEN the system SHALL reject it consistently with a 400 validation error and a clear message, regardless of which store (in-memory or Mongo) is active.

### Unchanged Behavior (Regression Prevention)

Existing behavior that must be preserved.

3.1 WHEN a valid auto-generated code (nanoid, 6 characters, within the 4–12 range) is created and visited THEN the system SHALL CONTINUE TO issue a 301 redirect to the original URL.

3.2 WHEN a custom code within the 4–12 character range that does not already exist is submitted THEN the system SHALL CONTINUE TO accept it and redirect correctly when visited.

3.3 WHEN a custom code that already exists is submitted THEN the system SHALL CONTINUE TO return 409 "Custom code already taken".

3.4 WHEN `originalUrl` is missing or not a valid URL THEN the system SHALL CONTINUE TO return a 400 validation error.

3.5 WHEN a short code that does not exist or has been soft-deleted is visited THEN the system SHALL CONTINUE TO return 404, and an expired short code SHALL CONTINUE TO return 410.
