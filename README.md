# TechSentry - AI-Powered Technology Intelligence Platform

A comprehensive technology intelligence and forecasting platform designed for defence research organizations, modeled for DRDO use cases. Built with Django + React, featuring advanced data visualization, AI-powered insights, and real-time technology intelligence.

## 🚀 Features

### 🔐 Authentication System
- JWT-based authentication with refresh tokens
- Secure user registration with email verification
- Profile management with research domains
- Defence-grade security measures

### 🔍 Advanced Search & Discovery
- Multi-source search across research papers, patents, news, and companies
- Real-time filtering by source type, year range, country, and TRL levels
- AI-powered search insights and strategic overviews
- Search history and saved queries

### 📊 Technology Intelligence Analytics
- Comprehensive technology profiles with TRL assessment
- Publication trend analysis with citation metrics
- Patent filing trends and top assignee analysis
- R&D investment data by country
- Technology convergence mapping
- Hype cycle positioning analysis

### 🤖 AI-Powered Insights
- Hugging Face Inference integration for TRL estimation
- Automated technology maturity assessment
- Strategic brief generation
- Conversational AI assistant with domain expertise
- Real-time Chat with conversation history

### 📈 Data Visualization
- Interactive charts using Recharts
- Publication trends, S-curves, and hype cycles
- TRL progression trackers
- Country-wise R&D investment analytics
- Patent landscape visualization

### 🎨 Defence-Grade UI/UX
- Dark military-tech brutalism aesthetic
- Glassmorphism design with subtle animations
- Responsive layout with mobile support
- Real-time notifications and alerts

## 🛠️ Tech Stack

### Backend
- **Django 4.2** - Web framework
- **Django REST Framework** - API development
- **Simple JWT** - Authentication
- **SQLite** - Database (default)
- **CORS Headers** - Frontend integration

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool
- **React Router v6** - Navigation
- **Axios** - HTTP client
- **Recharts** - Data visualization
- **Framer Motion** - Animations
- **TailwindCSS** - Styling
- **React Query** - Data fetching
- **React Hot Toast** - Notifications

### External APIs
- **OpenAlex** - Research papers and citations
- **HuggingFace Inference API** - LLM chat, summaries, and NLP classification
- **NewsAPI** - News and media monitoring
- **SERP API** - Patent search
- **World Bank** - R&D investment data
- **Wikidata** - Company and organization data

## 📁 Project Structure

```
techsentry/
├── backend/                 # Django backend
│   ├── manage.py
│   ├── requirements.txt
│   ├── techsentry/         # Project settings
│   ├── accounts/           # User authentication
│   └── intelligence/       # Core intelligence features
│       ├── models.py       # Data models
│       ├── views.py        # API endpoints
│       └── services/       # External API integrations
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   │   ├── Layout/     # Navigation and layout
│   │   │   └── AI/         # Chatbot and AI features
│   │   ├── pages/          # Page components
│   │   └── context/        # React context
│   └── package.json
└── .env                    # Environment variables
```

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn

### Backend Setup

1. **Navigate to project directory**
   ```bash
   cd TechSentry
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. **Run migrations**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

6. **Create superuser**
   ```bash
   python manage.py createsuperuser
   ```

7. **Start development server**
   ```bash
   python manage.py runserver
   ```

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Admin Panel**: http://localhost:8000/admin

## 🔑 Environment Variables

Create a `.env` file in the root directory:

```env
# Django
SECRET_KEY=your-django-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Auth
JWT_SECRET=your-jwt-secret

# API Keys
CORE_API_KEY=your-core-api-key
SEMANTIC_SCHOLAR_KEY=your-semantic-scholar-key
SERP_API_KEY=your-serp-api-key
NEWS_API_KEY=your-newsapi-key
HUGGINGFACE_API_KEY=your-huggingface-key
HF_API_KEY=your-huggingface-key
HF_CHAT_MODEL=mistralai/Mistral-7B-Instruct-v0.2

# Free APIs
OPENALEX_EMAIL=your-email@gmail.com
CROSSREF_EMAIL=your-email@gmail.com
```

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register/` - User registration
- `POST /api/auth/login/` - User login
- `POST /api/auth/logout/` - User logout
- `GET /api/auth/profile/` - Get user profile
- `PUT /api/auth/profile/update/` - Update profile

### Intelligence
- `GET /api/search/` - Search technologies
- `GET /api/technology/profile/` - Technology analysis
- `GET /api/watchlist/` - Get watchlist
- `POST /api/watchlist/add/` - Add to watchlist
- `GET /api/reports/` - Get reports
- `POST /api/reports/generate/` - Generate report
- `POST /api/chat/` - AI chat interface

## 🎯 Key Features in Detail

### Technology Readiness Level (TRL) Assessment
- Automated TRL estimation using AI analysis of research papers
- Confidence scoring based on available data
- Progression tracking and milestone predictions

### Multi-Source Intelligence
- **Research Papers**: OpenAlex integration for academic papers
- **Patents**: Google Patents via SERP API
- **News**: Real-time news monitoring via NewsAPI
- **Companies**: Organization data from Wikidata

### AI-Powered Analysis
- HuggingFace LLM for strategic insights and summaries
- HuggingFace NLP for entity recognition and classification
- Automated technology convergence detection
- Sentiment analysis of news and research

### Advanced Visualizations
- Publication trends with citation overlays
- Patent landscape analysis
- R&D investment comparisons
- TRL progression timelines
- Hype cycle positioning

## 🔒 Security Features

- JWT-based authentication with refresh tokens
- CORS protection for frontend integration
- Input validation and sanitization
- Secure API key management
- Rate limiting on external API calls

## 🚀 Deployment

### Production Deployment

1. **Set environment variables**
   ```bash
   DEBUG=False
   ALLOWED_HOSTS=yourdomain.com
   ```

2. **Collect static files**
   ```bash
   python manage.py collectstatic
   ```

3. **Configure production database**
   - Update `settings.py` with PostgreSQL/MySQL configuration

4. **Deploy with Gunicorn**
   ```bash
   gunicorn backend.wsgi:application
   ```

### Frontend Build
```bash
npm run build
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🎯 Use Cases

### Defence Research Organizations
- Technology scouting and monitoring
- Competitive intelligence gathering
- R&D investment decision support
- Strategic technology assessment

### Government Agencies
- Policy development support
- Technology trend analysis
- International capability assessment
- Threat technology monitoring

### Research Institutions
- Collaboration opportunity identification
- Funding landscape analysis
- Technology transfer assessment
- Academic-industry partnership mapping

---

**TechSentry** - Intelligence. Foresight. Advantage.
