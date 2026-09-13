from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backboard import BackboardClient
from pydantic import BaseModel
import json

app = FastAPI()
key = "api_key.txt"

with open(key, "r") as f:
    key = f.read().strip()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = BackboardClient(api_key=key)


# ============================================================
# DEFINE A COMPUTER SCIENCE TERM
# ============================================================

@app.get("/define")
async def get_definition(term: str):

    prompt = f"""Define '{term}'.

Format your entire response strictly as a JSON object with exactly these keys:

- 'short_definition': A brief, 1-2 sentence explanation.
- 'detailed_definition': A more comprehensive explanation going into technical depth.
- 'analogy': A helpful analogy.
- 'use_case': A real-world or practical use case for this concept.
- 'is_cs_term': boolean (true if the term is related to computer science, programming, or STEM logic, otherwise false).
- 'python_code_example': A basic, syntactically correct Python code snippet demonstrating the concept. It MUST call print() at least once so running it produces visible output -- if the concept is a function or class, define it AND call it with a sample input, printing the result (e.g. do not just define factorial(n), also include print(factorial(5))). Use \\n for newlines. If not applicable, return an empty string.
- 'experiment_prompt': A short, specific suggestion telling the student to change ONE concrete thing in the python_code_example above and predict what will happen -- referencing an actual value, argument, or line from that exact code (e.g. "Try changing the index from 1 to 2: what happens?" or "Try calling factorial(0) instead of factorial(5): what happens?"). It is rhetorical -- the student is not expected to type an answer anywhere, just experiment and observe. If python_code_example is empty, return an empty string.
- 'quiz_question': A short knowledge-check question based on the concept. If not applicable, return an empty string.

DO NOT wrap your response in markdown code blocks.
Output raw JSON only.
"""

    try:
        response = await client.send_message(prompt, memory="Auto")

        clean_content = response.content.strip()

        # Remove markdown code fences if AI accidentally adds them
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
                "short_definition": ai_data.get(
                    "short_definition",
                    "Definition missing."
                ),
                "detailed_definition": ai_data.get(
                    "detailed_definition",
                    "Detailed definition missing."
                ),
                "analogy": ai_data.get(
                    "analogy",
                    "Analogy missing."
                ),
                "use_case": ai_data.get(
                    "use_case",
                    "Use case missing."
                ),
                "is_cs_term": ai_data.get(
                    "is_cs_term",
                    False
                ),
                "python_code_example": ai_data.get(
                    "python_code_example",
                    ""
                ),
                "experiment_prompt": ai_data.get(
                    "experiment_prompt",
                    ""
                ),
                "quiz_question": ai_data.get(
                    "quiz_question",
                    ""
                )
            }

        except json.JSONDecodeError:
            return {
                "error": f"JSON parsing failed. AI output: {response.content}"
            }

    except Exception as e:
        return {"error": str(e)}


# ============================================================
# QUIZ ANSWER
# ============================================================

class QuizSubmission(BaseModel):
    term: str
    question: str
    answer: str


@app.post("/check_answer")
async def check_answer(sub: QuizSubmission):

    prompt = f"""You are a computer science tutor.

The student is learning about '{sub.term}'.

You asked them this question:
"{sub.question}"

The student answered:
"{sub.answer}"

Evaluate their answer.

Format your response strictly as a JSON object with exactly these two keys:

- 'is_correct': boolean
- 'feedback': A short, 1-2 sentence explanation confirming why it is correct, or explaining what they misunderstood.

DO NOT wrap your response in markdown code blocks.
Output raw JSON only.
"""

    try:
        response = await client.send_message(prompt, memory="Auto")

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
                "is_correct": ai_data.get(
                    "is_correct",
                    False
                ),
                "feedback": ai_data.get(
                    "feedback",
                    "Could not generate feedback."
                )
            }

        except json.JSONDecodeError:
            return {
                "error": "Failed to parse AI evaluation."
            }

    except Exception as e:
        return {"error": str(e)}

# NOTE: Python code execution now happens entirely client-side in
# content.js via Pyodide (WebAssembly), so there is no /execute
# endpoint here anymore. The FastAPI backend only handles the
# AI-generated definitions and quiz grading above.