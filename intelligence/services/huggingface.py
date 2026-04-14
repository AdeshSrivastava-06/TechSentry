import requests
import json
import os
import re
import time
from django.conf import settings

HF_API_KEY = (
    getattr(settings, 'HF_API_KEY', None)
    or os.getenv('HF_API_KEY')
    or getattr(settings, 'HUGGINGFACE_API_KEY', None)
    or os.getenv('HUGGINGFACE_API_KEY')
)
HF_CHAT_MODEL = getattr(settings, 'HF_CHAT_MODEL', None) or os.getenv('HF_CHAT_MODEL') or 'zai-org/GLM-5.1:cheapest'
HF_CHAT_FALLBACK_MODELS = [
    'zai-org/GLM-5.1:cheapest',
    'openai/gpt-oss-20b:cheapest',
    'openai/gpt-oss-120b:cheapest',
    'meta-llama/Llama-3.1-8B-Instruct:fastest',
]
HF_CHAT_COMPLETIONS_URL = getattr(settings, 'HF_CHAT_COMPLETIONS_URL', None) or os.getenv('HF_CHAT_COMPLETIONS_URL') or 'https://router.huggingface.co/v1/chat/completions'


def _build_headers():
    headers = {"Content-Type": "application/json"}
    if HF_API_KEY:
        headers["Authorization"] = f"Bearer {HF_API_KEY}"
    return headers


HEADERS = _build_headers()


def _run_text_generation(prompt: str, temperature: float = 0.7, max_new_tokens: int = 200, model: str = None):
    """Run a text-generation call on HF Inference and return normalized text."""
    if not HF_API_KEY:
        return {"success": False, "error": "Hugging Face authentication failed. Set HF_API_KEY (or HUGGINGFACE_API_KEY) in backend .env."}

    preferred_model = model or HF_CHAT_MODEL
    models_to_try = [preferred_model] + [m for m in HF_CHAT_FALLBACK_MODELS if m != preferred_model]
    last_error = "Unknown Hugging Face inference error"

    for active_model in models_to_try:
        payload = {
            "model": active_model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_new_tokens,
            "stream": False,
        }

        for _ in range(2):
            try:
                response = requests.post(
                    HF_CHAT_COMPLETIONS_URL,
                    headers=HEADERS,
                    json=payload,
                    timeout=60,
                )
                try:
                    data = response.json()
                except Exception:
                    data = {"error": response.text[:300]}

                if response.status_code == 200:
                    generated_text = ""
                    finish_reason = None
                    if isinstance(data, dict):
                        choices = data.get("choices", [])
                        if choices and isinstance(choices[0], dict):
                            message = choices[0].get("message", {})
                            generated_text = message.get("content", "")
                            finish_reason = choices[0].get("finish_reason")

                    if not generated_text and isinstance(data, list) and data and isinstance(data[0], dict):
                        generated_text = data[0].get("generated_text") or data[0].get("summary_text") or ""

                    generated_text = str(generated_text).strip()
                    if generated_text:
                        return {
                            "success": True,
                            "text": generated_text,
                            "model": active_model,
                            "finish_reason": finish_reason,
                        }

                    last_error = f"Empty response from model {active_model}"
                    break

                if response.status_code in (401, 403):
                    return {
                        "success": False,
                        "error": "Hugging Face authentication failed. Set HF_API_KEY (or HUGGINGFACE_API_KEY) in backend .env.",
                    }

                if response.status_code == 429:
                    last_error = "Hugging Face rate limit reached on free tier. Please retry shortly."
                    break

                if response.status_code == 402:
                    last_error = "Hugging Face included credits are depleted for this token. Add credits or use a different token/provider."
                    break

                if isinstance(data, dict):
                    nested_error = data.get("error")
                    if isinstance(nested_error, dict):
                        error_message = nested_error.get("message", f"API request failed with status {response.status_code}")
                        code = nested_error.get("code")
                    else:
                        error_message = data.get("message") or nested_error or f"API request failed with status {response.status_code}"
                        code = data.get("code")
                    estimated_time = data.get("estimated_time")
                else:
                    error_message = f"API request failed with status {response.status_code}"
                    code = None
                    estimated_time = None

                if code == "model_not_supported":
                    last_error = error_message
                    break

                # Retry current model once if it's loading on HF infrastructure.
                if response.status_code == 503 and estimated_time is not None:
                    wait_seconds = min(max(float(estimated_time), 1.0), 8.0)
                    time.sleep(wait_seconds)
                    last_error = error_message
                    continue

                last_error = error_message
                break
            except Exception as e:
                last_error = str(e)
                break

    return {"success": False, "error": last_error}


def chat_response(messages: list):
    """Generate chatbot response using Hugging Face Inference API."""
    try:
        user_message = ""
        if isinstance(messages, list):
            for item in reversed(messages):
                if isinstance(item, dict) and item.get("role") == "user":
                    user_message = str(item.get("content", "")).strip()
                    break

        if not user_message:
            user_message = "Please provide guidance for defence technology analysis."

        # Keep prompt shaping close to previous behavior while matching HF payload format.
        prompt = (
            "You are TechSentry AI, a senior defence technology intelligence analyst. "
            "Provide practical, structured, concise guidance with assumptions when uncertain. "
            "Avoid oversized markdown tables unless explicitly requested. Always end with a complete final sentence.\n\n"
            f"User: {user_message}\nAssistant:"
        )
        result = _run_text_generation(prompt, temperature=0.7, max_new_tokens=700, model=HF_CHAT_MODEL)
        if not result.get("success"):
            return {"success": False, "error": result.get("error", "Chat generation failed")}

        response_text = result.get("text", "")
        finish_reason = result.get("finish_reason")

        # Continue in bounded passes until the answer appears complete.
        passes = 0
        while _looks_incomplete(response_text, finish_reason) and passes < 3:
            continuation_prompt = (
                f"Original request:\n{user_message}\n\n"
                f"Partial assistant answer:\n{response_text}\n\n"
                "Continue exactly where this stopped. Do not repeat prior lines. "
                "Close any unfinished bullets/sections and end with one complete concluding sentence."
            )
            continuation = _run_text_generation(
                continuation_prompt,
                temperature=0.6,
                max_new_tokens=300,
                model=result.get("model") or HF_CHAT_MODEL,
            )
            if not continuation.get("success") or not continuation.get("text"):
                break

            response_text = f"{response_text}\n\n{continuation.get('text')}".strip()
            finish_reason = continuation.get("finish_reason")
            passes += 1

        # Last-resort recovery: regenerate a concise complete answer from scratch.
        if _looks_incomplete(response_text, finish_reason):
            recovery_prompt = (
                f"User request:\n{user_message}\n\n"
                "Provide a complete, concise answer in 5-8 bullet points and a final concluding sentence. "
                "Do not use markdown tables. Ensure the final line is a complete sentence ending with punctuation."
            )
            recovery = _run_text_generation(
                recovery_prompt,
                temperature=0.5,
                max_new_tokens=450,
                model=result.get("model") or HF_CHAT_MODEL,
            )
            if recovery.get("success") and recovery.get("text"):
                recovered_text = recovery.get("text", "").strip()
                if _looks_incomplete(recovered_text, recovery.get("finish_reason")):
                    recovered_text = f"{recovered_text.rstrip('. ')}."
                response_text = recovered_text

        # Final guard: never return visibly cut-off output to the UI.
        if _looks_incomplete(response_text, finish_reason):
            response_text = (
                "I could not complete the full answer in this request due provider limits. "
                "Please retry once, and if it persists, switch to a supported Hugging Face model/provider with available credits."
            )

        return {"success": True, "response": response_text}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _extract_json_object(text: str):
    """Extract first JSON object from model output for robust parsing."""
    raw = (text or "").strip()
    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except Exception:
            return None


def _looks_incomplete(text: str, finish_reason: str = None):
    """Heuristic check for semantically cut-off assistant responses."""
    if not text or not str(text).strip():
        return True

    if finish_reason == "length":
        return True

    trimmed = str(text).rstrip()

    if trimmed.endswith((":", "-", "•", "|", "(", "[", "{", "/", "…")):
        return True

    if trimmed.count("```") % 2 != 0:
        return True

    if trimmed[-1].isalnum():
        return True

    return False


def generate_trl_assessment(abstracts: list, technology: str):
    combined = "\n\n".join((abstracts or [])[:8])
    prompt = f"""Analyze these research paper abstracts about \"{technology}\" and estimate the Technology Readiness Level (TRL 1-9).

TRL Scale: 1-3=Basic Research, 4-5=Applied/Proof of Concept, 6-7=Prototype/Demo, 8-9=Operational

Abstracts:
{combined}

Respond ONLY in valid JSON format, no extra text:
{{
  "trl_level": <number 1-9>,
  "confidence": <number 0-100>,
  "reasoning": "<2-3 sentence explanation>",
  "key_drivers": ["driver1", "driver2", "driver3"],
  "next_milestone": "<what needs to happen to reach next TRL>"
}}"""

    result = _run_text_generation(prompt, temperature=0.3, max_new_tokens=450, model=HF_CHAT_MODEL)
    if not result.get("success"):
        return {"success": False, "error": result.get("error", "TRL generation failed")}

    parsed = _extract_json_object(result.get("text", ""))
    if not isinstance(parsed, dict):
        return {"success": False, "error": "Invalid JSON format returned for TRL assessment"}

    return {"success": True, "data": parsed}


def generate_technology_summary(query, papers_count, patents_count, news_count):
    prompt = f"""Generate a strategic technology intelligence brief for: \"{query}\"
Available data: {papers_count} research papers, {patents_count} patents, {news_count} recent news articles.

Provide a structured brief with:
1. Executive Summary (3 sentences)
2. Current Maturity Assessment
3. Key Growth Drivers (3 bullet points)
4. Strategic Implications for Defence R&D
5. Recommended Focus Areas

Professional tone, precise language, defence-domain relevant."""

    result = _run_text_generation(prompt, temperature=0.4, max_new_tokens=800, model=HF_CHAT_MODEL)
    if not result.get("success"):
        return {"success": False, "error": result.get("error", "Summary generation failed")}

    return {"success": True, "summary": result.get("text", "")}


def generate_hype_cycle_position(technology, papers_data, patents_data):
    prompt = f"""Analyze \"{technology}\" and determine its position on the technology hype cycle.

Data: {len(papers_data)} papers, {len(patents_data)} patents

Respond in JSON:
{{
  "position": "Innovation Trigger|Peak of Inflated Expectations|Trough of Disillusionment|Slope of Enlightenment|Plateau of Productivity",
  "years_to_maturity": <number>,
  "adoption_rate": "Low|Medium|High",
  "market_maturity": "Emerging|Growing|Mature|Declining"
}}"""

    result = _run_text_generation(prompt, temperature=0.3, max_new_tokens=300, model=HF_CHAT_MODEL)
    if not result.get("success"):
        return {"success": False, "error": result.get("error", "Hype-cycle generation failed")}

    parsed = _extract_json_object(result.get("text", ""))
    if not isinstance(parsed, dict):
        return {"success": False, "error": "Invalid JSON format returned for hype-cycle assessment"}

    return {"success": True, "data": parsed}

def generate_summary(text):
    """Generate summary using Hugging Face API"""
    if not HF_API_KEY:
        return {
            'success': False,
            'error': 'Hugging Face API key not configured',
            'summary': f"This research discusses {text[:100]}... (Summary unavailable - API key not configured)"
        }
    
    try:
        # Try a different model that should be available
        API_URL = "https://api-inference.huggingface.co/models/sshleifer/distilbart-cnn-12-6"
        payload = {"inputs": text[:1024]}  # Limit text length
        response = requests.post(API_URL, headers=HEADERS, json=payload, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            if isinstance(result, list) and len(result) > 0 and 'summary_text' in result[0]:
                return {
                    'success': True,
                    'summary': result[0]['summary_text']
                }
            else:
                # Try fallback model
                return generate_summary_fallback(text)
        elif response.status_code == 410:
            # Model not found, try fallback
            return generate_summary_fallback(text)
        else:
            return {
                'success': False,
                'error': f'API request failed with status {response.status_code}',
                'summary': text[:200] + "..."  # Fallback to truncated text
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'summary': text[:200] + "..."  # Fallback to truncated text
        }

def generate_summary_fallback(text):
    """Fallback summary using a different model"""
    try:
        API_URL = "https://api-inference.huggingface.co/models/t5-small"
        payload = {"inputs": f"summarize: {text[:512]}"}  # T5 uses prefix
        response = requests.post(API_URL, headers=HEADERS, json=payload, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            if isinstance(result, list) and len(result) > 0 and 'generated_text' in result[0]:
                return {
                    'success': True,
                    'summary': result[0]['generated_text']
                }
        
        # If all else fails, return a simple extractive summary
        sentences = text.split('.')
        if len(sentences) > 2:
            return {
                'success': True,
                'summary': '. '.join(sentences[:2]) + '.'
            }
        else:
            return {
                'success': True,
                'summary': text[:200] + "..."
            }
    except Exception as e:
        return {
            'success': False,
            'error': f'Fallback failed: {str(e)}',
            'summary': text[:200] + "..."
        }

def classify_trl_zeroshot(text):
    API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-mnli"
    labels = [
        "basic research", "applied research", "proof of concept",
        "prototype development", "system demonstration",
        "operational deployment"
    ]
    payload = {"inputs": text, "parameters": {"candidate_labels": labels}}
    response = requests.post(API_URL, headers=HEADERS, json=payload)
    return response.json()

def extract_technology_entities(text):
    API_URL = "https://api-inference.huggingface.co/models/dslim/bert-base-NER"
    payload = {"inputs": text[:500]}
    response = requests.post(API_URL, headers=HEADERS, json=payload)
    return response.json()

def analyze_sentiment(text):
    API_URL = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english"
    payload = {"inputs": text[:500]}
    response = requests.post(API_URL, headers=HEADERS, json=payload)
    return response.json()

def extract_technology_convergence(abstracts):
    combined_text = " ".join(abstracts[:5])[:1000]
    API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-mnli"
    
    technology_labels = [
        "artificial intelligence", "machine learning", "quantum computing", 
        "robotics", "cybersecurity", "biotechnology", "nanotechnology",
        "materials science", "energy storage", "communications", "sensors",
        "autonomous systems", "hypersonics", "directed energy", "space technology"
    ]
    
    payload = {"inputs": combined_text, "parameters": {"candidate_labels": technology_labels}}
    response = requests.post(API_URL, headers=HEADERS, json=payload)
    return response.json()
