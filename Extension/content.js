from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backboard import BackboardClient
from pydantic import BaseModel
import requests
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paste your actual Backboard API key below
client = BackboardClient(api_key="espr_m9Hm79rG8YPoedkaTiGnv0VA5Vs8WGrjtVq7wsxDA-8")


@app.get("/define")
async def get_definition(term: str):
    prompt = f"""Define '{term}'. Format your entire response strictly as a JSON object with exactly these keys:
    - 'definition': A short, simple explanation.
    - 'analogy': A helpful analogy.
    - 'is_cs_term': boolean (true if the term is related to computer science, programming, or STEM logic, otherwise false).
    - 'c_code_example': A basic, syntactically correct C programming code snippet demonstrating the concept (use \\n for newlines). If not applicable, return an empty string.
    - 'quiz_question': A short knowledge-check question based on the concept. If not applicable, return an empty string.

    DO NOT wrap your response in markdown code blocks. Output raw JSON only.
    """

    try:
        response = await client.send_message(prompt, memory="Auto")

        # Clean the string in case the AI still used markdown backticks
        clean_content = response.content.strip()
        if clean_content.startswith("```json"):
            clean_content = clean_content[7:]
        if clean_content.startswith("```"):
            clean_content = clean_content[3:]
        if clean_content.endswith("```"):
            clean_content = clean_content[:-3]
        clean_content = clean_content.strip()

        try:
            ai_data = json.loads(clean_content)
            return {
                "term": term,
                "definition": ai_data.get("definition", "Definition missing."),
                "analogy": ai_data.get("analogy", "Analogy missing."),
                "is_cs_term": ai_data.get("is_cs_term", False),
                "c_code_example": ai_data.get("c_code_example", ""),
                "quiz_question": ai_data.get("quiz_question", "")
            }
        except json.JSONDecodeError:
            return {"error": f"JSON parsing failed. AI output: {response.content}"}

    except Exception as e:
        return {"error": str(e)}


# Define the structure for incoming code requests
class CodeExecutionRequest(BaseModel):
    code: str


@app.post("/execute")
def execute_c_code(req: CodeExecutionRequest):
    url = "https://emkc.org/api/v2/piston/execute"
    payload = {
        "language": "c",
        "version": "10.2.0",
        "files": [{"content": req.code}]
    }

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": f"Backend failed to reach compiler: {str(e)}"}
