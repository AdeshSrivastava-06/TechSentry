from django.urls import path
from . import views

urlpatterns = [
    # Search and discovery
    path('search/', views.search, name='search'),
    path('search/history/', views.search_history, name='search_history'),
    path('paper/<str:paper_id>/', views.paper_detail, name='paper_detail'),
    
    # AI Analysis
    path('generate-wordcloud/', views.generate_wordcloud, name='generate_wordcloud'),
    path('generate-summary/', views.generate_summary, name='generate_summary'),
    path('patent-text/', views.patent_text, name='patent_text'),
    path('sentiment-analysis/', views.sentiment_analysis, name='sentiment_analysis'),
    path('technology-convergence/', views.technology_convergence, name='technology_convergence'),
    path('trl-ml-assessment/', views.trl_ml_assessment, name='trl_ml_assessment'),
    
    # Global Data
    path('worldbank/rd-spending/', views.worldbank_rd_spending, name='worldbank_rd_spending'),
    path('rd-countries/', views.rd_countries, name='rd_countries'),
    
    # Technology analysis
    path('technology/profile/', views.technology_profile, name='technology_profile'),
    
    # Watchlist management
    path('watchlist/', views.watchlist, name='watchlist'),
    path('watchlist/add/', views.add_to_watchlist, name='add_to_watchlist'),
    path('watchlist/<int:item_id>/', views.remove_from_watchlist, name='remove_from_watchlist'),
    
    # Reports
    path('reports/', views.reports, name='reports'),
    path('reports/generate/', views.generate_report, name='generate_report'),
    path('reports/<int:report_id>/', views.delete_report, name='delete_report'),
    
    # AI Chat
    path('chat/', views.chat_view, name='chat'),
    
    # API Testing
    path('test-apis/', views.test_apis, name='test_apis'),
]
