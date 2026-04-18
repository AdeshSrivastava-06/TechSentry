import requests
import os
from django.conf import settings
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def search_companies(query, page=1, num=10):
    """Search for companies using OpenCorporates API"""
    try:
        base_url = "https://api.opencorporates.com/v0.4/companies/search"
        params = {
            "q": query,
            "per_page": num,
            "page": page
        }
        
        api_key = os.getenv('OPENCORPORATES_API_KEY', '').strip()
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        
        response = requests.get(base_url, params=params, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        
        # Transform OpenCorporates data to our format
        companies = []
        for item in data.get("results", {}).get("companies", []):
            raw = item.get("company", item) if isinstance(item, dict) else {}
            company_number = raw.get("company_number", "")
            jurisdiction_code = raw.get("jurisdiction_code", "")
            company_name = raw.get("name", "")
            company_url = raw.get("opencorporates_url") or ""
            if not company_url and jurisdiction_code and company_number:
                company_url = (
                    f"https://opencorporates.com/companies/"
                    f"{jurisdiction_code}/{company_number}"
                )

            industry_codes = raw.get("industry_codes") or []
            if isinstance(industry_codes, list):
                industry_text = ", ".join(
                    str(code.get("description") or code.get("code") or "").strip()
                    for code in industry_codes
                    if isinstance(code, dict)
                ).strip(", ")
            else:
                industry_text = str(industry_codes or "").strip()

            company = {
                "id": f"{jurisdiction_code}/{company_number}" if company_number else company_name,
                "name": company_name,
                "companyLabel": {
                    "value": company_name
                },
                "countryLabel": {
                    "value": jurisdiction_code.upper() if jurisdiction_code else ""
                },
                "description": industry_text or raw.get("current_status", ""),
                "incorporation_date": raw.get("incorporation_date", ""),
                "company_status": raw.get("company_type", ""),
                "registered_address": raw.get("registered_address_in_full", ""),
                "officers": raw.get("officers", []),
                "current_status": raw.get("current_status", ""),
                "source_url": company_url,
                "source": "opencorporates",
            }
            companies.append(company)
        
        return companies
        
    except Exception as e:
        print(f"OpenCorporates API error: {e}")
        return []

def get_company_details(company_id):
    """Get detailed company information using OpenCorporates"""
    try:
        url = f"https://api.opencorporates.com/v0.4/companies/{company_id}"
        headers = {
            "Authorization": f"Bearer {os.getenv('OPENCORPORATES_API_KEY', '')}"
        }
        
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        return response.json()
        
    except Exception as e:
        print(f"OpenCorporates company details error: {e}")
        return None
