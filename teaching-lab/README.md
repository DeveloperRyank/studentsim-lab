# StudentSim teaching laboratory — Vercel edition

The redesigned four-section classroom. The repository root preserves the original prototype; Vercel builds this teaching-lab directory.

## Architecture
Vercel serves the interface and a server-side API gateway. The existing owner-private Sites Worker retains durable D1 profiles, learning events, and the Groq secret. The gateway uses a platform service credential plus a separate server-only shared key. Browser requests never receive either secret. The Worker uses a configured fixed owner for this single-owner deployment, preserving existing student records. This is not a multi-tenant deployment.

Vercel Authentication must remain enabled for this project, including API routes. The classroom exposes the owner's records through the gateway, so do not disable deployment protection or add an unprotected custom domain without adding application-level authentication first.

## Runtime settings
Set STUDENTSIM_BACKEND_URL, STUDENTSIM_SERVICE_TOKEN, and STUDENTSIM_SERVICE_KEY on Vercel. Mark the latter two sensitive. Keep LLM_API_KEY in Sites; the value does not need copying. The Worker needs SERVICE_KEY and SERVICE_OWNER, set through Sites runtime settings. Configure LLM_MODEL for text and LLM_VISION_MODEL for diagrams.

Run npm test and npm run build from this directory. npm run dev starts a local development server on port 3000. The browser uses only same-origin /api routes. No local file storage or ephemeral Vercel filesystem is used for product records.

The provider module validates structured output, trims key whitespace, reports authentication/rate-limit/model errors explicitly, and separates text and vision model selection. No deterministic student responses exist. Learning evaluation is separate from dialogue and only evaluated independent understanding earns XP.

The private GET /api/provider-check operation performs a real provider request without creating lesson history. Invalid provider JSON never updates the student state.

## Provider incident resolved
Groq returned HTTP 404 with model_not_found for llama-3.3-70b-versatile. Its authenticated models endpoint did not list that model. The backend now selects openai/gpt-oss-20b from the live model list. No vision-capable model was returned for this key, so whiteboard image interpretation reports an explicit capability error.
