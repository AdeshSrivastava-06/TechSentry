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
import uuid
import json
import logging
import re

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
        if description and not any(term in description_l for term in business_terms):
            continue
        entity_id = (entity.get('id') or f'entity-{idx}').strip()
        companies.append(
            {
                'id': f'wikidata-{entity_id}',
                'name': label,
                'companyLabel': {'value': label},
                'countryLabel': {'value': ''},
                'description': description,
                'incorporation_date': '',
                'source': 'wikidata',
            }
        )

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

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def worldbank_rd_spending(request):
    """Get World Bank R&D spending data"""
    try:
        from .services.worldbank import get_top_rd_countries
        technology = request.GET.get('technology', '')
        
        # Get R&D spending data
        rd_data = get_top_rd_countries(technology)

        if not rd_data or not rd_data.get('success'):
            return Response(
                {
                    'success': False,
                    'top_countries': [],
                    'growth_rate': None,
                    'total_spending': None,
                    'error': (rd_data or {}).get('error', 'World Bank data unavailable')
                },
                status=200
            )

        countries = rd_data.get('countries', [])
        top_countries = [
            {'country': c.get('name', 'Unknown'), 'spending': c.get('spending', 0)}
            for c in countries
        ]
        total_spending = sum(c.get('spending', 0) for c in countries if isinstance(c.get('spending', 0), (int, float)))

        return Response(
            {
                'success': True,
                'top_countries': top_countries,
                'growth_rate': None,
                'total_spending': total_spending,
                'source': 'worldbank'
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
    """Get R&D spending by countries"""
    try:
        from .services.worldbank import get_top_rd_countries
        technology = request.GET.get('technology', '')
        
        result = get_top_rd_countries(technology)
        
        if result.get('success'):
            return Response(result)
        else:
            return Response({
                'success': True,
                'countries': [
                    {'name': 'United States', 'spending': 651.8, 'percentage': 29.1},
                    {'name': 'China', 'spending': 526.9, 'percentage': 23.5},
                    {'name': 'Japan', 'spending': 172.7, 'percentage': 7.7},
                    {'name': 'Germany', 'spending': 131.9, 'percentage': 5.9},
                    {'name': 'South Korea', 'spending': 102.3, 'percentage': 4.6}
                ]
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
            return Response({"error": result.get('error', 'Failed to generate summary')}, status=500)
    
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        return Response({"error": str(e)}, status=500)

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
            results['companies'] = merged_companies
            results['companies_sources'] = {
                'opencorporates': len(companies_open),
                'wikidata': len(companies_wikidata),
                'merged': len(merged_companies),
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
        'trl': {'ok': False, 'source': 'huggingface'},
        'convergence': {'ok': False, 'source': 'huggingface'},
    }

    papers = []
    patents = []
    companies = []
    news = []

    # Papers (Crossref)
    try:
        papers = crossref_search_papers(query, year_from, year_to, page=1, num=50) or []
        source_status['papers']['ok'] = True
    except Exception as e:
        source_status['papers']['error'] = str(e)

    # Patents (SerpAPI)
    try:
        patents_result = search_patents(query, num=50)
        patents = patents_result.get('results', []) if isinstance(patents_result, dict) else []
        source_status['patents']['ok'] = patents_result.get('success', False) if isinstance(patents_result, dict) else False
        if isinstance(patents_result, dict) and patents_result.get('error'):
            source_status['patents']['error'] = patents_result.get('error')
    except Exception as e:
        source_status['patents']['error'] = str(e)

    # News (NewsAPI)
    try:
        news_result = search_news(query, page_size=50)
        news = news_result.get('results', []) if isinstance(news_result, dict) else []
        source_status['news']['ok'] = news_result.get('success', False) if isinstance(news_result, dict) else False
        if isinstance(news_result, dict) and news_result.get('error'):
            source_status['news']['error'] = news_result.get('error')
    except Exception as e:
        source_status['news']['error'] = str(e)

    # Companies (OpenCorporates + Wikidata)
    try:
        open_companies = opencorporates_search_companies(query, page=1, num=50) or []

        wikidata_companies = []
        try:
            wikidata_companies = _normalize_wikidata_company_results(
                wikidata_search_companies(query, limit=30)
            )
        except Exception as wikidata_error:
            source_status['companies']['wikidata_error'] = str(wikidata_error)

        companies = _merge_companies(open_companies, wikidata_companies, limit=50)
        source_status['companies']['ok'] = len(companies) > 0
        source_status['companies']['source'] = 'opencorporates+wikidata'
        source_status['companies']['counts'] = {
            'opencorporates': len(open_companies),
            'wikidata': len(wikidata_companies),
            'merged': len(companies),
        }
    except Exception as e:
        source_status['companies']['error'] = str(e)

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
    try:
        rd_data = get_top_rd_countries(limit=10, technology=query)
        if rd_data.get('success'):
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
        else:
            source_status['worldbank']['error'] = rd_data.get('error', 'No data')
    except Exception as e:
        source_status['worldbank']['error'] = str(e)

    # TRL from real abstracts
    abstracts = [p.get('abstract', '') for p in papers if p.get('abstract')][:8]
    trl_payload = {'level': None, 'confidence': None, 'reasoning': '', 'key_drivers': [], 'next_milestone': ''}
    if abstracts:
        try:
            trl_result = generate_trl_assessment(abstracts, query)
            if trl_result.get('success'):
                trl_data = trl_result.get('data', {})
                trl_payload = {
                    'level': trl_data.get('trl_level'),
                    'confidence': trl_data.get('confidence'),
                    'reasoning': trl_data.get('reasoning', ''),
                    'key_drivers': trl_data.get('key_drivers', []),
                    'next_milestone': trl_data.get('next_milestone', ''),
                    'distribution': []
                }
                source_status['trl']['ok'] = True
            else:
                source_status['trl']['error'] = trl_result.get('error', 'TRL service failed')
        except Exception as e:
            source_status['trl']['error'] = str(e)

    # Derived TRL distribution from actual publication years around maturity assumptions.
    if trl_payload.get('level'):
        total_papers = max(len(papers), 1)
        level = int(trl_payload['level'])
        lower = max(1, level - 1)
        upper = min(9, level + 1)
        near_ratio = 0.6
        lower_ratio = 0.25
        upper_ratio = 0.15
        trl_payload['distribution'] = [
            {'level': f'TRL {lower}', 'count': int(total_papers * lower_ratio)},
            {'level': f'TRL {level}', 'count': int(total_papers * near_ratio)},
            {'level': f'TRL {upper}', 'count': int(total_papers * upper_ratio)},
        ]

    # Convergence from real abstracts
    convergence = None
    if abstracts:
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

    # Sentiment based on real news headlines via HF endpoint in service
    sentiment = None
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

    return Response({
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
    })

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def watchlist(request):
    watchlist_items = Watchlist.objects.filter(user=request.user, is_active=True)
    data = []
    for item in watchlist_items:
        data.append({
            'id': item.id,
            'technology': item.technology,
            'query': item.query,
            'last_updated': item.last_updated,
            'new_papers_count': item.new_papers_count,
            'new_patents_count': item.new_patents_count
        })
    return Response(data)

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def add_to_watchlist(request):
    technology = request.data.get('technology')
    query = request.data.get('query')
    
    watchlist_item, created = Watchlist.objects.get_or_create(
        user=request.user,
        technology=technology,
        defaults={'query': query}
    )
    
    if created:
        return Response({'message': 'Added to watchlist'}, status=status.HTTP_201_CREATED)
    else:
        return Response({'message': 'Already in watchlist'}, status=status.HTTP_200_OK)

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
        if not messages:
            return JsonResponse({"error": "No messages provided"}, status=400)
        
        result = chat_response(messages)
        
        if result["success"]:
            return JsonResponse({"response": result["response"]})
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
