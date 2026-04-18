import requests
import os
import json
import html
import re
from datetime import datetime
from django.conf import settings


def _build_google_patent_url(patent_number):
    if not patent_number:
        return ""
    num = str(patent_number).strip().replace(" ", "")
    if not num:
        return ""
    return f"https://patents.google.com/patent/{num}"


def fetch_patent_full_text(patent_url: str):
    """Fetch richer patent text from public patent pages for downstream summarization."""
    url = str(patent_url or "").strip()
    if not url:
        return {"success": False, "error": "No patent URL provided", "text": ""}

    try:
        response = requests.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            },
            timeout=25,
        )
        response.raise_for_status()
        body = response.text or ""

        extracted = []

        # Prefer explicit page descriptions first.
        meta_patterns = [
            r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
        ]
        for pattern in meta_patterns:
            for match in re.findall(pattern, body, flags=re.IGNORECASE):
                text = html.unescape(str(match or "")).strip()
                if text and len(text) > 80:
                    extracted.append(text)

        # Try JSON-LD blocks for more context.
        json_ld_blocks = re.findall(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
            body,
            flags=re.IGNORECASE,
        )
        for block in json_ld_blocks:
            block = (block or "").strip()
            if not block:
                continue
            try:
                parsed = json.loads(block)
                candidates = []
                if isinstance(parsed, dict):
                    candidates = [parsed.get("description"), parsed.get("abstract")]
                elif isinstance(parsed, list):
                    for item in parsed:
                        if isinstance(item, dict):
                            candidates.extend([item.get("description"), item.get("abstract")])

                for candidate in candidates:
                    text = html.unescape(str(candidate or "")).strip()
                    if text and len(text) > 80:
                        extracted.append(text)
            except Exception:
                continue

        # Deduplicate while preserving order.
        deduped = []
        seen = set()
        for chunk in extracted:
            key = re.sub(r"\s+", " ", chunk).strip().lower()
            if key and key not in seen:
                seen.add(key)
                deduped.append(chunk)

        text = " ".join(deduped).strip()
        if not text:
            return {
                "success": False,
                "error": "No detailed patent text found on source page",
                "text": "",
            }

        return {"success": True, "text": re.sub(r"\s+", " ", text).strip()}
    except Exception as e:
        return {"success": False, "error": str(e), "text": ""}


def _search_patents_patentsview(query, num=10):
    """Fallback patent search using PatentsView public API (no API key)."""
    try:
        url = "https://api.patentsview.org/patents/query"
        params = {
            "q": json.dumps({"_text_any": {"patent_title": query}}),
            "f": json.dumps([
                "patent_number",
                "patent_title",
                "patent_date",
                "patent_type",
                "patent_abstract",
                "assignee_organization",
            ]),
            "o": json.dumps({"per_page": num, "page": 1}),
        }

        r = requests.get(url, params=params, timeout=20)
        r.raise_for_status()
        data = r.json() if r.content else {}

        patents = []
        for idx, p in enumerate(data.get("patents", []) or []):
            patent_number = p.get("patent_number", "")
            filing_date = p.get("patent_date", "")
            patents.append(
                {
                    "id": f"{patent_number}_{idx}" if patent_number else f"patent_{idx}",
                    "title": p.get("patent_title", ""),
                    "patent_number": patent_number,
                    "patent_id": patent_number,
                    "assignee": p.get("assignee_organization", ""),
                    "filing_date": filing_date,
                    "publication_date": filing_date,
                    "country": (str(patent_number)[:2] if patent_number else "US"),
                    "abstract": p.get("patent_abstract", ""),
                    "url": _build_google_patent_url(patent_number),
                    "inventor": "",
                }
            )

        return {"success": True, "results": patents, "source": "patentsview"}
    except Exception as e:
        print(f"PatentsView Error: {e}")
        return {"success": False, "error": str(e), "results": [], "source": "patentsview"}


def _get_serp_api_key():
    # Support both naming conventions and env fallback.
    key = (
        getattr(settings, "SERP_API_KEY", "")
        or getattr(settings, "SERPAPI_API_KEY", "")
        or os.getenv("SERP_API_KEY", "")
        or os.getenv("SERPAPI_API_KEY", "")
    )
    return str(key).strip()


def _parse_serp_patents(data):
    # SerpAPI Google Patents returns results under 'patents_results' key
    rows = data.get("patents_results") or data.get("organic_results") or []
    patents = []
    for idx, p in enumerate(rows):
        # SERP API uses 'patent_id' for Google Patents engine
        patent_number = p.get("patent_id", p.get("patent_number", ""))
        # Extract URL from various possible fields
        url = p.get("patent_url") or p.get("link") or p.get("pdf") or ""
        if not url and patent_number:
            url = _build_google_patent_url(patent_number)
        
        # Ensure we have a valid date for filtering
        pub_date = p.get("publication_date", "")
        filing_date = p.get("filing_date", "")
        
        patents.append(
            {
                "id": f"{patent_number}_{idx}" if patent_number else f"patent_{idx}",
                "title": p.get("title", ""),
                "patent_number": patent_number,
                "patent_id": patent_number,  # For compatibility
                "assignee": p.get("assignee", ""),
                "filing_date": filing_date,
                "publication_date": pub_date or filing_date or "",
                "country": p.get("country", "US"),
                "abstract": p.get("snippet", p.get("abstract", "")),
                "url": url,
                "inventor": p.get("inventor", ""),
            }
        )
    return patents


def _generate_local_patent_fallback(query, num=10):
    # Deterministic local fallback so UI remains functional if external patent APIs are unavailable.
    q = (query or "technology").strip()
    q_title = " ".join(word.capitalize() for word in q.split()) or "Technology"
    year = datetime.now().year
    templates = [
        "Adaptive {q} Guidance and Control System",
        "Distributed Sensor Fusion for {q} Platforms",
        "Low-Latency Signal Processing Method for {q}",
        "Secure Edge Architecture for {q} Operations",
        "Power-Efficient Hardware Stack for {q} Workloads",
        "Autonomous Calibration Pipeline for {q} Systems",
        "Mission-Aware Decision Engine for {q}",
        "Robust Tracking Framework in {q} Environments",
        "Resilient Communications Protocol for {q}",
        "Multi-Source Data Assimilation for {q}",
    ]

    assignees = [
        "Defence Research Laboratory",
        "Advanced Systems Group",
        "National Technology Institute",
        "Strategic Innovation Directorate",
        "Integrated Mission Systems",
    ]

    results = []
    limit = max(1, int(num))
    for i in range(limit):
        idx = i % len(templates)
        number = f"US{year - (i % 6)}{100000 + i}A1"
        pub_year = year - (i % 6)
        filing_date = f"{pub_year - 1}-09-15"
        pub_date = f"{pub_year}-04-10"
        results.append(
            {
                "id": f"local_patent_{i}",
                "title": templates[idx].format(q=q_title),
                "patent_number": number,
                "patent_id": number,
                "assignee": assignees[i % len(assignees)],
                "filing_date": filing_date,
                "publication_date": pub_date,
                "country": "US",
                "abstract": (
                    f"Local fallback patent for {q_title}. Generated because external patent providers "
                    "were unavailable at request time. This is sample data for demonstration."
                ),
                "url": _build_google_patent_url(number),
                "inventor": "Team TechSentry",
            }
        )

    return {
        "success": True,
        "results": results,
        "source": "local_fallback",
        "warning": "External patent providers unavailable; showing local fallback results.",
    }

def search_patents(query, num=10):
    """
    Search for patents using SERP API (Google Patents).
    Falls back to PatentsView API if SERP fails, then local fallback.
    """
    api_key = _get_serp_api_key()
    if not api_key:
        print("No SERP API key configured. Falling back to PatentsView.")
        fallback = _search_patents_patentsview(query, num=num)
        if fallback.get("success") and fallback.get("results"):
            return fallback
        return _generate_local_patent_fallback(query, num=num)
    
    url = "https://serpapi.com/search"
    params = {
        "engine": "google_patents",
        "q": query,
        "api_key": api_key,
        "num": num
    }
    
    try:
        print(f"Searching SERP API for patents: query='{query}', num={num}")
        r = requests.get(url, params=params, timeout=15)
        data = r.json() if r.content else {}

        if r.status_code != 200:
            error_text = data.get("error") if isinstance(data, dict) else None
            raise RuntimeError(error_text or f"SerpAPI HTTP {r.status_code}")

        if isinstance(data, dict) and data.get("error"):
            raise RuntimeError(data.get("error"))

        # Debug: print response keys
        if isinstance(data, dict):
            print(f"SERP API response keys: {list(data.keys())}")
            if "patents_results" in data:
                print(f"Found {len(data.get('patents_results', []))} patent results")
            if "organic_results" in data:
                print(f"Found {len(data.get('organic_results', []))} organic results")

        patents = _parse_serp_patents(data)

        if patents:
            print(f"Successfully parsed {len(patents)} patents from SERP API")
            return {"success": True, "results": patents, "source": "serpapi_google_patents"}

        # SerpAPI responded but no results, fallback to PatentsView.
        print("No patent results from SERP API. Trying PatentsView fallback.")
        fallback = _search_patents_patentsview(query, num=num)
        if fallback.get("success") and fallback.get("results"):
            return fallback

        return {"success": True, "results": [], "source": "serpapi_google_patents"}
    except Exception as e:
        print(f"SERP Patents Error: {e}")
        error_message = str(e)

        fallback = _search_patents_patentsview(query, num=num)
        if fallback.get("success") and fallback.get("results"):
            print(f"Using PatentsView fallback after SERP error: {len(fallback.get('results', []))} results")
            return fallback
        
        local = _generate_local_patent_fallback(query, num=num)
        local["warning"] = f"SerpAPI failed: {error_message}. Using local fallback results."
        print(f"Using local fallback after all APIs failed. Warning: {local['warning']}")
        return local

def get_patents_per_year(query, years=10):
    """Get patent filing trends by year using SERP API."""
    api_key = _get_serp_api_key()
    if not api_key:
        current_year = datetime.now().year
        data = {year: max(1, 12 - (current_year - year)) for year in range(current_year - years, current_year + 1)}
        return {
            "success": True,
            "data": data,
            "source": "local_fallback",
            "warning": "SERP_API_KEY not found. Returning estimated local trend.",
        }
    
    url = "https://serpapi.com/search"
    data = {}
    current_year = datetime.now().year
    
    print(f"Getting patent trends for '{query}' over {years} years")
    
    for year in range(current_year - years, current_year + 1):
        params = {
            "engine": "google_patents",
            "q": f"{query} {year}",
            "api_key": api_key,
            "num": 100
        }
        try:
            r = requests.get(url, params=params, timeout=10)
            if r.status_code == 200:
                result = r.json()
                # Try patents_results first (correct for Google Patents), then organic_results
                patent_count = len(result.get("patents_results", result.get("organic_results", [])))
                data[year] = patent_count
                print(f"Year {year}: {patent_count} patents found")
            else:
                data[year] = 0
        except Exception as e:
            print(f"Error fetching patents for {year}: {e}")
            data[year] = 0
    
    return {"success": True, "data": data, "source": "serpapi_google_patents"}

def get_top_patent_assignees(query, limit=10):
    """Get top patent assignees/companies using SERP API."""
    api_key = _get_serp_api_key()
    if not api_key:
        fallback = _generate_local_patent_fallback(query, num=max(5, limit * 2))
        assignees = {}
        for patent in fallback.get("results", []):
            assignee = patent.get("assignee", "Unknown")
            assignees[assignee] = assignees.get(assignee, 0) + 1
        sorted_assignees = sorted(assignees.items(), key=lambda x: x[1], reverse=True)[:limit]
        return {
            "success": True,
            "assignees": dict(sorted_assignees),
            "source": "local_fallback",
            "warning": "SERP_API_KEY not found. Returning estimated local assignees.",
        }
    
    url = "https://serpapi.com/search"
    params = {
        "engine": "google_patents",
        "q": query,
        "api_key": api_key,
        "num": 100
    }
    try:
        print(f"Fetching top assignees for '{query}' (limit: {limit})")
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        
        # Try patents_results first (correct for Google Patents), then organic_results
        patent_list = data.get("patents_results", data.get("organic_results", []))
        print(f"Found {len(patent_list)} patents, extracting assignees")
        
        assignees = {}
        for patent in patent_list:
            assignee = patent.get("assignee", "Unknown")
            if assignee and assignee != "Unknown":
                assignees[assignee] = assignees.get(assignee, 0) + 1
        
        # Sort by count and return top limit
        sorted_assignees = sorted(assignees.items(), key=lambda x: x[1], reverse=True)[:limit]
        print(f"Top assignees found: {len(sorted_assignees)}")
        return {
            "success": True,
            "assignees": dict(sorted_assignees),
            "source": "serpapi_google_patents"
        }
    except Exception as e:
        print(f"SERP Assignees Error: {e}")
        return {"success": False, "error": str(e), "assignees": {}}
