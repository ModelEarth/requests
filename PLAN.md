# Plan: Migrate Storyboard Generator to Rust (X.ai / Grok)

## Meta-Instruction for AI Agents
When this plan is run, and followed by subsequent prompts that adjust the results, update this plan to include those adjustments clearly by adding revisions within the plan rather than simply appending to the end.

## Objective
Develop a high-performance image and text generation tool using the **X.ai (Grok) API** via a Rust backend. The application will serve a static frontend from the existing `team` repository (`webroot`), removing the dependency on Streamlit. Future support for OpenAI and Claude will be architected from the start.

## Architecture

### 1. Frontend (Static)
- **Repo**: `requests`
- **Path**: Served via `webroot` at `http://localhost:8887/requests/`
- **Tech**: HTML, CSS, Vanilla JavaScript.
- **Key Features**:
  - Prompt input and CSV upload.
  - "Arts Engine" widget to securely save the user's GitHub Token.
  - Image/Text display area.

### 2. Backend (Rust)
- **Repo**: `team`
- **Tech**: Rust (Actix-Web).
- **Primary API**: **X.ai (Grok)**.
- **Secondary Support**: Architecture will support OpenAI and Anthropic (Claude) via trait-based design.
- **Endpoints**:
  - `POST /api/generate`: Handles requests to X.ai/Grok.
  - `POST /api/github/push`: Handles saving generated content to the user's GitHub repo.

## Implementation Steps

### Step 1: Rust Backend (X.ai Integration)
- **Dependencies**: Add `xai-sdk` (or `reqwest` for direct API calls if SDK is immature) to `team/Cargo.toml`.
- **API Client**: Implement a modular client in `src/api/ai_client.rs`.
  - **Interface**: Create a `GenerativeModel` trait to allow easy swapping between X.ai, OpenAI, and Claude.
  - **X.ai Implementation**: Use the X.ai API key from environment variables to authenticate and send prompt requests.
- **Routes**: Add handlers in `src/main.rs` to process frontend requests and forward them to the X.ai client.

### Step 2: Frontend & "Arts Engine" Widget
- **GitHub Token Widget**: Embed the "Arts Engine" token manager in `requests/index.html` to allow users to save their credentials for direct repo pushing.

        <!-- Arts Engine / GitHub Token Widget -->
        <link rel="stylesheet" href="/projects/css/issues.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.1/css/all.min.css">
        <script src="/projects/js/issues.js"></script>

        <!-- The widget will render here. We will set the title to "Arts Engine" via JS or config -->
        <div id="issues-root"></div>
        <script>
            // Configuration to set title to "Arts Engine"
            // (Implementation detail: Check issues.js for title variable override)
        </script>

### Step 3: Deployment & Workflow
- **Webroot**: Ensure the `team` server maps the `requests` folder to `/requests`.
- **Testing**:
  1. User enters prompt in static UI.
  2. Rust backend sends prompt to X.ai (Grok).
  3. Grok returns content.
  4. App uses the stored GitHub Token to push the result to the user's repo.

## References
- **X.ai API Docs**: [https://docs.rs/api_xai/latest/api_xai/](https://docs.rs/api_xai/latest/api_xai/)
- **GitHub Token Setup**: [http://localhost:8887/localsite/start/steps/github-token/](http://localhost:8887/localsite/start/steps/github-token/)
