Loads prompts from .csv files and outputs to GitHub
Enter a prompt or load prompts from a .csv file.

Features
Prompt Selection: Users can choose from a variety of predefined prompts listed in a .csv file.

Image Generation: The app generates images based on the selected prompt using the Replicate model.

Multiple Aspect Ratios: Supports the creation of images in square and horizontal formats.

GitHub Integration: Automatically saves generated images to a specified GitHub repository.

Getting Started
You'll be running a Streamlit app that transforms text prompts in .csv files into storyboard images.

Prerequisites
Streamlit

Pandas

Replicate Python Client

Python Requests

Pillow (PIL)

Installation
1.) Clone the repository to your local computer.

2.) Navigate to the directory, start a virtual env, and install the required packages:

For mac:

bash
python3 -m venv env && 
source env/bin/activate &&
pip install -r requirements.txt
For windows (PowerShell):

bash
python -m venv env
.\env\Scripts\activate
pip install -r requirements.txt
(Note: If python is not found, try py or ensure Python is added to your PATH.)

3.) Set up your secrets file:

Create a folder named .streamlit in the root directory (e.g., requests/.streamlit).
Copy the content of example_secrets.toml into a new file named secrets.toml inside that folder.

4.) Configure GitHub integration:

In .streamlit/secrets.toml, update the following keys:

GITHUB_TOKEN: Create a classic token at GitHub Settings -> Developer Settings -> Personal access tokens. Select the repo (Full control) and workflow scopes.

GITHUB_REPOSITORY: Your fork, in the format your-username/requests.

5.) Configure Replicate API:

Update REPLICATE_API_TOKEN in .streamlit/secrets.toml.

Get a token from Replicate API Tokens.

Ensure the REPLICATE_MODEL_ENDPOINTSTABILITY key from the example file is also present in your secrets.

Note: Free accounts may receive "Insufficient Credit" errors (Status 402) for certain models. You can add a credit card to resolve this.

6.) Update the .csv file with your prompts.

7.) Run our .csv prompt input version:

text
  streamlit run code_gen_images_sq_wide_ME.py
Or run the original Streamlit app (without .csv input, nor output to GitHub):

text
  streamlit run streamlit_app.py
8.) The Streamlit app should open automatically in your web browser at port 8501 (usually).

9.) Use the sidebar to select a prompt from the .csv file.

10.) Click on 'Generate Image' to start the image generation process.

11.) View the generated images in different aspect ratios.

12.) Check your GitHub repository for the saved images.