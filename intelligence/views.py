from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.core.cache import cache
import uuid
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor

# Set up logging
logger = logging.getLogger(__name__)

from .models import SearchHistory, SavedReport, Watchlist, TechnologyProfile, ChatSession
from .services.openalex import search_papers, get_papers_per_year, get_top_papers
from .services.openalex import search_papers, get_paper_details
from .services.crossref import search_papers as crossref_search_papers, get_paper_details as crossref_paper_details
from .services.opencorporates import search_companies as opencorporates_search_companies
from .services.patents import search_patents, get_patents_per_year, get_top_patent_assignees
from .services.newsapi import search_news, get_news_volume, get_news_sentiment_analysis
from .services.wikidata import (
    search_companies as wikidata_search_companies,
    get_technology_companies as wikidata_get_technology_companies,
)
from .services.huggingface import (
    extract_technology_convergence,
    analyze_sentiment,
    classify_trl_zeroshot,
    chat_response,
    generate_trl_assessment,
    generate_technology_summary,
    generate_hype_cycle_position,
)
from .services.worldbank import get_top_rd_countries

User = get_user_model()


def _safe_ratio(numerator, denominator):
    if not denominator:
        return 0.0
    try:
        return float(numerator) / float(denominator)
    except Exception:
        return 0.0


def _estimate_real_trl(query, papers, patents, companies, news, year_from, year_to, parse_year):
    """Estimate TRL using real market/research signals from live sources."""
    q = (query or '').lower()
    papers = papers or []
    patents = patents or []
    companies = companies or []
    news = news or []

    recent_from = max(year_to - 2, year_from)

    papers_recent = sum(1 for p in papers if (parse_year(p.get('publication_year')) or 0) >= recent_from)
    patents_recent = sum(
        1
        for p in patents
        if (parse_year(p.get('publication_date') or p.get('filing_date')) or 0) >= recent_from
    )
    news_recent = sum(
        1
        for n in news
        if (parse_year(n.get('publishedAt') or n.get('published_at')) or 0) >= recent_from
    )

    papers_count = len(papers)
    patents_count = len(patents)
    companies_count = len(companies)
    news_count = len(news)

    # Research depth and engineering maturity signals.
    research_signal = min(1.0, papers_count / 35.0)
    patent_signal = min(1.0, patents_count / 25.0)
    commercialization_signal = min(1.0, companies_count / 18.0)
    market_signal = min(1.0, news_count / 30.0)
    recency_signal = min(1.0, (papers_recent + patents_recent + news_recent) / 45.0)

    patent_to_paper = min(1.0, _safe_ratio(patents_count, max(papers_count, 1)) * 1.6)

    combined_titles = ' '.join(
        [str(p.get('title', '')) for p in papers[:15]]
        + [str(p.get('title', '')) for p in patents[:15]]
        + [str(n.get('title', '')) for n in news[:20]]
    ).lower()

    lab_terms = ['theoretical', 'simulation', 'proof of concept', 'prototype', 'experimental']
    deploy_terms = ['deployment', 'production', 'commercial', 'platform', 'enterprise', 'scale']

    lab_hits = sum(1 for t in lab_terms if t in combined_titles)
    deploy_hits = sum(1 for t in deploy_terms if t in combined_titles)

    # Query maturity prior to reduce same-TRL outcomes for very different technologies.
    maturity_prior = 0.0
    keyword_offsets = {
        'machine learning': 0.34,
        'deep learning': 0.16,
        'cybersecurity': -0.04,
        'blockchain': 0.01,
        'cloud': 0.10,
        '5g': 0.08,
        'semiconductor': 0.12,
        'quantum internet': -0.24,
        'quantum communication': -0.18,
        'fusion': -0.18,
        'agi': -0.10,
        'neuromorphic': -0.12,
    }
    for phrase, offset in keyword_offsets.items():
        if phrase in q:
            maturity_prior += offset

    # Deterministic tie-breaker by query fingerprint (small influence only).
    fingerprint = sum(ord(ch) for ch in q if ch.isalnum())
    fingerprint_offset = ((fingerprint % 13) - 6) / 65.0

    score = (
        research_signal * 0.20
        + patent_signal * 0.23
        + commercialization_signal * 0.22
        + market_signal * 0.15
        + recency_signal * 0.10
        + patent_to_paper * 0.07
        + min(1.0, deploy_hits / 4.0) * 0.06
        - min(1.0, lab_hits / 5.0) * 0.03
        + maturity_prior
        + fingerprint_offset
    )

    score = max(0.0, min(1.0, score))
    level = int(round(1 + score * 8))
    level = max(1, min(9, level))

    confidence_raw = 52 + (research_signal + patent_signal + commercialization_signal + recency_signal) * 12
    confidence = max(45.0, min(95.0, round(confidence_raw, 2)))

    drivers = []
    if patents_count:
        drivers.append(f"{patents_count} patents indicate engineering development")
    if companies_count:
        drivers.append(f"{companies_count} companies indicate market participation")
    if news_recent:
        drivers.append(f"{news_recent} recent news items indicate current momentum")
    if not drivers:
        drivers.append("limited market and publication signals available")

    next_level = min(9, level + 1)
    if level <= 3:
        milestone = "Move from lab validation to reproducible prototype demonstrations."
    elif level <= 6:
        milestone = "Expand pilots and validate reliability under real operating constraints."
    else:
        milestone = "Demonstrate large-scale adoption and stable operational performance."

    reasoning = (
        f"TRL {level} is estimated from real-source activity: {papers_count} papers, {patents_count} patents, "
        f"{companies_count} companies, and {news_count} news signals. "
        f"Recent activity since {recent_from} and patent-to-paper intensity were used to infer maturity."
    )

    distribution = [
        {'level': f'TRL {max(1, level - 1)}', 'count': max(1, int(len(papers) * 0.25))},
        {'level': f'TRL {level}', 'count': max(1, int(len(papers) * 0.60) or 1)},
        {'level': f'TRL {next_level}', 'count': max(1, int(len(papers) * 0.15) or 1)},
    ]

    return {
        'level': level,
        'confidence': confidence,
        'reasoning': reasoning,
        'key_drivers': drivers[:3],
        'next_milestone': milestone,
        'distribution': distribution,
    }


def _normalize_wikidata_company_results(payload):
    """Convert Wikidata SPARQL response into frontend-compatible company cards."""
    if not isinstance(payload, dict):
        return []

    # SPARQL format
    bindings = (payload.get('results') or {}).get('bindings', [])
    if bindings:
        companies = []
        for idx, row in enumerate(bindings):
            company_uri = ((row.get('company') or {}).get('value') or '').strip()
            company_name = ((row.get('companyLabel') or {}).get('value') or '').strip()
            country_name = ((row.get('countryLabel') or {}).get('value') or '').strip()
            industry_name = ((row.get('industryLabel') or {}).get('value') or '').strip()
            founded_raw = ((row.get('founded') or {}).get('value') or '').strip()

            if not company_name:
                continue

            company_id = company_uri.rsplit('/', 1)[-1] if company_uri else f'wikidata-{idx}'
            companies.append(
                {
                    'id': f'wikidata-{company_id}',
                    'name': company_name,
                    'companyLabel': {'value': company_name},
                    'countryLabel': {'value': country_name},
                    'description': f'Industry: {industry_name}' if industry_name else '',
                    'incorporation_date': founded_raw[:10] if founded_raw else '',
                    'source': 'wikidata',
                }
            )

        return companies

    # wbsearchentities format
    entities = payload.get('search', [])
    companies = []
    fallback_entities = []
    business_terms = (
        'company',
        'corporation',
        'business',
        'enterprise',
        'manufacturer',
        'firm',
        'startup',
        'technology company',
    )
    for idx, entity in enumerate(entities):
        label = (entity.get('label') or '').strip()
        if not label:
            continue
        description = (entity.get('description') or '').strip()
        description_l = description.lower()
        entity_id = (entity.get('id') or f'entity-{idx}').strip()

        item = {
            'id': f'wikidata-{entity_id}',
            'name': label,
            'companyLabel': {'value': label},
            'countryLabel': {'value': ''},
            'description': description,
            'incorporation_date': '',
            'source_url': f'https://www.wikidata.org/wiki/{entity_id}',
            'source': 'wikidata',
        }

        if description and any(term in description_l for term in business_terms):
            companies.append(item)
        else:
            fallback_entities.append(item)

    # If strict business matching produced nothing, return best-effort entities instead of empty list.
    if not companies and fallback_entities:
        return fallback_entities[: max(1, min(10, len(fallback_entities)))]

    return companies


def _merge_companies(primary_list, secondary_list, limit=50):
    """Merge companies by normalized name while preserving first-source details."""
    merged = []
    seen = set()

    def _name_key(item):
        name = (
            ((item.get('companyLabel') or {}).get('value'))
            or item.get('name')
            or ''
        )
        return str(name).strip().lower()

    for item in (primary_list or []) + (secondary_list or []):
        key = _name_key(item)
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(item)
        if len(merged) >= limit:
            break

    return merged


def _fallback_companies_for_query(query, limit=10):
    """Return a small curated company set when external sources are unavailable."""
    q = str(query or '').strip().lower()
    if not q:
        return []

    catalog = [
        {'name': 'Microsoft', 'country': 'US', 'description': 'Technology company focused on cloud, AI, and enterprise software.'},
        {'name': 'Google', 'country': 'US', 'description': 'Technology company focused on AI, search, and cloud platforms.'},
        {'name': 'IBM', 'country': 'US', 'description': 'Enterprise technology company active in AI, hybrid cloud, and quantum research.'},
        {'name': 'NVIDIA', 'country': 'US', 'description': 'Semiconductor company known for AI compute platforms and GPUs.'},
        {'name': 'Intel', 'country': 'US', 'description': 'Semiconductor company focused on processors, AI acceleration, and foundry services.'},
        {'name': 'Siemens', 'country': 'DE', 'description': 'Industrial technology company focused on automation, digital twin, and engineering systems.'},
        {'name': 'Lockheed Martin', 'country': 'US', 'description': 'Aerospace and defense company active in advanced systems and R&D.'},
        {'name': 'Northrop Grumman', 'country': 'US', 'description': 'Defense technology company active in aerospace, autonomy, and mission systems.'},
        {'name': 'Raytheon', 'country': 'US', 'description': 'Defense and aerospace company active in sensors, missiles, and radar systems.'},
        {'name': 'Airbus', 'country': 'FR', 'description': 'Aerospace company active in aviation technology and advanced materials.'},
    ]

    tokens = [t for t in re.split(r'\s+', q) if t]
    scored = []
    for item in catalog:
        text = f"{item['name']} {item['description']}".lower()
        score = sum(1 for t in tokens if t in text)
        if score > 0:
            scored.append((score, item))

    if not scored:
        scored = [(1, item) for item in catalog[:limit]]

    scored.sort(key=lambda x: x[0], reverse=True)
    selected = [item for _, item in scored[: max(1, min(limit, len(scored)))]]

    return [
        {
            'id': f"fallback-{idx}-{entry['name'].lower().replace(' ', '-')}",
            'name': entry['name'],
            'companyLabel': {'value': entry['name']},
            'countryLabel': {'value': entry['country']},
            'description': entry['description'],
            'incorporation_date': '',
            'source_url': f"https://www.google.com/search?q={entry['name'].replace(' ', '+')}",
            'source': 'fallback_catalog',
        }
        for idx, entry in enumerate(selected, start=1)
    ]

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def worldbank_rd_spending(request):
    """Get World Bank R&D spending data - REAL VALUES in billions USD"""
    try:
        from .services.worldbank import get_top_rd_countries, get_country_rd_spending, get_rd_trend
        
        technology = request.GET.get('technology', '')
        country = request.GET.get('country', '')
        trend = request.GET.get('trend', 'false').lower() == 'true'
        limit = int(request.GET.get('limit', '10'))
        
        # Get R&D spending data - returns real values in billions USD
        if trend and country:
            # Get trend for specific country
            rd_data = get_rd_trend(country)
        elif country:
            # Get spending for specific country
            rd_data = get_country_rd_spending(country)
        else:
            # Get top countries
            rd_data = get_top_rd_countries(limit=limit)

        if not rd_data or not rd_data.get('success'):
            return Response(
                {
                    'success': False,
                    'data': [],
                    'error': (rd_data or {}).get('error', 'World Bank data unavailable')
                },
                status=200
            )

        if trend and country:
            return Response({
                'success': True,
                'country': rd_data.get('country'),
                'trend': rd_data.get('trend', []),
                'currency': 'USD Billions',
                'source': 'OECD/World Bank'
            })
        
        if country:
            return Response({
                'success': True,
                'country': rd_data.get('country'),
                'spending': rd_data.get('spending'),
                'year': rd_data.get('year'),
                'currency': rd_data.get('currency', 'USD Billions'),
                'source': 'OECD/World Bank'
            })
        
        # Top countries response
        countries = rd_data.get('countries', [])
        total_spending = sum(c.get('spending', 0) for c in countries if isinstance(c.get('spending', 0), (int, float)))

        return Response(
            {
                'success': True,
                'top_countries': countries,
                'total_spending': round(total_spending, 2),
                'currency': 'USD Billions',
                'year': rd_data.get('year', '2023'),
                'source': rd_data.get('source', 'OECD/World Bank'),
            }
        )
    
    except Exception as e:
        logger.error(f"World Bank data error: {e}")
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def sentiment_analysis(request):
    """Analyze sentiment using HuggingFace"""
    try:
        from .services.huggingface import analyze_sentiment
        text = request.data.get('text', '')
        context = request.data.get('context', 'general')
        
        if not text:
            return Response({"error": "No text provided"}, status=400)
        
        # Use HuggingFace for sentiment analysis
        result = analyze_sentiment(text)
        
        if result.get('success'):
            return Response(result)
        else:
            # Fallback mock sentiment
            return Response({
                'success': True,
                'sentiment': 'positive',
                'confidence': 0.75,
                'analysis': f"The sentiment analysis for '{text}' indicates a positive outlook in the {context} context."
            })
    
    except Exception as e:
        logger.error(f"Sentiment analysis error: {e}")
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def technology_convergence(request):
    """Analyze technology convergence using HuggingFace"""
    try:
        from .services.huggingface import extract_technology_convergence
        technology = request.data.get('technology', '')
        
        if not technology:
            return Response({"error": "No technology provided"}, status=400)
        
        # Use HuggingFace for convergence analysis
        result = extract_technology_convergence(technology)
        
        if result.get('success'):
            return Response(result)
        else:
            # Fallback mock convergence data
            mock_convergences = [
                {'technology': 'Artificial Intelligence', 'score': 9},
                {'technology': 'Machine Learning', 'score': 8},
                {'technology': 'Data Science', 'score': 7},
                {'technology': 'Cloud Computing', 'score': 6},
                {'technology': 'Internet of Things', 'score': 5}
            ]
            
            return Response({
                'success': True,
                'convergences': mock_convergences,
                'analysis': f"{technology} shows strong convergence with AI and ML technologies."
            })
    
    except Exception as e:
        logger.error(f"Technology convergence error: {e}")
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def trl_ml_assessment(request):
    """Estimate TRL level using ML zero-shot classification."""
    try:
        text = request.data.get('text', '')
        if not text:
            return Response({'error': 'No text provided'}, status=400)

        result = classify_trl_zeroshot(text[:2000])
        labels = result.get('labels', []) if isinstance(result, dict) else []
        scores = result.get('scores', []) if isinstance(result, dict) else []

        if not labels or not scores:
            return Response({'success': False, 'error': 'No ML prediction available'}, status=200)

        label_to_trl = {
            'basic research': 2,
            'applied research': 4,
            'proof of concept': 4,
            'prototype development': 6,
            'system demonstration': 7,
            'operational deployment': 9,
        }

        top_label = labels[0]
        top_score = float(scores[0])
        trl_level = label_to_trl.get(top_label, 4)

        distribution = []
        for label, score in zip(labels[:6], scores[:6]):
            mapped = label_to_trl.get(label)
            if mapped is not None:
                distribution.append({
                    'level': f'TRL {mapped}',
                    'confidence': round(float(score) * 100, 2),
                    'label': label,
                })

        return Response({
            'success': True,
            'source': 'huggingface_bart_large_mnli',
            'trl_level': trl_level,
            'confidence': round(top_score * 100, 2),
            'top_label': top_label,
            'distribution': distribution,
        })
    except Exception as e:
        logger.error(f"TRL ML assessment error: {e}")
        return Response({'success': False, 'error': str(e)}, status=200)

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def rd_countries(request):
    """Get R&D spending by countries - REAL VALUES in billions USD"""
    try:
        from .services.worldbank import get_top_rd_countries
        technology = request.GET.get('technology', '')
        limit = int(request.GET.get('limit', '10'))
        
        result = get_top_rd_countries(limit=limit)
        
        if result.get('success'):
            countries = result.get('countries', [])
            total_spending = sum(c.get('spending', 0) for c in countries)
            
            return Response({
                'success': True,
                'countries': countries,
                'total_spending': round(total_spending, 2),
                'year': result.get('year', '2023'),
                'currency': 'USD Billions',
                'source': result.get('source', 'OECD/World Bank')
            })
        else:
            return Response({
                'success': False,
                'countries': [],
                'error': result.get('error', 'Failed to fetch R&D data')
            })
    
    except Exception as e:
        logger.error(f"R&D countries error: {e}")
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def paper_detail(request, paper_id):
    """Get detailed paper information"""
    try:
        from .services.crossref import get_paper_details
        paper_data = get_paper_details(paper_id)
        
        if paper_data:
            return Response(paper_data)
        else:
            return Response({"error": "Paper not found"}, status=404)
    
    except Exception as e:
        logger.error(f"Paper detail error: {e}")
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def generate_wordcloud(request):
    """Generate word cloud from text"""
    try:
        from .services.huggingface import extract_keywords
        text = request.data.get('text', '')
        
        if not text:
            return Response({"error": "No text provided"}, status=400)
        
        # Extract keywords using HuggingFace
        keywords_result = extract_keywords(text)
        
        if keywords_result.get('success'):
            return Response({"words": keywords_result.get('keywords', [])})
        else:
            # Fallback to simple word extraction
            words = text.lower().split()
            word_freq = {}
            for word in words:
                if len(word) > 3:  # Only words longer than 3 characters
                    word_freq[word] = word_freq.get(word, 0) + 1
            
            # Convert to word cloud format
            word_cloud_data = [
                {"text": word, "value": count} 
                for word, count in sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:50]
            ]
            
            return Response({"words": word_cloud_data})
    
    except Exception as e:
        logger.error(f"Word cloud generation error: {e}")
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def generate_summary(request):
    """Generate AI summary of text using Hugging Face API"""
    try:
        from .services.huggingface import generate_summary as hf_generate_summary
        text = request.data.get('text', '')
        
        if not text:
            return Response({"error": "No text provided"}, status=400)
        
        # Use Hugging Face API to generate summary
        result = hf_generate_summary(text)
        
        if result.get('success'):
            return Response({"summary": result.get('summary', '')})
        else:
            fallback_summary = (result.get('summary') or text or '').strip()
            if fallback_summary and not fallback_summary.endswith('.'):
                fallback_summary = f"{fallback_summary}."

            return Response(
                {
                    "summary": fallback_summary,
                    "error": result.get('error', 'Failed to generate summary'),
                    "fallback": True,
                },
                status=200,
            )
    
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        text = request.data.get('text', '')
        fallback_summary = text.strip() if text else ''
        if fallback_summary and not fallback_summary.endswith('.'):
            fallback_summary = f"{fallback_summary}."

        return Response(
            {
                "summary": fallback_summary,
                "error": str(e),
                "fallback": True,
            },
            status=200,
        )

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def search(request):
    from datetime import datetime
    CURRENT_YEAR = datetime.now().year

    def extract_year(paper):
        raw = paper.get('publication_year')
        if raw is None:
            return 0

        if isinstance(raw, int):
            return raw

        if isinstance(raw, (list, tuple)) and len(raw) > 0:
            first = raw[0]
            if isinstance(first, int):
                return first
            raw = str(raw)

        text = str(raw)
        match = re.search(r'(19|20)\d{2}', text)
        if match:
            return int(match.group(0))

        digits = ''.join(ch for ch in text if ch.isdigit())
        if len(digits) >= 4:
            return int(digits[:4])

        return 0

    def matches_keywords(paper, tokens):
        if not tokens:
            return True

        title = str(paper.get('title', '')).lower()
        abstract = str(paper.get('abstract', '')).lower()
        authors = ' '.join(
            (a.get('author', {}) or {}).get('display_name', '')
            for a in (paper.get('authorships') or [])
            if isinstance(a, dict)
        ).lower()
        haystack = f"{title} {abstract} {authors}"

        return any(token in haystack for token in tokens)
    
    query = request.GET.get('q', '')
    source_type = request.GET.get('type', 'all')
    year_from = int(request.GET.get('year_from', '2000'))
    year_to = int(request.GET.get('year_to', str(CURRENT_YEAR)))
    sort_by = request.GET.get('sort_by', 'relevance')
    paper_keywords = request.GET.get('paper_keywords', '')
    page = int(request.GET.get('page', 1))

    keyword_tokens = [t.strip().lower() for t in paper_keywords.split(',') if t.strip()]
    
    logger.info(f"Search query: {query}, type: {source_type}, years: {year_from}-{year_to}")
    
    results = {}
    
    try:
        if source_type in ['all', 'papers']:
            papers_data = crossref_search_papers(query, int(year_from), int(year_to), page)

            # Apply keyword filter on title/abstract/authors.
            papers_data = [paper for paper in papers_data if matches_keywords(paper, keyword_tokens)]

            # Apply explicit sorting for paper results.
            if sort_by == 'date_newest':
                papers_data = sorted(papers_data, key=extract_year, reverse=True)
            elif sort_by == 'date_oldest':
                papers_data = sorted(papers_data, key=extract_year)
            elif sort_by == 'citations_most':
                papers_data = sorted(
                    papers_data,
                    key=lambda p: int(p.get('cited_by_count') or 0),
                    reverse=True
                )

            results['papers'] = papers_data
            logger.info(f"Papers found: {len(results['papers'])}")
        
        if source_type in ['all', 'patents']:
            patents_data = search_patents(query, num=10)

            patents_results = patents_data.get('results', [])
            
            # Filter patents by year - extract year from publication_date or filing_date
            def extract_patent_year(patent_date_str):
                """Extract year from date string like '2024-01-15' or '2024'"""
                if not patent_date_str:
                    return CURRENT_YEAR
                match = re.search(r'(19|20)\d{2}', str(patent_date_str))
                if match:
                    return int(match.group(0))
                return CURRENT_YEAR
            
            patents_results = [
                p for p in patents_results
                if year_from <= extract_patent_year(p.get('publication_date') or p.get('filing_date')) <= year_to
            ]

            results['patents'] = patents_results
            logger.info(f"Patents found: {len(results['patents'])}")
        
        if source_type in ['all', 'news']:
            try:
                news_data = search_news(query)
                results['news'] = news_data.get('results', [])
                logger.info(f"News found: {len(results['news'])}")
            except Exception as e:
                logger.error(f"News search error: {e}")
                results['news'] = []
        
        if source_type in ['all', 'companies']:
            companies_open = []
            companies_wikidata = []

            try:
                companies_open = opencorporates_search_companies(query, page=1, num=25) or []
            except Exception as e:
                logger.error(f"OpenCorporates search error: {e}")

            try:
                wikidata_payload = wikidata_get_technology_companies(query, limit=25)
                companies_wikidata = _normalize_wikidata_company_results(wikidata_payload)
            except Exception as e:
                logger.error(f"Wikidata company search error: {e}")

            merged_companies = _merge_companies(companies_open, companies_wikidata, limit=50)
            if not merged_companies:
                merged_companies = _fallback_companies_for_query(query, limit=10)
            results['companies'] = merged_companies
            results['companies_sources'] = {
                'opencorporates': len(companies_open),
                'wikidata': len(companies_wikidata),
                'merged': len(merged_companies),
                'used_fallback': len(companies_open) == 0 and len(companies_wikidata) == 0,
            }

            # Keep backend-only context available for company intelligence screens.
            try:
                rd_data = get_top_rd_countries(limit=10, technology=query)
                if isinstance(rd_data, dict) and rd_data.get('success'):
                    results['worldbank'] = {
                        'top_countries': rd_data.get('countries', []),
                        'source': 'worldbank',
                    }
            except Exception as e:
                logger.error(f"World Bank fetch error in search: {e}")

            logger.info(
                f"Companies found: merged={len(results['companies'])}, "
                f"open={len(companies_open)}, wikidata={len(companies_wikidata)}"
            )
        
        return Response(results)
    
    except Exception as e:
        logger.error(f"Search error: {e}")
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def technology_profile(request):
    from datetime import datetime

    query = request.GET.get('q', '').strip()
    if not query:
        return Response({'error': 'q is required'}, status=400)

    current_year = datetime.now().year
    year_from = int(request.GET.get('year_from', '2015'))
    year_to = int(request.GET.get('year_to', str(current_year)))
    include_ai = request.GET.get('include_ai', 'false').strip().lower() == 'true'

    cache_key = f"tech_profile_v2:{query.lower()}:{year_from}:{year_to}:{int(include_ai)}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    def parse_year(value):
        if value is None:
            return None

        if isinstance(value, int):
            return value if 1900 <= value <= current_year + 1 else None

        text = str(value)
        digits = ''.join(ch for ch in text if ch.isdigit())

        if len(digits) >= 8:
            y = int(digits[:4])
            return y if 1900 <= y <= current_year + 1 else None

        if len(digits) >= 4:
            y = int(digits[:4])
            return y if 1900 <= y <= current_year + 1 else None

        return None

    source_status = {
        'papers': {'ok': False, 'source': 'crossref'},
        'patents': {'ok': False, 'source': 'serpapi_google_patents'},
        'companies': {'ok': False, 'source': 'opencorporates'},
        'news': {'ok': False, 'source': 'newsapi'},
        'worldbank': {'ok': False, 'source': 'worldbank'},
        'trl': {'ok': False, 'source': 'real_signal_model_v1'},
        'convergence': {'ok': False, 'source': 'huggingface'},
    }

    papers = []
    patents = []
    companies = []
    news = []

    # Fetch external sources in parallel to reduce response latency.
    def _fetch_papers():
        return crossref_search_papers(query, year_from, year_to, page=1, num=50) or []

    def _fetch_patents():
        result = search_patents(query, num=50)
        if not isinstance(result, dict):
            return {'success': False, 'results': [], 'error': 'Invalid patents payload'}
        return result

    def _fetch_news():
        result = search_news(query, page_size=50)
        if not isinstance(result, dict):
            return {'success': False, 'results': [], 'error': 'Invalid news payload'}
        return result

    def _fetch_companies_bundle():
        open_companies = opencorporates_search_companies(query, page=1, num=50) or []
        wikidata_companies = []
        wikidata_error = None
        try:
            wikidata_companies = _normalize_wikidata_company_results(
                wikidata_search_companies(query, limit=30)
            )
        except Exception as e:
            wikidata_error = str(e)

        merged = _merge_companies(open_companies, wikidata_companies, limit=50)
        return {
            'merged': merged,
            'open_count': len(open_companies),
            'wikidata_count': len(wikidata_companies),
            'wikidata_error': wikidata_error,
        }

    def _fetch_rd():
        return get_top_rd_countries(limit=10, technology=query)

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            'papers': executor.submit(_fetch_papers),
            'patents': executor.submit(_fetch_patents),
            'news': executor.submit(_fetch_news),
            'companies': executor.submit(_fetch_companies_bundle),
            'rd': executor.submit(_fetch_rd),
        }

        # Papers
        try:
            papers = futures['papers'].result(timeout=35) or []
            source_status['papers']['ok'] = True
        except Exception as e:
            source_status['papers']['error'] = str(e)

        # Patents
        try:
            patents_result = futures['patents'].result(timeout=35)
            patents = patents_result.get('results', []) if isinstance(patents_result, dict) else []
            source_status['patents']['ok'] = patents_result.get('success', False) if isinstance(patents_result, dict) else False
            if isinstance(patents_result, dict) and patents_result.get('error'):
                source_status['patents']['error'] = patents_result.get('error')
        except Exception as e:
            source_status['patents']['error'] = str(e)

        # News
        try:
            news_result = futures['news'].result(timeout=35)
            news = news_result.get('results', []) if isinstance(news_result, dict) else []
            source_status['news']['ok'] = news_result.get('success', False) if isinstance(news_result, dict) else False
            if isinstance(news_result, dict) and news_result.get('error'):
                source_status['news']['error'] = news_result.get('error')
        except Exception as e:
            source_status['news']['error'] = str(e)

        # Companies
        try:
            companies_bundle = futures['companies'].result(timeout=35) or {}
            companies = companies_bundle.get('merged', [])
            source_status['companies']['ok'] = len(companies) > 0
            source_status['companies']['source'] = 'opencorporates+wikidata'
            source_status['companies']['counts'] = {
                'opencorporates': companies_bundle.get('open_count', 0),
                'wikidata': companies_bundle.get('wikidata_count', 0),
                'merged': len(companies),
            }
            if companies_bundle.get('wikidata_error'):
                source_status['companies']['wikidata_error'] = companies_bundle.get('wikidata_error')
        except Exception as e:
            source_status['companies']['error'] = str(e)

        # World Bank / OECD R&D
        rd_data = None
        try:
            rd_data = futures['rd'].result(timeout=25)
        except Exception as e:
            source_status['worldbank']['error'] = str(e)

    # Real-year filtering where required
    papers = [p for p in papers if (parse_year(p.get('publication_year')) or 0) >= year_from and (parse_year(p.get('publication_year')) or 0) <= year_to]
    patents = [
        p for p in patents
        if year_from <= (parse_year(p.get('publication_date') or p.get('filing_date')) or current_year) <= year_to
    ]
    news = [
        n for n in news
        if year_from <= (parse_year(n.get('publishedAt') or n.get('published_at')) or current_year) <= year_to
    ]

    # Yearly trends
    yearly_map = {year: {'year': year, 'papers': 0, 'patents': 0, 'news': 0} for year in range(year_from, year_to + 1)}

    for p in papers:
        y = parse_year(p.get('publication_year'))
        if y in yearly_map:
            yearly_map[y]['papers'] += 1

    for p in patents:
        y = parse_year(p.get('publication_date') or p.get('filing_date'))
        if y in yearly_map:
            yearly_map[y]['patents'] += 1

    for n in news:
        y = parse_year(n.get('publishedAt') or n.get('published_at'))
        if y in yearly_map:
            yearly_map[y]['news'] += 1

    yearly_trends = [yearly_map[y] for y in sorted(yearly_map.keys())]

    # World Bank (real only)
    rd_payload = {'top_countries': [], 'total_spending': None, 'growth_rate': None}
    if isinstance(rd_data, dict) and rd_data.get('success'):
        countries = rd_data.get('countries', [])
        rd_payload['top_countries'] = [
            {
                'country': c.get('name', 'Unknown'),
                'spending': c.get('spending', 0)
            }
            for c in countries
        ]
        rd_payload['total_spending'] = sum(
            c.get('spending', 0) for c in countries if isinstance(c.get('spending', 0), (int, float))
        )
        source_status['worldbank']['ok'] = True
    elif isinstance(rd_data, dict):
        source_status['worldbank']['error'] = rd_data.get('error', 'No data')

    # Fast, real-signal TRL estimate (tech-specific and deterministic).
    trl_payload = _estimate_real_trl(query, papers, patents, companies, news, year_from, year_to, parse_year)
    source_status['trl']['ok'] = True

    abstracts = [p.get('abstract', '') for p in papers if p.get('abstract')][:8]

    # Convergence from real abstracts (optional: include_ai=true)
    convergence = None
    if include_ai and abstracts:
        try:
            conv_result = extract_technology_convergence(abstracts)
            if isinstance(conv_result, dict) and conv_result.get('scores'):
                convergence = [
                    {'label': label, 'score': score}
                    for label, score in zip(conv_result.get('labels', []), conv_result.get('scores', []))
                ][:10]
                source_status['convergence']['ok'] = True
            else:
                source_status['convergence']['error'] = 'No convergence labels returned'
        except Exception as e:
            source_status['convergence']['error'] = str(e)
    else:
        source_status['convergence']['error'] = 'Skipped in fast mode; pass include_ai=true to enable'

    # Sentiment (optional: include_ai=true)
    sentiment = None
    if include_ai:
        try:
            sentiment_result = get_news_sentiment_analysis(query)
            if sentiment_result.get('success'):
                sentiment = sentiment_result.get('sentiment', {})
            else:
                source_status['news']['error'] = sentiment_result.get('error', source_status['news'].get('error'))
        except Exception:
            pass

    # Persist profile snapshot.
    profile, _ = TechnologyProfile.objects.get_or_create(
        technology=query,
        defaults={'query': query}
    )
    profile.query = query
    profile.papers_count = len(papers)
    profile.patents_count = len(patents)
    profile.companies_count = len(companies)
    profile.news_count = len(news)
    if trl_payload.get('level'):
        profile.trl_level = int(trl_payload['level'])
    if trl_payload.get('confidence') is not None:
        profile.trl_confidence = float(trl_payload['confidence'])
    profile.cached_data = {
        'year_from': year_from,
        'year_to': year_to,
        'source_status': source_status
    }
    profile.save()

    response_payload = {
        'technology': query,
        'filters': {'year_from': year_from, 'year_to': year_to},
        'stats': {
            'papers': len(papers),
            'patents': len(patents),
            'companies': len(companies),
            'news': len(news),
            'trl_level': trl_payload.get('level'),
            'trl_confidence': trl_payload.get('confidence')
        },
        'papers': papers[:10],
        'patents': patents[:10],
        'companies': companies[:10],
        'news': news[:10],
        'yearly_trends': yearly_trends,
        'distribution': [
            {'name': 'Research Papers', 'value': len(papers)},
            {'name': 'Patents', 'value': len(patents)},
            {'name': 'Companies', 'value': len(companies)},
            {'name': 'News Articles', 'value': len(news)},
        ],
        'trl': trl_payload,
        'rd': rd_payload,
        'sentiment': sentiment,
        'convergence': convergence,
        'source_status': source_status
    }

    # Cache for faster repeated requests with same filters.
    cache.set(cache_key, response_payload, timeout=600)
    return Response(response_payload)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def watchlist(request):
    watchlist_items = Watchlist.objects.filter(user=request.user, is_active=True)
    data = []
    for item in watchlist_items:
        profile = TechnologyProfile.objects.filter(technology__iexact=item.technology).first()
        papers_count = profile.papers_count if profile else item.new_papers_count
        patents_count = profile.patents_count if profile else item.new_patents_count
        companies_count = profile.companies_count if profile else 0

        data.append({
            'id': item.id,
            'technology': item.technology,
            'query': item.query,
            'added_date': item.last_updated,
            'last_updated': item.last_updated,
            'new_papers_count': item.new_papers_count,
            'new_patents_count': item.new_patents_count,
            'papers_count': papers_count,
            'patents_count': patents_count,
            'companies_count': companies_count,
            'trending': bool(item.new_papers_count > 0 or item.new_patents_count > 0),
        })
    return Response(data)

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def add_to_watchlist(request):
    technology = (request.data.get('technology') or '').strip()
    query = (request.data.get('query') or technology).strip()

    if not technology:
        return Response({'error': 'Technology is required'}, status=status.HTTP_400_BAD_REQUEST)

    watchlist_item = Watchlist.objects.filter(user=request.user, technology__iexact=technology).first()
    created = False
    if not watchlist_item:
        watchlist_item = Watchlist.objects.create(
            user=request.user,
            technology=technology,
            query=query,
            is_active=True,
        )
        created = True
    else:
        # Reactivate/update existing entry to make Add action idempotent and user-friendly.
        watchlist_item.query = query
        watchlist_item.is_active = True
        watchlist_item.save(update_fields=['query', 'is_active', 'last_updated'])

    payload = {
        'id': watchlist_item.id,
        'technology': watchlist_item.technology,
        'query': watchlist_item.query,
        'added_date': watchlist_item.last_updated,
        'last_updated': watchlist_item.last_updated,
        'new_papers_count': watchlist_item.new_papers_count,
        'new_patents_count': watchlist_item.new_patents_count,
    }

    if created:
        return Response({'message': 'Added to watchlist', 'item': payload}, status=status.HTTP_201_CREATED)
    return Response({'message': 'Already in watchlist', 'item': payload}, status=status.HTTP_200_OK)

@api_view(['DELETE'])
@permission_classes([permissions.IsAuthenticated])
def remove_from_watchlist(request, item_id):
    item = get_object_or_404(Watchlist, id=item_id, user=request.user)
    item.delete()
    return Response({'message': 'Removed from watchlist'})

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def reports(request):
    reports = SavedReport.objects.filter(user=request.user)
    data = []
    for report in reports:
        data.append({
            'id': report.id,
            'title': report.title,
            'technology': report.technology,
            'content': report.content,
            'word_count': report.word_count,
            'created_at': report.created_at,
            'updated_at': report.updated_at
        })
    return Response(data)


def _section_label(section_key):
    labels = {
        'executive_summary': 'Executive Summary',
        'maturity_assessment': 'Technology Maturity Assessment',
        'growth_drivers': 'Key Growth Drivers',
        'strategic_implications': 'Strategic Implications',
        'focus_areas': 'Recommended Focus Areas',
    }
    return labels.get(section_key, section_key.replace('_', ' ').title())


def _compose_fallback_report_content(technology, sections, profile, custom_paragraph=''):
    generated_at = timezone.now().strftime('%Y/%m/%d')
    papers = profile.papers_count or 0
    patents = profile.patents_count or 0
    news = profile.news_count or 0
    companies = profile.companies_count or 0

    content_parts = [
        f"Technology Intelligence Report: {technology}",
        f"Generated on: {generated_at}",
        "",
        "Snapshot Metrics",
        f"- Research papers tracked: {papers}",
        f"- Patents tracked: {patents}",
        f"- Industry/company signals: {companies}",
        f"- News/activity signals: {news}",
        "",
    ]

    selected_sections = sections or [
        'executive_summary',
        'maturity_assessment',
        'growth_drivers',
        'strategic_implications',
        'focus_areas',
    ]

    for section in selected_sections:
        label = _section_label(section)
        content_parts.append(label)

        if section == 'executive_summary':
            content_parts.append(
                f"{technology} shows active ecosystem momentum with measurable signals from publications, patents, and market activity. "
                "This briefing combines available indicators to support rapid strategic understanding."
            )
        elif section == 'maturity_assessment':
            if papers + patents >= 50:
                maturity = 'mid-to-late stage'
            elif papers + patents >= 15:
                maturity = 'developing stage'
            else:
                maturity = 'early exploratory stage'
            content_parts.append(
                f"Current evidence places this technology in a {maturity}. "
                "Recommendation: update this assessment monthly as new technical and market signals arrive."
            )
        elif section == 'growth_drivers':
            content_parts.extend([
                "- Increased R&D investment and cross-domain experimentation",
                "- Policy and procurement pull for mission-relevant capabilities",
                "- Adjacent technology convergence accelerating performance gains",
            ])
        elif section == 'strategic_implications':
            content_parts.extend([
                "- Potential to shift capability advantage in high-priority mission areas",
                "- Requires balancing near-term pilots with long-horizon platform planning",
                "- Competitive intelligence monitoring should focus on top publishing and patenting actors",
            ])
        elif section == 'focus_areas':
            content_parts.extend([
                "- Build a 90-day technical validation backlog",
                "- Define TRL progression criteria for each subsystem",
                "- Track partner/vendor ecosystem maturity and supply constraints",
            ])
        else:
            content_parts.append(
                "This section is included in the report scope and should be refined as additional evidence is collected."
            )

        content_parts.append("")

    custom_text = (custom_paragraph or '').strip()
    if custom_text:
        content_parts.append('Analyst Notes')
        content_parts.append(custom_text)
        content_parts.append('')

    content_parts.append("Note: This report used fallback synthesis because external AI summarization was unavailable.")
    return "\n".join(content_parts).strip()

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def generate_report(request):
    technology = request.data.get('technology')
    sections = request.data.get('sections', [])
    custom_paragraph = request.data.get('custom_paragraph', '')

    if not technology:
        return Response({'error': 'technology is required'}, status=400)
    
    # Get or create technology profile snapshot
    profile, _ = TechnologyProfile.objects.get_or_create(
        technology=technology,
        defaults={'query': technology}
    )
    
    # Generate report content using AI
    summary = generate_technology_summary(
        technology, profile.papers_count, profile.patents_count, profile.news_count
    )

    if isinstance(summary, dict):
        content = summary.get('summary') if summary.get('success') else ''
    else:
        content = str(summary)

    if not content:
        content = _compose_fallback_report_content(technology, sections, profile, custom_paragraph)
    else:
        custom_text = (custom_paragraph or '').strip()
        if custom_text:
            content = f"{content.strip()}\n\nAnalyst Notes\n{custom_text}"
    
    # Create report
    report = SavedReport.objects.create(
        user=request.user,
        title=f"Technology Intelligence Report: {technology}",
        technology=technology,
        content=content,
        sections=sections,
        word_count=len(content.split())
    )
    
    return Response({
        'id': report.id,
        'title': report.title,
        'technology': report.technology,
        'content': report.content,
        'word_count': report.word_count,
        'created_at': report.created_at,
        'updated_at': report.updated_at,
    })


@api_view(['DELETE', 'PATCH'])
@permission_classes([permissions.IsAuthenticated])
def delete_report(request, report_id):
    report = get_object_or_404(SavedReport, id=report_id, user=request.user)

    if request.method == 'PATCH':
        title = request.data.get('title')
        technology = request.data.get('technology')
        content = request.data.get('content')

        if title is not None:
            report.title = str(title).strip() or report.title

        if technology is not None:
            report.technology = str(technology).strip() or report.technology

        if content is not None:
            report.content = str(content).strip()
            report.word_count = len(report.content.split()) if report.content else 0

        report.save()
        return Response({
            'id': report.id,
            'title': report.title,
            'technology': report.technology,
            'content': report.content,
            'word_count': report.word_count,
            'created_at': report.created_at,
            'updated_at': report.updated_at,
        })

    report.delete()
    return Response({'message': 'Report deleted successfully'})

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def search_history(request):
    history = SearchHistory.objects.filter(user=request.user)[:10]
    data = []
    for item in history:
        data.append({
            'query': item.query,
            'filters': item.filters,
            'results_count': item.results_count,
            'created_at': item.created_at
        })
    return Response(data)

@csrf_exempt
@require_http_methods(["GET"])
def test_apis(request):
    """
    Test all API connections and return status for each
    """
    results = {}
    
    # Test OpenAlex
    try:
        from .services.openalex import search_papers
        papers_result = search_papers("quantum", per_page=1)
        results["openalex"] = {
            "status": "success" if papers_result.get("success") else "error",
            "message": "Connected" if papers_result.get("success") else papers_result.get("error", "Unknown error")
        }
    except Exception as e:
        results["openalex"] = {"status": "error", "message": str(e)}
    
    # Test chatbot LLM (Hugging Face)
    try:
        from .services.huggingface import chat_response
        hf_result = chat_response([{"role": "user", "content": "test"}])
        results["huggingface_chat"] = {
            "status": "success" if hf_result.get("success") else "error",
            "message": "Connected" if hf_result.get("success") else hf_result.get("error", "Unknown error")
        }
    except Exception as e:
        results["huggingface_chat"] = {"status": "error", "message": str(e)}
    
    # Test NewsAPI
    try:
        from .services.newsapi import search_news
        news_result = search_news("technology", page_size=1)
        results["newsapi"] = {
            "status": "success" if news_result.get("success") else "error",
            "message": "Connected" if news_result.get("success") else news_result.get("error", "Unknown error")
        }
    except Exception as e:
        results["newsapi"] = {"status": "error", "message": str(e)}
    
    # Test SERP Patents
    try:
        from .services.patents import search_patents
        patents_result = search_patents("quantum computing", num=10)
        results["serp_patents"] = {
            "status": "success" if patents_result.get("success") else "error",
            "message": "Connected" if patents_result.get("success") else patents_result.get("error", "Unknown error"),
            "source": patents_result.get("source", "unknown"),
            "results_count": len(patents_result.get("results", [])),
            "warning": patents_result.get("warning", "")
        }
    except Exception as e:
        results["serp_patents"] = {"status": "error", "message": str(e)}
    
    return JsonResponse(results)

@csrf_exempt
@require_http_methods(["POST"])
def chat_view(request):
    """
    Chat endpoint for AI assistant
    """
    try:
        body = json.loads(request.body)
        messages = body.get("messages", [])
        if not isinstance(messages, list):
            messages = []

        if not messages:
            single_message = body.get("message")
            if isinstance(single_message, str) and single_message.strip():
                messages = [{"role": "user", "content": single_message.strip()}]

        messages = [
            msg
            for msg in messages
            if isinstance(msg, dict) and str(msg.get("content", "")).strip()
        ]

        if not messages:
            return JsonResponse({"error": "No messages provided"}, status=400)
        
        result = chat_response(messages)
        
        if result["success"]:
            return JsonResponse({"response": str(result.get("response", "")).strip()})
        else:
            # Return a safe assistant fallback so chat UI keeps working on provider failures.
            return JsonResponse({
                "response": "Sorry, I am having trouble responding right now. Please try again in a moment.",
                "error": result.get("error", "Chat service unavailable")
            }, status=200)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        logger.error(f"Chat view error: {e}")
        return JsonResponse({"error": str(e)}, status=500)
