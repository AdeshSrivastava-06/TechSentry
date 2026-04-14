import requests
from django.conf import settings
import json

def search_companies(query, limit=5):
  """Search entities in Wikidata using stable wbsearchentities endpoint."""
  try:
    url = "https://www.wikidata.org/w/api.php"
    params = {
      "action": "wbsearchentities",
      "search": query,
      "language": "en",
      "format": "json",
      "limit": max(1, int(limit)),
      "type": "item",
    }
    headers = {"User-Agent": "TechSentry/1.0 (company-search)"}
    response = requests.get(url, params=params, headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()
  except Exception as e:
    return {"search": [], "error": str(e)}

def get_company_details(company_name):
    # Escape the company name for SPARQL
    escaped_name = company_name.replace('"', '\\"')
    
    sparql_query = f"""
    SELECT ?company ?companyLabel ?countryLabel ?industryLabel ?founded ?employees ?revenue ?website WHERE {{
      ?company wdt:P31 wd:Q6881511;
                rdfs:label ?companyLabel;
                wdt:P17 ?country.
      OPTIONAL {{ ?company wdt:P452 ?industry. }}
      OPTIONAL {{ ?company wdt:P571 ?founded. }}
      OPTIONAL {{ ?company wdt:P1128 ?employees. }}
      OPTIONAL {{ ?company wdt:P2139 ?revenue. }}
      OPTIONAL {{ ?company wdt:P856 ?website. }}
      FILTER(LANG(?companyLabel) = "en")
      FILTER(?companyLabel = "{escaped_name}"@en)
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    LIMIT 1
    """
    
    url = settings.WIKIDATA_SPARQL
    params = {
        "query": sparql_query,
        "format": "json"
    }
    response = requests.get(url, params=params)
    return response.json()

def get_technology_companies(technology_query, limit=10):
  """Return technology-related company/entity candidates from Wikidata."""
  return search_companies(technology_query, limit=limit)
