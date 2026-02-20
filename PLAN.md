# “Arts Engine” with X.ai Rust API

Develop a high-performance text, image and video generation tool using the **X.ai (Grok) API** via a Rust backend. The application will serve a JamStack static frontend from either "requests/codex" or "requests/claude" subfolder based on the current CLI. 

## Meta-Instruction for AI Agents

Start by copying the requests/PLAN.md file to your own "requests/codex" or "requests/claude" subfolder since the other CLI will be organizing its own updates in a copy of the PLAN.md file too. Include your start time, end time and total time in the copied PLAN.md file. Update the copied file as you proceed and whenever you resume.

In your subfolder, add the following index.html starter:

https://raw.githubusercontent.com/ModelEarth/localsite/refs/heads/main/start/template/index.html

Update the plan copy as you figure out details and make progress, and when prompted to make updates after the app is generated. We will run the copied plan again using your adjusted details in the copy. Intergrate specs into the copied plan's text.

## Progress Checkboxes

Tracks Code CLI progress in case you get interupted:

[Add and update progress checkboxes here]

## Guidance and Rust API References

File paths start from the webroot folder.

AGENTS.md
localsite/AGENTS.md - JamStack UI
team/AGENTS.md - Existing Rust backend

X.ai API Docs, including Rust
https://docs.rs/api_xai/latest/api_xai/

## Objective

Implement comprehensive Rust client for X.AI’s Grok API provided by:
https://docs.rs/api_xai/latest/api_xai/



## Loads prompts from textbox, .csv files and outputs to GitHub

Enter a prompt or load prompts from a .csv file.

### Features

- **Prompt Selection**: Users can choose from a variety of predefined prompts listed in a .csv file.
- **Image/Video Generation**: The app generates images and videos in storyboard sequences based on the selected prompts
- **Multiple Aspect Ratios**: Supports the creation of image rations and 5 default formats: square, 2 horizontal and 2 verticle. 
- Saves seleceted format and other choices to browser cacher

## Storyboard Flowcharts

Flowcharts in the style of FloraFauna and ComfyUI provide editors with scene overviews. We're automating prompts for scene flow based on local industry levels and related factors.

Ggalleries will also reside to the right of reading material on 1/3 of the screen to provide processes aimed at increasing reading rates for K-12 graders - during visual story generation.  The current page layout is structured to display prompted gallery images adjacent to related text. We also display output within our JQuery Gallery and via our FeedPlayer.

All intefaces are modern and responsive for mobile, with .dark mode css styles invoked by the existing localsite navigation settings.

## Architecture

### Frontend (Static)
- **Repo**: `requests` and other repos (submodules) in the webroot.
- **Path**: Served via `webroot` at `http://localhost:8887/requests/[claude or codex]`
- **Tech**: HTML, CSS, JavaScript, Rust backend with X.ai (Grok) API

- **Key Features**:

  - Inputs from both prompt and multiple files to provide csv and images to LLM APIs, similar to Google NotebookLM.

  - The team/js/map.js process used in http://localhost:8887/team/projects/map/#show=liaisons&id=5 will be updated for continuing use in both its existing "team" (team/projects/map) interface, and in the new "requests" interface. The display of details in #locationDetails provides a reusable image gallery, and the existing #detailmap map where LLM responses that include locations can be displayed with mappoints and a list that appears after #locationDetails in the existing team/js/map.js widget.

  - Results sent to user's designated repo using their cached GitHub Token for auth, with the token saved by reusing the existing interface from projects/js/issues.js

    <!-- Arts Engine / GitHub Token Widget Inclusion -->
    <link rel="stylesheet" href="/projects/css/issues.css">
    <script src="/projects/js/issues.js"></script>

    <!-- The widget will render here. We will set the title to "Arts Engine" via JS or config -->
    <div id="issues-root"></div>

## Backend

Where possible, integerate existing Rust processes from the team repo (submodule). If changes to the team repo Rust would be significant, use Rust setup from api_xai sample independently in the "requests" repo.

Findings and recommendations on integration with team repo Rust:

Multiple LLMs - Include structure for future integration of OpenAI, Gemini and Claude APIs using existing settings from the existing docker/.env file and trait-based design [explain that here].

- **Endpoints**:

[Add endpoints here]


## Implementation Steps

### Rust Backend (X.ai Integration)
- **API Client**: Implement a modular client
  - **Interface**: Create a `GenerativeModel` trait to allow easy swapping between X.ai, OpenAI, Gemini, and Claude.
  - **X.ai Implementation**: Use API keys stored in docker/.env to authenticate and send prompt requests. The docker repo already resides in the webroot. Update docker/.env.example with keys for secret values. 
- **Routes**: Add handlers to process frontend requests and forward them to the X.ai client using Rust.


### Usage Tests
  1. User enters prompt in static UI.
  2. Rust backend sends prompt to X.ai (Grok).
  3. Grok returns content.
  4. App uses the stored GitHub Token to push the result to the user's repo based on user interaction.