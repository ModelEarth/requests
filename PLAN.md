# Plan: Migrate Storyboard Generator to Rust API

## Objective
Convert the current Streamlit-based image generator into a static frontend (HTML/JS) backed by the existing ModelEarth `team` Rust API. This aligns with the "high traffic" production architecture.

## Architecture
- **Frontend**: Static HTML + JavaScript in the `requests` repo.
    - Served via `webroot` at `http://localhost:8887/requests/`.
    - Replaces the Streamlit UI.
    - Features: Prompt input, CSV upload, "Generate" button, Image display.
- **Backend**: New endpoint in the `team` repository (Rust/Actix).
    - Served via `webroot` at `http://localhost:8887/api/generate-image` (or similar).
    - Logic: Receives prompt -> Calls Replicate API -> Returns image URL.
    - **Configuration**: Uses existing `team/Cargo.toml`. No new Cargo file will be created in `requests`.

## Implementation Steps

### 1. Backend (Rust) - `team` repo
*The AI agent should look for the `team` repository in the parent directory (`../team`).*

- **Locate Entry Point**: Identify `team/src/main.rs` or the router configuration.
- **New Module**: Create `src/api/image_gen.rs`.
- **Add Endpoint**: Implement a `POST /generate` handler that:
    1. Accepts a JSON payload `{ prompt: "..." }`.
    2. Calls the Replicate API using `reqwest` (ensure dependency exists in `team/Cargo.toml`).
    3. Returns the generated image URL.
- **Environment**: Use `REPLICATE_API_TOKEN` from the existing server environment configuration.

### 2. Frontend (Static) - `requests` repo
- **Index Page**: Create `index.html` with a clean, responsive UI.
- **Scripting**: Create `script.js` to:
    - Handle form submission.
    - Call `fetch('/api/generate-image', { method: 'POST', ... })`.
    - Display the returned image or error.

### 3. Pipeline Integration
- **Nodes Config**: Update `../data-pipeline/nodes.csv` to register "Requests / Image Gen" as a tool.
- **Target**: Point the node URL to the new static page (`/requests/`).

## Verification
- Start the `team` Rust server.
- Open `http://localhost:8887/requests/`.
- Verify that entering a prompt triggers the Rust backend and displays the image.
