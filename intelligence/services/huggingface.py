import requests
import json
import os
import re
import time
from django.conf import settings

HF_API_KEY = (
    getattr(settings, 'HFGP_API_KEY', None)
    or os.getenv('HFGP_API_KEY')
    or getattr(settings, 'HF_API_KEY', None)
    or os.getenv('HF_API_KEY')
    or getattr(settings, 'HUGGINGFACE_API_KEY', None)
    or os.getenv('HUGGINGFACE_API_KEY')
)
HF_CHAT_MODEL = (
    getattr(settings, 'HFCHAT_MODEL', None)
    or os.getenv('HFCHAT_MODEL')
    or getattr(settings, 'HF_CHAT_MODEL', None)
    or os.getenv('HF_CHAT_MODEL')
    or 'zai-org/GLM-5.1:cheapest'
)
HF_CHAT_FALLBACK_MODELS = [
    'zai-org/GLM-5.1:cheapest',
    'openai/gpt-oss-20b:cheapest',
    'openai/gpt-oss-120b:cheapest',
    'meta-llama/Llama-3.1-8B-Instruct:fastest',
]
HF_CHAT_COMPLETIONS_URL = getattr(settings, 'HF_CHAT_COMPLETIONS_URL', None) or os.getenv('HF_CHAT_COMPLETIONS_URL') or 'https://router.huggingface.co/v1/chat/completions'
GROQ_API_KEY = getattr(settings, 'GROQ_API_KEY', None) or os.getenv('GROQ_API_KEY')
GROQ_CHAT_MODEL = getattr(settings, 'GROQ_CHAT_MODEL', None) or os.getenv('GROQ_CHAT_MODEL') or 'meta-llama/llama-4-scout-17b-16e-instruct'
GROQ_CHAT_COMPLETIONS_URL = getattr(settings, 'GROQ_CHAT_COMPLETIONS_URL', None) or os.getenv('GROQ_CHAT_COMPLETIONS_URL') or 'https://api.groq.com/openai/v1/chat/completions'


def _build_headers():
    headers = {"Content-Type": "application/json"}
    if HF_API_KEY:
        headers["Authorization"] = f"Bearer {HF_API_KEY}"
    return headers


HEADERS = _build_headers()


def _run_text_generation(prompt: str, temperature: float = 0.7, max_new_tokens: int = 200, model: str = None):
    """Run a text-generation call on HF Inference and return normalized text."""
    if not HF_API_KEY:
        return {"success": False, "error": "Hugging Face authentication failed. Set HF_API_KEY (or HFGP_API_KEY or HUGGINGFACE_API_KEY) in backend .env."}

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
                        "error": "Hugging Face authentication failed. Set HF_API_KEY (or HFGP_API_KEY or HUGGINGFACE_API_KEY) in backend .env.",
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


def _run_chat_generation(prompt: str, temperature: float = 0.7, max_new_tokens: int = 700, model: str = None):
    """Run chatbot generation on Groq OpenAI-compatible endpoint."""
    if not GROQ_API_KEY:
        return {"success": False, "error": "Groq authentication failed. Set GROQ_API_KEY in backend .env."}

    active_model = model or GROQ_CHAT_MODEL
    payload = {
        "model": active_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are TechSentry AI, a senior defence technology intelligence analyst. "
                    "Provide practical, structured, concise guidance with assumptions when uncertain. "
                    "Avoid oversized markdown tables unless explicitly requested. "
                    "Always end with a complete final sentence."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_new_tokens,
        "stream": False,
    }

    try:
        response = requests.post(
            GROQ_CHAT_COMPLETIONS_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )

        try:
            data = response.json()
        except Exception:
            data = {"error": response.text[:300]}

        if response.status_code == 200:
            choices = data.get("choices", []) if isinstance(data, dict) else []
            first_choice = choices[0] if choices and isinstance(choices[0], dict) else {}
            message = first_choice.get("message", {}) if isinstance(first_choice, dict) else {}
            generated_text = str(message.get("content", "")).strip()
            finish_reason = first_choice.get("finish_reason") if isinstance(first_choice, dict) else None

            if generated_text:
                return {
                    "success": True,
                    "text": generated_text,
                    "model": active_model,
                    "finish_reason": finish_reason,
                }

            return {"success": False, "error": f"Empty response from Groq model {active_model}"}

        if response.status_code in (401, 403):
            return {
                "success": False,
                "error": "Groq authentication failed. Check GROQ_API_KEY in backend .env.",
            }

        if response.status_code == 429:
            return {"success": False, "error": "Groq rate limit reached. Please retry shortly."}

        if isinstance(data, dict):
            nested_error = data.get("error")
            if isinstance(nested_error, dict):
                error_message = nested_error.get("message", f"Groq request failed with status {response.status_code}")
            else:
                error_message = data.get("message") or nested_error or f"Groq request failed with status {response.status_code}"
        else:
            error_message = f"Groq request failed with status {response.status_code}"

        return {"success": False, "error": error_message}
    except Exception as e:
        return {"success": False, "error": str(e)}


def chat_response(messages: list):
    """Generate chatbot response using Groq chat completions API."""
    try:
        user_message = ""
        if isinstance(messages, list):
            for item in reversed(messages):
                if isinstance(item, dict) and item.get("role") == "user":
                    user_message = str(item.get("content", "")).strip()
                    break

        if not user_message:
            user_message = "Please provide guidance for defence technology analysis."

        # Keep prompt shaping close to previous behavior.
        prompt = (
            f"User request:\n{user_message}\n\n"
            "Answer with clear, actionable defence-technology analysis."
        )
        result = _run_chat_generation(prompt, temperature=0.7, max_new_tokens=700, model=GROQ_CHAT_MODEL)
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
            continuation = _run_chat_generation(
                continuation_prompt,
                temperature=0.6,
                max_new_tokens=300,
                model=result.get("model") or GROQ_CHAT_MODEL,
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
            recovery = _run_chat_generation(
                recovery_prompt,
                temperature=0.5,
                max_new_tokens=450,
                model=result.get("model") or GROQ_CHAT_MODEL,
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
                "Please retry once, and if it persists, switch to a supported Groq model/provider with available credits."
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
    cleaned_text = str(text or '').strip()

    def _extractive_long_summary(source_text: str):
        if not source_text:
            return ''

        normalized = re.sub(r'\s+', ' ', source_text).strip()
        if not normalized:
            return ''

        units = [s.strip() for s in re.split(r'(?<=[.!?;])\s+|\s+-\s+', normalized) if s.strip()]
        if len(units) < 8:
            units = [
                s.strip()
                for s in re.split(r',\s+|\s+which\s+|\s+including\s+|\s+wherein\s+', normalized, flags=re.IGNORECASE)
                if s.strip()
            ]

        deduped = []
        seen = set()
        for unit in units:
            if len(unit) < 20:
                continue
            key = re.sub(r'[^a-z0-9\s]', '', unit.lower()).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(unit)

        selected = []
        total_chars = 0
        for unit in deduped:
            selected.append(unit)
            total_chars += len(unit)
            if len(selected) >= 10 and total_chars >= 900:
                break
            if len(selected) >= 12 or total_chars >= 2400:
                break

        if not selected:
            fallback = normalized[:1200].strip()
            return fallback if fallback.endswith('.') else f"{fallback}."

        summary = '. '.join(u.rstrip('. ') for u in selected).strip()
        return summary if summary.endswith('.') else f"{summary}."

    def _is_too_short(summary_text: str):
        text_value = str(summary_text or '').strip()
        if not text_value:
            return True
        words = [w for w in re.split(r'\s+', text_value) if w]
        return len(words) < 120 or len(text_value) < 700

    if not HF_API_KEY:
        return {
            'success': False,
            'error': 'Hugging Face API key not configured',
            'summary': _extractive_long_summary(cleaned_text)
        }

    try:
        summary_prompt = (
            "You are a patent analyst. Write a detailed, clear summary of the patent text below. "
            "Requirements: 8-10 sentences, around 160-260 words, no bullet points, no markdown, "
            "focus on problem, method, key technical mechanism, and practical impact. "
            "Do not end abruptly.\n\n"
            f"Patent text:\n{cleaned_text[:7000]}"
        )

        generation = _run_text_generation(
            summary_prompt,
            temperature=0.35,
            max_new_tokens=650,
            model=HF_CHAT_MODEL,
        )

        if generation.get('success'):
            candidate = str(generation.get('text', '') or '').strip()
            if _is_too_short(candidate):
                retry_prompt = (
                    "Rewrite as a longer patent summary with 9-10 complete sentences and at least 180 words. "
                    "No bullets. Keep technical details concrete and readable.\n\n"
                    f"Patent text:\n{cleaned_text[:7000]}"
                )
                retry = _run_text_generation(
                    retry_prompt,
                    temperature=0.3,
                    max_new_tokens=700,
                    model=generation.get('model') or HF_CHAT_MODEL,
                )
                retry_text = str(retry.get('text', '') or '').strip() if retry.get('success') else ''
                if retry_text and not _is_too_short(retry_text):
                    candidate = retry_text

            if not _is_too_short(candidate):
                return {
                    'success': True,
                    'summary': candidate if candidate.endswith('.') else f"{candidate}."
                }

        fallback_result = generate_summary_fallback(cleaned_text)
        fallback_summary = str(fallback_result.get('summary', '') or '').strip()
        if _is_too_short(fallback_summary):
            fallback_summary = _extractive_long_summary(cleaned_text)

        return {
            'success': bool(fallback_summary),
            'summary': fallback_summary,
            'error': generation.get('error', fallback_result.get('error', 'Summary generation fallback used'))
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'summary': _extractive_long_summary(cleaned_text)
        }

def generate_summary_fallback(text):
    """Fallback summary using a different model"""
    cleaned_text = str(text or '').strip()

    def _extractive_long_summary(source_text: str):
        if not source_text:
            return ''

        normalized = re.sub(r'\s+', ' ', source_text).strip()
        if not normalized:
            return ''

        units = [s.strip() for s in re.split(r'(?<=[.!?;])\s+|\s+-\s+', normalized) if s.strip()]
        if len(units) < 8:
            units = [
                s.strip()
                for s in re.split(r',\s+|\s+which\s+|\s+including\s+|\s+wherein\s+', normalized, flags=re.IGNORECASE)
                if s.strip()
            ]

        selected = []
        total_chars = 0
        for unit in units:
            if len(unit) < 20:
                continue
            selected.append(unit.rstrip('. '))
            total_chars += len(unit)
            if len(selected) >= 10 and total_chars >= 900:
                break
            if len(selected) >= 12 or total_chars >= 2400:
                break

        if not selected:
            fallback = normalized[:1200].strip()
            return fallback if fallback.endswith('.') else f"{fallback}."

        summary = '. '.join(selected).strip()
        return summary if summary.endswith('.') else f"{summary}."

    try:
        API_URL = "https://api-inference.huggingface.co/models/t5-small"
        payload = {
            "inputs": f"summarize in 8 to 10 sentences with technical details: {cleaned_text[:2200]}"
        }
        response = requests.post(API_URL, headers=HEADERS, json=payload, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            if isinstance(result, list) and len(result) > 0 and 'generated_text' in result[0]:
                generated = str(result[0]['generated_text'] or '').strip()
                if len(generated) >= 300:
                    return {
                        'success': True,
                        'summary': generated if generated.endswith('.') else f"{generated}."
                    }

                return {
                    'success': True,
                    'summary': _extractive_long_summary(cleaned_text)
                }
        
        # If all else fails, return a long extractive summary
        return {
            'success': True,
            'summary': _extractive_long_summary(cleaned_text)
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'Fallback failed: {str(e)}',
            'summary': _extractive_long_summary(cleaned_text)
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
