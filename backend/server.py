import cohere
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, BackgroundTasks, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi.responses import StreamingResponse, Response
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import aiofiles
import PyPDF2
import io
from docx import Document
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import asyncio
import hashlib
import base64
import psutil
import threading
import time
from queue import Queue
import multiprocessing
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
from typing import Tuple, Union
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Uploads directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'dms-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# License Configuration
LICENSE_SECRET = os.environ.get('LICENSE_SECRET', 'papyrus-license-secret-2025')

# Email Configuration (optional)
SMTP_HOST = os.environ.get('SMTP_HOST', '')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM = os.environ.get('SMTP_FROM', 'noreply@paperless.com')
EMAIL_ENABLED = bool(SMTP_HOST and SMTP_USER)

# Create the main app
app = FastAPI(title="Document Management System API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== KEYWORD CONFIGURATION ====================

FINANCIAL_KEYWORDS = {
    "revenue": ["revenue", "sales", "income", "turnover", "gross revenue", "net revenue"],
    "expenses": ["expenses", "costs", "expenditure", "operating expenses", "overhead"],
    "profit": ["profit", "net income", "earnings", "bottom line", "net profit", "gross profit"],
    "assets": ["assets", "property", "equipment", "inventory", "current assets", "fixed assets"],
    "liabilities": ["liabilities", "debt", "loans", "payables", "current liabilities", "long-term debt"],
    "equity": ["equity", "shareholder equity", "retained earnings", "capital"],
    "cash_flow": ["cash flow", "operating cash", "financing cash", "investing cash"],
    "budget": ["budget", "forecast", "projection", "plan", "estimate"],
    "financial_statement": ["balance sheet", "income statement", "cash flow statement", "profit and loss", "P&L"],
    "quarterly": ["quarterly", "q1", "q2", "q3", "q4", "quarter"],
    "annual": ["annual", "yearly", "fiscal year", "annual report", "10-k", "10-q"],
    "audit": ["audit", "audited", "auditor", "audit report", "internal audit"],
    "tax": ["tax", "taxation", "vat", "gst", "income tax", "corporate tax"]
}

MEETING_KEYWORDS = {
    "meeting": ["meeting", "conference", "workshop", "seminar", "briefing", "huddle"],
    "agenda": ["agenda", "schedule", "program", "plan", "outline"],
    "minutes": ["minutes", "notes", "summary", "record", "proceedings"],
    "attendees": ["attendees", "participants", "members", "present", "absent"],
    "actions": ["action items", "tasks", "to-do", "next steps", "follow up"],
    "decisions": ["decisions", "resolutions", "conclusions", "outcomes", "findings"],
    "presentation": ["presentation", "slide", "deck", "powerpoint", "ppt"],
    "discussion": ["discussion", "dialogue", "conversation", "talk", "debate"],
    "review": ["review", "evaluation", "assessment", "analysis", "appraisal"],
    "planning": ["planning", "strategy", "roadmap", "timeline", "schedule"],
    "client": ["client", "customer", "account", "partner", "stakeholder"],
    "steering": ["steering committee", "board meeting", "executive", "directors", "management"]
}

# ==================== SUMMARIZATION MODELS ====================

class SummarizeRequest(BaseModel):
    """Request model for document summarization"""
    method: str = Field("extractive", description="extractive, abstractive, bullet_points, executive")
    max_length: int = Field(500, ge=50, le=2000)
    temperature: float = Field(0.3, ge=0.1, le=1.0)
    additional_instructions: Optional[str] = None

class SummaryResponse(BaseModel):
    """Response model for document summary"""
    model_config = ConfigDict(extra="ignore")
    summary: str
    metadata: Dict[str, Any]
    analysis: Optional[Dict[str, Any]] = None

class DocumentSummary(BaseModel):
    """Model for storing document summaries"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str
    summary_type: str  # extractive, abstractive, bullet_points, executive
    content: str
    word_count: int
    reading_time_minutes: float
    model_used: Optional[str] = None
    temperature: float
    max_tokens: int
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: str

class SummaryMetadata(BaseModel):
    """Metadata for summary generation"""
    model_config = ConfigDict(extra="ignore")
    summary_type: str
    word_count: int
    reading_time_minutes: float
    original_word_count: int
    compression_ratio: float
    summary_id: Optional[str] = None
    created_at: Optional[str] = None

class DocumentAnalysis(BaseModel):
    """Analysis results from document"""
    model_config = ConfigDict(extra="ignore")
    topics: List[str]
    document_type: Optional[str] = None
    sentiment: Optional[str] = None
    word_count: int
    estimated_reading_time: float
    key_entities: Optional[List[str]] = None
    
# ==================== SUMMARIZATION SERVICE ====================

class DocumentSummarizer:
    """Service for summarizing documents using Cohere AI"""
    
    def __init__(self, cohere_api_key: str):
        if not cohere_api_key:
            raise ValueError("COHERE_API_KEY is required for summarization")
        self.co = cohere.Client(cohere_api_key)
        self.enabled = os.environ.get('ENABLE_COHERE_SUMMARIZATION', 'true').lower() == 'true'
        
    async def summarize_document(self, document_id: str, document_text: str, method: str = "extractive",
                               max_length: int = 500, temperature: float = 0.3, 
                               additional_instructions: Optional[str] = None) -> Dict[str, Any]:
        """
        Summarize document text using Cohere API
        
        Args:
            document_id: ID of the document
            document_text: Extracted text from document
            method: Type of summary (extractive, abstractive, bullet_points, executive)
            max_length: Maximum tokens for summary
            temperature: Creativity/randomness (0.1-1.0)
            additional_instructions: Custom instructions for summary
        
        Returns:
            Dictionary with summary and metadata
        """
        if not self.enabled:
            return self._generate_fallback_summary(document_id, document_text, method)
        
        # Clean and prepare text
        cleaned_text = self._clean_text(document_text)
        
        if len(cleaned_text.split()) < 50:
            raise ValueError("Text is too short to summarize (minimum 50 words)")
        
        # Truncate text if too long (Cohere has token limits)
        max_input_tokens = 4000  # Cohere's limit for many models
        words = cleaned_text.split()
        if len(words) > max_input_tokens:
            truncated_words = words[:max_input_tokens]
            cleaned_text = " ".join(truncated_words)
            logger.warning(f"Document text truncated from {len(words)} to {len(truncated_words)} words")
        
        try:
            # Generate summary based on method
            if method == "extractive":
                summary = await self._generate_extractive_summary(cleaned_text, max_length, temperature)
            elif method == "abstractive":
                summary = await self._generate_abstractive_summary(cleaned_text, max_length, temperature, additional_instructions)
            elif method == "bullet_points":
                summary = await self._generate_bullet_points(cleaned_text, max_length, temperature)
            elif method == "executive":
                summary = await self._generate_executive_summary(cleaned_text, max_length, temperature, additional_instructions)
            else:
                raise ValueError(f"Invalid summary method: {method}")
            
            # Analyze document
            analysis = await self._analyze_document(cleaned_text)
            
            # Calculate metrics
            original_word_count = len(document_text.split())
            summary_word_count = len(summary.split())
            compression_ratio = summary_word_count / original_word_count if original_word_count > 0 else 0
            reading_time = summary_word_count / 200  # 200 words per minute
            
            return {
                "summary": summary,
                "metadata": {
                    "summary_type": method,
                    "word_count": summary_word_count,
                    "reading_time_minutes": reading_time,
                    "original_word_count": original_word_count,
                    "compression_ratio": round(compression_ratio, 3),
                    "model_used": "cohere-command",
                    "temperature": temperature,
                    "max_length": max_length
                },
                "analysis": analysis
            }
            
        except Exception as e:
            logger.error(f"Cohere summarization failed: {e}")
            # Fallback to simple summary
            return self._generate_fallback_summary(document_id, document_text, method)
    
    async def _generate_extractive_summary(self, text: str, max_length: int, temperature: float) -> str:
        """Generate extractive summary (key sentences)"""
        prompt = f"""Extract the most important sentences from this text that capture the main ideas and key points.
        Focus on factual information and key findings.
        
        Text:
        {text[:3000]}  # Limit input
        
        Important Sentences:
        """
        
        response = self.co.generate(
            model=llm_model_name,
            prompt=prompt,
            max_tokens=max_length,
            temperature=temperature,
            k=0,
            stop_sequences=[],
            return_likelihoods='NONE'
        )
        
        summary = response.generations[0].text.strip()
        return self._clean_summary(summary)
    
    async def _generate_abstractive_summary(self, text: str, max_length: int, temperature: float, 
                                          additional_instructions: Optional[str] = None) -> str:
        """Generate abstractive summary (paraphrased)"""
        instructions = additional_instructions or "Write a concise summary in your own words."
        
        prompt = f"""{instructions}
        
        Text to summarize:
        {text[:3000]}
        
        Summary:
        """
        
        response = self.co.generate(
            model='command',
            prompt=prompt,
            max_tokens=max_length,
            temperature=temperature,
            k=0,
            stop_sequences=[],
            return_likelihoods='NONE'
        )
        
        summary = response.generations[0].text.strip()
        return self._clean_summary(summary)
    
    async def _generate_bullet_points(self, text: str, max_length: int, temperature: float) -> str:
        """Generate summary as bullet points"""
        prompt = f"""Create a bullet-point summary of the key points from this text.
        Each bullet should be concise and cover a main idea.
        
        Text:
        {text[:3000]}
        
        Key Points:
        • """
        
        response = self.co.generate(
            model='command',
            prompt=prompt,
            max_tokens=max_length,
            temperature=temperature * 0.8,  # Lower temperature for more factual bullet points
            k=0,
            stop_sequences=[],
            return_likelihoods='NONE'
        )
        
        summary = "• " + response.generations[0].text.strip()
        
        # Ensure proper bullet formatting
        lines = summary.split('\n')
        formatted_lines = []
        for line in lines:
            line = line.strip()
            if line and not line.startswith('•') and not line.startswith('-'):
                line = f'• {line}'
            formatted_lines.append(line)
        
        return '\n'.join(formatted_lines)
    
    async def _generate_executive_summary(self, text: str, max_length: int, temperature: float,
                                        additional_instructions: Optional[str] = None) -> str:
        """Generate executive summary with key findings and recommendations"""
        instructions = additional_instructions or "Focus on key findings, conclusions, and recommendations for executives."
        
        prompt = f"""Write an executive summary of this text. {instructions}
        
        Text:
        {text[:3000]}
        
        Executive Summary:
        """
        
        response = self.co.generate(
            model='command',
            prompt=prompt,
            max_tokens=max_length,
            temperature=temperature,
            k=0,
            stop_sequences=[],
            return_likelihoods='NONE'
        )
        
        summary = response.generations[0].text.strip()
        if not summary.lower().startswith('executive summary'):
            summary = f"Executive Summary:\n{summary}"
        
        return self._clean_summary(summary)
    
    async def _analyze_document(self, text: str) -> Dict[str, Any]:
        """Analyze document for topics, sentiment, and type"""
        try:
            # Extract key topics
            topic_prompt = f"""Extract 3-5 main topics or themes from this text. Return as a JSON array of strings.
            
            Text: {text[:2000]}
            
            JSON:"""
            
            topic_response = self.co.chat(
                model='command',
                prompt=topic_prompt,
                max_tokens=100,
                temperature=0.2,
                k=0
            )
            
            topics_text = topic_response.generations[0].text.strip()
            try:
                topics = json.loads(topics_text)
                if not isinstance(topics, list):
                    topics = [topics]
            except:
                # Fallback parsing
                topics = [t.strip().strip('"\'') for t in topics_text.strip('[]').split(',')]
            
            # Determine document type
            type_prompt = f"""What type of document is this? Choose one: Report, Email, Article, Contract, Manual, Proposal, 
            Research Paper, Financial Report, Meeting Minutes, Presentation, Other.
            
            Text: {text[:1500]}
            
            Type:"""
            
            type_response = self.co.generate(
                model='command',
                prompt=type_prompt,
                max_tokens=20,
                temperature=0.1,
                k=0
            )
            
            doc_type = type_response.generations[0].text.strip()
            
            # Sentiment analysis
            sentiment_prompt = f"""What is the overall sentiment of this text? Choose one: Positive, Negative, Neutral, Mixed.
            
            Text: {text[:1500]}
            
            Sentiment:"""
            
            sentiment_response = self.co.generate(
                model='command',
                prompt=sentiment_prompt,
                max_tokens=10,
                temperature=0.1,
                k=0
            )
            
            sentiment = sentiment_response.generations[0].text.strip()
            
            # Word count and reading time
            word_count = len(text.split())
            reading_time = word_count / 200  # 200 words per minute
            
            return {
                "topics": topics[:5] if topics else [],
                "document_type": doc_type,
                "sentiment": sentiment,
                "word_count": word_count,
                "estimated_reading_time": round(reading_time, 1)
            }
            
        except Exception as e:
            logger.error(f"Document analysis failed: {e}")
            return {
                "topics": [],
                "document_type": "Unknown",
                "sentiment": "Neutral",
                "word_count": len(text.split()),
                "estimated_reading_time": len(text.split()) / 200
            }
    
    def _clean_text(self, text: str) -> str:
        """Clean text before processing"""
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove special characters but keep basic punctuation
        text = re.sub(r'[^\w\s.,!?()-]', '', text)
        
        # Remove multiple newlines
        text = re.sub(r'\n\s*\n', '\n\n', text)
        
        return text.strip()
    
    def _clean_summary(self, summary: str) -> str:
        """Clean up summary text"""
        if not summary:
            return ""
        
        # Remove excessive whitespace
        summary = re.sub(r'\s+', ' ', summary)
        
        # Remove markdown formatting if present
        summary = re.sub(r'#+\s*', '', summary)  # Headers
        summary = re.sub(r'\*\*(.*?)\*\*', r'\1', summary)  # Bold
        summary = re.sub(r'\*(.*?)\*', r'\1', summary)  # Italic
        
        return summary.strip()
    
    def _generate_fallback_summary(self, document_id: str, text: str, method: str) -> Dict[str, Any]:
        """Generate a simple fallback summary when Cohere is unavailable"""
        words = text.split()
        word_count = len(words)
        
        if word_count < 100:
            summary = text  # Too short to summarize
        else:
            # Simple extractive summary - take first, middle, and last sentences
            sentences = re.split(r'[.!?]+', text)
            if len(sentences) > 3:
                summary = '. '.join([
                    sentences[0].strip(),
                    sentences[len(sentences)//2].strip(),
                    sentences[-2].strip()
                ]) + '.'
            else:
                summary = text[:500] + "..." if len(text) > 500 else text
        
        # Format based on method
        if method == "bullet_points":
            sentences = summary.split('. ')
            summary = "\n".join([f"• {s.strip()}." for s in sentences if s.strip()])
        elif method == "executive":
            summary = f"Executive Summary:\n{summary}"
        
        return {
            "summary": summary,
            "metadata": {
                "summary_type": method,
                "word_count": len(summary.split()),
                "reading_time_minutes": len(summary.split()) / 200,
                "original_word_count": word_count,
                "compression_ratio": round(len(summary.split()) / word_count, 3) if word_count > 0 else 0,
                "model_used": "fallback",
                "temperature": 0.0,
                "max_length": 500
            },
            "analysis": {
                "topics": ["General"],
                "document_type": "Unknown",
                "sentiment": "Neutral",
                "word_count": word_count,
                "estimated_reading_time": word_count / 200
            }
        }
    
    def estimate_reading_time(self, text: str, words_per_minute: int = 200) -> float:
        """Estimate reading time in minutes"""
        word_count = len(text.split())
        return word_count / words_per_minute

# ==================== CREATE SUMMARIZER INSTANCE ====================

# Initialize Cohere summarizer
cohere_api_key = os.environ.get('COHERE_API_KEY')
llm_model_name = os.environ.get('MODEL_NAME')
if cohere_api_key:
    try:
        summarizer = DocumentSummarizer(cohere_api_key)
        logger.info("Cohere summarizer initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Cohere summarizer: {e}")
        summarizer = None
else:
    logger.warning("COHERE_API_KEY not set. Summarization will use fallback methods.")
    summarizer = DocumentSummarizer("dummy_key")  # Will use fallback
    
# File extensions to process
VALID_FILE_EXTENSIONS = {'.pdf', '.docx', '.doc', '.txt'}
class BatchJob(BaseModel):
    """Batch processing job"""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    status: str  # pending, running, completed, failed, cancelled
    total_documents: int = 0
    processed_documents: int = 0
    successful: int = 0
    skipped: int = 0
    failed: int = 0
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_seconds: Optional[float] = None
    created_by: str
    created_at: str
    parameters: Dict[str, Any] = {}
    
class FinancialReportMetadata(BaseModel):
    """Metadata specific to financial reports"""
    model_config = ConfigDict(extra="ignore")
    report_type: str = Field(..., description="quarterly, annual, audit, budget, forecast, income_statement, balance_sheet, cash_flow")
    period: str = Field(..., description="Q1 2024, FY2023, Jan-Dec 2024")
    fiscal_year: Optional[int] = None
    quarter: Optional[int] = Field(None, ge=1, le=4)
    currency: str = "USD"
    revenue_amount: Optional[float] = None
    net_income: Optional[float] = None
    total_assets: Optional[float] = None
    total_liabilities: Optional[float] = None
    eps: Optional[float] = None  # Earnings Per Share
    auditor: Optional[str] = None
    cfo_approved: bool = False
    board_approved: bool = False
    filing_date: Optional[str] = None
    due_date: Optional[str] = None
    department: str = "Finance"
    confidentiality_level: str = "confidential"
    
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    
class MeetingMetadata(BaseModel):
    """Metadata specific to meetings"""
    model_config = ConfigDict(extra="ignore")
    meeting_type: str = Field(..., description="client, internal, planning, review, steering_committee, board, investor, team")
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    meeting_room: Optional[str] = None
    virtual_link: Optional[str] = None
    organizer: str
    attendees: List[str] = []
    expected_attendees: List[str] = []
    agenda_items: List[str] = []
    action_items: List[str] = []
    decisions_made: List[str] = []
    follow_up_date: Optional[str] = None
    next_meeting_date: Optional[str] = None
    meeting_series: Optional[str] = None  # Weekly Sync, Monthly Review, etc.
    recurring: bool = False
    recurring_pattern: Optional[str] = None  # weekly, biweekly, monthly, quarterly
    confidentiality_level: str = "internal"


    
class BatchJob(BaseModel):
    """Batch processing job"""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    status: str  # pending, running, completed, failed, cancelled
    total_documents: int = 0
    processed_documents: int = 0
    successful: int = 0
    skipped: int = 0
    failed: int = 0
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_seconds: Optional[float] = None
    created_by: str
    created_at: str
    parameters: Dict[str, Any] = {}

class ValidationResult(BaseModel):
    """Document validation result"""
    model_config = ConfigDict(extra="ignore")
    document_id: Optional[str] = None
    filename: str
    is_valid: bool
    document_type: Optional[str] = None  # financial_report, meeting, other
    validation_errors: List[str] = []
    extracted_keywords: List[str] = []
    keyword_matches: Dict[str, int] = {}  # keyword -> count
    confidence_score: float = 0.0
    should_process: bool = False

class DocumentMetadataEnriched(BaseModel):
    """Enhanced document metadata combining financial and meeting metadata"""
    model_config = ConfigDict(extra="ignore")
    document_id: str
    document_type: str  # financial_report, meeting_minutes, presentation, contract, other
    financial_metadata: Optional[FinancialReportMetadata] = None
    meeting_metadata: Optional[MeetingMetadata] = None
    extracted_keywords: List[str] = []
    validation_status: str = "pending"  # pending, validated, rejected
    validation_reason: Optional[str] = None
    processed_at: Optional[str] = None
    processing_duration_ms: Optional[int] = None
    version: int = 1
    
class UserCreate(UserBase):
    password: str
    
class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    is_active: bool
    roles: List[str]
    groups: List[str]
    created_at: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class RoleBase(BaseModel):
    name: str
    description: str
    permissions: List[str]

class RoleResponse(RoleBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_at: str

class GroupBase(BaseModel):
    name: str
    description: str

class GroupResponse(GroupBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    members: List[str]
    created_at: str

class DocumentBase(BaseModel):
    title: str
    description: Optional[str] = ""
    visibility: str = "PRIVATE"  # PRIVATE, GROUP, ORG
    group_id: Optional[str] = None
    tags: List[str] = []

class DocumentCreate(DocumentBase):
    pass

class DocumentVersion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    version_number: int
    filename: str
    file_size: int
    content_type: str
    storage_path: str
    extracted_text: Optional[str] = None
    uploaded_at: str
    uploaded_by: str
    checkin_comment: Optional[str] = None

class DocumentResponse(DocumentBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    owner_id: str
    current_version: int
    versions: List[DocumentVersion]
    is_record: bool
    record_declared_at: Optional[str] = None
    retention_schedule_id: Optional[str] = None
    legal_hold: bool
    legal_hold_reason: Optional[str] = None
    checked_out: bool = False
    checked_out_by: Optional[str] = None
    checked_out_by_name: Optional[str] = None
    checked_out_at: Optional[str] = None
    view_count: int = 0
    last_viewed_at: Optional[str] = None
    last_viewed_by: Optional[str] = None
    deleted: bool
    created_at: str
    updated_at: str

class CheckoutRequest(BaseModel):
    comment: Optional[str] = None

class CheckinRequest(BaseModel):
    comment: Optional[str] = None

class DocumentViewEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    document_id: str
    user_id: str
    user_email: str
    viewed_at: str

class RetentionScheduleBase(BaseModel):
    name: str
    description: str
    retention_period_days: int
    disposition_action: str  # DESTROY, ARCHIVE, TRANSFER

class RetentionScheduleResponse(RetentionScheduleBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_at: str
    created_by: str

class DispositionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    document_id: str
    document_title: str
    retention_schedule_id: str
    scheduled_date: str
    disposition_action: str
    status: str  # PENDING, APPROVED, REJECTED, EXECUTED
    requested_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None

class AuditEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    actor_id: str
    actor_email: str
    actor_roles: List[str]
    actor_groups: List[str]
    action: str
    resource_type: str
    resource_id: str
    permission_used: Optional[str] = None
    before_state: Optional[Dict[str, Any]] = None
    after_state: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    timestamp: str

# ==================== LICENSE MODELS ====================

class LicenseActivateRequest(BaseModel):
    license_key: str
    organization_name: Optional[str] = None

class LicenseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    is_valid: bool
    license_type: Optional[str] = None  # TRIAL, STANDARD, ENTERPRISE
    organization_name: Optional[str] = None
    max_users: Optional[int] = None
    max_documents: Optional[int] = None
    features: List[str] = []
    activated_at: Optional[str] = None
    expires_at: Optional[str] = None
    days_remaining: Optional[int] = None
    activated_by: Optional[str] = None

class LicenseInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    license_key_hash: str
    license_type: str
    organization_name: str
    max_users: int
    max_documents: int
    features: List[str]
    activated_at: str
    expires_at: str
    activated_by: str
    is_active: bool

class SearchRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None
    page: int = 1
    page_size: int = 20
    # Enhanced search options
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    file_types: Optional[List[str]] = None
    owner_id: Optional[str] = None
    sort_by: Optional[str] = "created_at"  # created_at, updated_at, title
    sort_order: Optional[str] = "desc"  # asc, desc

class SearchResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: List[DocumentResponse]

class BulkUploadResponse(BaseModel):
    total_files: int
    successful: int
    failed: int
    documents: List[DocumentResponse]
    errors: List[Dict[str, str]]

class NotificationSettings(BaseModel):
    email_enabled: bool = False
    disposition_reminder_days: int = 7
    notify_on_legal_hold: bool = True
    notify_on_disposition: bool = True

class EmailNotification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    recipient_email: str
    subject: str
    body: str
    notification_type: str
    sent: bool
    sent_at: Optional[str] = None
    created_at: str
    
# ==================== VALIDATION & EXTRACTION FUNCTIONS ====================
# ==================== AUTH HELPERS ====================

def create_token(user_id: str, email: str, roles: List[str], groups: List[str]) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": user_id,
        "email": email,
        "roles": roles,
        "groups": groups,
        "exp": expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def has_permission(user: Dict, permission: str) -> bool:
    user_roles = user.get("roles", [])
    for role_name in user_roles:
        if role_name == "admin":
            return True
    return permission in get_user_permissions(user)

def get_user_permissions(user: Dict) -> List[str]:
    # This would normally query roles from DB, simplified for MVP
    role_permissions = {
        "admin": ["*"],
        "records_manager": ["documents:read", "documents:write", "records:manage", "retention:manage"],
        "auditor": ["documents:read", "audit:read"],
        "user": ["documents:read", "documents:write"]
    }
    permissions = set()
    for role in user.get("roles", []):
        perms = role_permissions.get(role, [])
        if "*" in perms:
            return ["*"]
        permissions.update(perms)
    return list(permissions)

def require_permission(permission: str):
    async def permission_checker(user: Dict = Depends(get_current_user)):
        if not has_permission(user, permission):
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission}")
        return user
    return permission_checker

# ==================== LICENSE HELPERS ====================

def generate_license_key(license_type: str, org_name: str, max_users: int, max_docs: int, days_valid: int) -> str:
    """Generate a license key (for demo purposes - in production use proper signing)"""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=days_valid)
    
    data = f"{license_type}|{org_name}|{max_users}|{max_docs}|{expires.strftime('%Y%m%d')}"
    signature = hashlib.sha256(f"{data}|{LICENSE_SECRET}".encode()).hexdigest()[:16]
    
    # Encode the data using URL-safe base64 (no + or /)
    encoded = base64.urlsafe_b64encode(f"{data}|{signature}".encode()).decode().rstrip('=')
    
    # Format as license key - use all parts, keep original case
    key_parts = [encoded[i:i+5] for i in range(0, len(encoded), 5)]
    return "-".join(key_parts)

def decode_license_key(license_key: str) -> Optional[Dict]:
    """Decode and validate a license key"""
    try:
        # Remove dashes and spaces
        clean_key = license_key.replace("-", "").replace(" ", "")
        
        # Add padding back for URL-safe base64
        padding = 4 - (len(clean_key) % 4)
        if padding != 4:
            clean_key += "=" * padding
        
        decoded = base64.urlsafe_b64decode(clean_key).decode()
        parts = decoded.split("|")
        
        if len(parts) < 6:
            return None
        
        license_type, org_name, max_users, max_docs, expires_str, signature = parts[:6]
        
        # Verify signature
        data = f"{license_type}|{org_name}|{max_users}|{max_docs}|{expires_str}"
        expected_sig = hashlib.sha256(f"{data}|{LICENSE_SECRET}".encode()).hexdigest()[:16]
        print(expected_sig)
        if signature != expected_sig:
            return None
        
        expires = datetime.strptime(expires_str, "%Y%m%d").replace(tzinfo=timezone.utc)
        
        return {
            "license_type": license_type,
            "organization_name": org_name,
            "max_users": int(max_users),
            "max_documents": int(max_docs),
            "expires_at": expires.isoformat(),
            "is_expired": datetime.now(timezone.utc) > expires
        }
    except Exception as e:
        logger.error(f"License decode error: {e}")
        return None

async def get_active_license() -> Optional[Dict]:
    """Get the currently active license"""
    license_doc = await db.licenses.find_one({"is_active": True}, {"_id": 0})
    return license_doc

async def check_license_valid() -> Dict:
    """Check if the application has a valid license"""
    license_doc = await get_active_license()
    
    if not license_doc:
        return {"is_valid": False, "reason": "No license activated"}
    
    expires_at = datetime.fromisoformat(license_doc["expires_at"].replace('Z', '+00:00'))
    now = datetime.now(timezone.utc)
    
    if now > expires_at:
        return {"is_valid": False, "reason": "License expired", "expired_at": license_doc["expires_at"]}
    
    days_remaining = (expires_at - now).days
    
    return {
        "is_valid": True,
        "license_type": license_doc["license_type"],
        "organization_name": license_doc["organization_name"],
        "max_users": license_doc["max_users"],
        "max_documents": license_doc["max_documents"],
        "features": license_doc.get("features", []),
        "activated_at": license_doc["activated_at"],
        "expires_at": license_doc["expires_at"],
        "days_remaining": days_remaining,
        "activated_by": license_doc.get("activated_by")
    }

def get_license_features(license_type: str) -> List[str]:
    """Get features based on license type"""
    features = {
        "TRIAL": ["documents", "search", "versioning"],
        "STANDARD": ["documents", "search", "versioning", "records", "audit", "bulk_upload"],
        "ENTERPRISE": ["documents", "search", "versioning", "records", "audit", "bulk_upload", 
                       "legal_holds", "disposition", "api_access", "sso", "advanced_reporting"]
    }
    return features.get(license_type, [])

async def require_license():
    """Dependency to check if application is licensed"""
    license_status = await check_license_valid()
    if not license_status["is_valid"]:
        raise HTTPException(
            status_code=403, 
            detail=f"Application not licensed: {license_status.get('reason', 'Invalid license')}"
        )
    return license_status

# ==================== AUDIT HELPER ====================

async def create_audit_event(
    actor: Dict,
    action: str,
    resource_type: str,
    resource_id: str,
    permission_used: str = None,
    before_state: Dict = None,
    after_state: Dict = None,
    ip_address: str = None
):
    event = {
        "id": str(uuid.uuid4()),
        "actor_id": actor.get("id", "system"),
        "actor_email": actor.get("email", "system"),
        "actor_roles": actor.get("roles", []),
        "actor_groups": actor.get("groups", []),
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "permission_used": permission_used,
        "before_state": before_state,
        "after_state": after_state,
        "ip_address": ip_address,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_events.insert_one(event)
    logger.info(f"Audit: {action} on {resource_type}/{resource_id} by {actor.get('email')}")

# ==================== EMAIL NOTIFICATION HELPER ====================

async def send_email_notification(
    recipient_email: str,
    subject: str,
    body: str,
    notification_type: str
):
    """Send email notification and store in database"""
    notification_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    notification = {
        "id": notification_id,
        "recipient_email": recipient_email,
        "subject": subject,
        "body": body,
        "notification_type": notification_type,
        "sent": False,
        "sent_at": None,
        "created_at": now
    }
    
    await db.notifications.insert_one(notification)
    
    if EMAIL_ENABLED:
        try:
            msg = MIMEMultipart()
            msg['From'] = SMTP_FROM
            msg['To'] = recipient_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'html'))
            
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
            
            await db.notifications.update_one(
                {"id": notification_id},
                {"$set": {"sent": True, "sent_at": datetime.now(timezone.utc).isoformat()}}
            )
            logger.info(f"Email sent to {recipient_email}: {subject}")
        except Exception as e:
            logger.error(f"Failed to send email to {recipient_email}: {e}")
    else:
        logger.info(f"Email notification created (email disabled): {recipient_email} - {subject}")
    
    return notification_id

async def check_disposition_deadlines():
    """Background task to check for upcoming disposition deadlines"""
    now = datetime.now(timezone.utc)
    reminder_days = 7
    
    # Find records with retention schedules approaching deadline
    records = await db.documents.find({
        "is_record": True,
        "deleted": False,
        "retention_schedule_id": {"$ne": None},
        "legal_hold": False
    }, {"_id": 0}).to_list(1000)
    
    for record in records:
        schedule = await db.retention_schedules.find_one(
            {"id": record["retention_schedule_id"]},
            {"_id": 0}
        )
        if not schedule:
            continue
        
        declared_at = datetime.fromisoformat(record["record_declared_at"].replace('Z', '+00:00'))
        retention_end = declared_at + timedelta(days=schedule["retention_period_days"])
        days_until = (retention_end - now).days
        
        if 0 < days_until <= reminder_days:
            # Check if we already sent a notification recently
            existing = await db.notifications.find_one({
                "notification_type": "DISPOSITION_REMINDER",
                "body": {"$regex": record["id"]},
                "created_at": {"$gte": (now - timedelta(days=1)).isoformat()}
            })
            
            if not existing:
                # Get records managers
                managers = await db.users.find(
                    {"roles": {"$in": ["admin", "records_manager"]}, "is_active": True},
                    {"_id": 0, "email": 1}
                ).to_list(100)
                
                for manager in managers:
                    await send_email_notification(
                        recipient_email=manager["email"],
                        subject=f"Disposition Reminder: {record['title']}",
                        body=f"""
                        <h2>Document Disposition Reminder</h2>
                        <p>The following document is approaching its retention deadline:</p>
                        <ul>
                            <li><strong>Title:</strong> {record['title']}</li>
                            <li><strong>Document ID:</strong> {record['id']}</li>
                            <li><strong>Days until disposition:</strong> {days_until}</li>
                            <li><strong>Action:</strong> {schedule['disposition_action']}</li>
                        </ul>
                        <p>Please review and process this disposition request.</p>
                        """,
                        notification_type="DISPOSITION_REMINDER"
                    )

# ==================== TEXT EXTRACTION ====================

def extract_text_from_pdf(file_content: bytes) -> str:
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        return ""

def extract_text_from_docx(file_content: bytes) -> str:
    try:
        doc = Document(io.BytesIO(file_content))
        text = "\n".join([para.text for para in doc.paragraphs])
        return text.strip()
    except Exception as e:
        logger.error(f"DOCX extraction error: {e}")
        return ""

def extract_text(file_content: bytes, content_type: str, filename: str) -> str:
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        return extract_text_from_pdf(file_content)
    elif content_type in ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] or filename.lower().endswith(".docx"):
        return extract_text_from_docx(file_content)
    elif content_type.startswith("text/") or filename.lower().endswith((".txt", ".md", ".csv")):
        try:
            return file_content.decode("utf-8")
        except:
            return ""
    return ""

def validate_document_type(filename: str, content: str) -> ValidationResult:
    """Validate if document is a financial report or meeting document"""
    filename_lower = filename.lower()
    content_lower = content.lower() if content else ""
    
    # Check file extension
    file_ext = Path(filename).suffix.lower()
    if file_ext not in VALID_FILE_EXTENSIONS:
        return ValidationResult(
            filename=filename,
            is_valid=False,
            validation_errors=[f"Invalid file extension: {file_ext}. Only {', '.join(VALID_FILE_EXTENSIONS)} allowed"]
        )
    
    # Initialize result
    result = ValidationResult(
        filename=filename,
        is_valid=True,
        document_type="other"
    )
    
    # Count keyword matches
    financial_matches = {}
    meeting_matches = {}
    
    # Check financial keywords
    for category, keywords in FINANCIAL_KEYWORDS.items():
        count = 0
        for keyword in keywords:
            if keyword in content_lower:
                count += content_lower.count(keyword)
        if count > 0:
            financial_matches[category] = count
            result.extracted_keywords.extend(keywords[:2])  # Add first 2 keywords from category
    
    # Check meeting keywords
    for category, keywords in MEETING_KEYWORDS.items():
        count = 0
        for keyword in keywords:
            if keyword in content_lower:
                count += content_lower.count(keyword)
        if count > 0:
            meeting_matches[category] = count
            result.extracted_keywords.extend(keywords[:2])
    
    # Also check filename patterns
    filename_patterns = {
        "financial_report": [r'financial.*report', r'q[1-4].*\d{4}', r'fy\d{4}', r'budget', r'forecast', r'audit'],
        "meeting": [r'meeting.*minutes', r'agenda', r'minutes.*meeting', r'steering.*committee', r'board.*meeting']
    }
    
    for doc_type, patterns in filename_patterns.items():
        for pattern in patterns:
            if re.search(pattern, filename_lower, re.IGNORECASE):
                if doc_type == "financial_report":
                    result.document_type = "financial_report"
                elif doc_type == "meeting":
                    result.document_type = "meeting"
                break
    
    # Determine document type based on keyword matches
    total_financial_matches = sum(financial_matches.values())
    total_meeting_matches = sum(meeting_matches.values())
    
    if total_financial_matches > 0 or total_meeting_matches > 0:
        result.keyword_matches = {**financial_matches, **meeting_matches}
        
        # Calculate confidence score (0-100)
        total_keywords = len(content_lower.split())
        if total_keywords > 0:
            total_matches = total_financial_matches + total_meeting_matches
            result.confidence_score = min(100.0, (total_matches / total_keywords) * 1000)
        
        # Determine document type
        if total_financial_matches > total_meeting_matches:
            result.document_type = "financial_report"
        elif total_meeting_matches > total_financial_matches:
            result.document_type = "meeting"
        else:
            result.document_type = "other"
        
        # Set should_process flag
        result.should_process = (total_financial_matches >= 3 or total_meeting_matches >= 3)
    
    return result

def extract_financial_metadata(content: str, filename: str) -> Optional[FinancialReportMetadata]:
    """Extract financial metadata from document content"""
    content_lower = content.lower()
    
    # Determine report type
    report_type = "other"
    if any(word in content_lower for word in ["quarterly", "q1", "q2", "q3", "q4"]):
        report_type = "quarterly"
    elif any(word in content_lower for word in ["annual", "yearly", "fiscal year"]):
        report_type = "annual"
    elif "audit" in content_lower:
        report_type = "audit"
    elif "budget" in content_lower:
        report_type = "budget"
    elif "forecast" in content_lower:
        report_type = "forecast"
    
    # Extract period
    period = "Unknown"
    period_patterns = [
        r'Q[1-4]\s+\d{4}',
        r'\d{4}.*Q[1-4]',
        r'FY\s*\d{4}',
        r'Fiscal Year\s*\d{4}',
        r'Year.*\d{4}',
        r'\d{4}.*Report'
    ]
    
    for pattern in period_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            period = match.group(0)
            break
    
    # Extract fiscal year
    fiscal_year = None
    year_match = re.search(r'\b(20\d{2})\b', period)
    if year_match:
        try:
            fiscal_year = int(year_match.group(1))
        except:
            pass
    
    # Extract quarter
    quarter = None
    quarter_match = re.search(r'Q([1-4])', content, re.IGNORECASE)
    if quarter_match:
        try:
            quarter = int(quarter_match.group(1))
        except:
            pass
    
    # Extract currency
    currency = "USD"
    currency_matches = re.findall(r'\$(?!\d)|USD|EUR|GBP|JPY|AUD|CAD', content)
    if currency_matches:
        if "$" in currency_matches[0]:
            currency = "USD"
        else:
            currency = currency_matches[0]
    
    # Extract financial amounts (simplified regex)
    amounts = {
        'revenue': extract_amount(content, ['revenue', 'sales', 'income']),
        'net_income': extract_amount(content, ['net income', 'net profit', 'earnings']),
        'total_assets': extract_amount(content, ['total assets', 'assets']),
        'total_liabilities': extract_amount(content, ['total liabilities', 'liabilities'])
    }
    
    # Extract dates
    filing_date = extract_date(content, ['filed', 'submitted', 'filing date'])
    due_date = extract_date(content, ['due', 'deadline', 'submission date'])
    
    return FinancialReportMetadata(
        report_type=report_type,
        period=period,
        fiscal_year=fiscal_year,
        quarter=quarter,
        currency=currency,
        revenue_amount=amounts['revenue'],
        net_income=amounts['net_income'],
        total_assets=amounts['total_assets'],
        total_liabilities=amounts['total_liabilities'],
        filing_date=filing_date,
        due_date=due_date
    )

def extract_meeting_metadata(content: str, filename: str) -> Optional[MeetingMetadata]:
    """Extract meeting metadata from document content"""
    # Determine meeting type
    meeting_type = "internal"
    content_lower = content.lower()
    
    if any(word in content_lower for word in ["client", "customer", "account"]):
        meeting_type = "client"
    elif "steering committee" in content_lower:
        meeting_type = "steering_committee"
    elif "board" in content_lower:
        meeting_type = "board"
    elif "investor" in content_lower:
        meeting_type = "investor"
    elif "planning" in content_lower:
        meeting_type = "planning"
    elif "review" in content_lower:
        meeting_type = "review"
    
    # Extract date
    date = extract_date(content, ['date:', 'meeting date:', 'on'])
    if not date:
        # Try to extract from filename
        date_match = re.search(r'\d{4}[-_]\d{2}[-_]\d{2}', filename)
        if date_match:
            date = date_match.group(0).replace('_', '-')
    
    # Extract time
    start_time = None
    end_time = None
    time_match = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)', content, re.IGNORECASE)
    if time_match:
        start_time = time_match.group(1).strip()
        end_time = time_match.group(2).strip()
    
    # Extract duration
    duration_minutes = None
    duration_match = re.search(r'(\d+)\s*(?:minute|min|hour|hr)', content_lower)
    if duration_match:
        duration = int(duration_match.group(1))
        if 'hour' in duration_match.group(0) or 'hr' in duration_match.group(0):
            duration_minutes = duration * 60
        else:
            duration_minutes = duration
    
    # Extract location
    location = None
    location_match = re.search(r'Location[:\-]\s*(.+?)(?:\n|$)', content, re.IGNORECASE)
    if location_match:
        location = location_match.group(1).strip()
    
    # Extract organizer
    organizer = "Unknown"
    organizer_match = re.search(r'(?:Organizer|Chair|Facilitator|Host)[:\-]\s*(.+?)(?:\n|$)', content, re.IGNORECASE)
    if organizer_match:
        organizer = organizer_match.group(1).strip()
    
    # Extract attendees (simplified)
    attendees = []
    attendees_section = re.search(r'Attendees?[:\-]\s*(.+?)(?:\n\n|\Z)', content, re.IGNORECASE | re.DOTALL)
    if attendees_section:
        attendees_text = attendees_section.group(1)
        # Simple extraction - split by common delimiters
        attendee_list = re.split(r'[,\n•\-*]', attendees_text)
        attendees = [a.strip() for a in attendee_list if a.strip() and len(a.strip()) > 2][:20]  # Limit to 20
    
    # Extract agenda items
    agenda_items = []
    agenda_section = re.search(r'Agenda[:\-]\s*(.+?)(?:\n\n|\Z)', content, re.IGNORECASE | re.DOTALL)
    if agenda_section:
        agenda_text = agenda_section.group(1)
        agenda_lines = agenda_text.split('\n')
        for line in agenda_lines:
            line = line.strip()
            if line and len(line) < 200:  # Reasonable length for agenda item
                # Remove bullet points, numbers
                clean_line = re.sub(r'^[•\-\*\d\.\)\s]+', '', line)
                if clean_line:
                    agenda_items.append(clean_line)
    
    # Check if recurring
    recurring = any(word in content_lower for word in ["weekly", "monthly", "quarterly", "recurring", "regular"])
    recurring_pattern = None
    if recurring:
        if "weekly" in content_lower:
            recurring_pattern = "weekly"
        elif "monthly" in content_lower:
            recurring_pattern = "monthly"
        elif "quarterly" in content_lower:
            recurring_pattern = "quarterly"
    
    return MeetingMetadata(
        meeting_type=meeting_type,
        date=date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        start_time=start_time,
        end_time=end_time,
        duration_minutes=duration_minutes,
        location=location,
        organizer=organizer,
        attendees=attendees,
        agenda_items=agenda_items[:10],  # Limit to 10
        recurring=recurring,
        recurring_pattern=recurring_pattern
    )

def extract_amount(content: str, keywords: List[str]) -> Optional[float]:
    """Extract monetary amount near keywords"""
    for keyword in keywords:
        pattern = rf'{keyword}[:\-\s]*\$?\s*([\d,]+(?:\.\d{2})?)'
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            try:
                amount_str = match.group(1).replace(',', '')
                return float(amount_str)
            except:
                pass
    return None

def extract_date(content: str, keywords: List[str]) -> Optional[str]:
    """Extract date near keywords"""
    date_patterns = [
        r'\d{4}-\d{2}-\d{2}',
        r'\d{2}/\d{2}/\d{4}',
        r'\d{2}-\d{2}-\d{4}',
        r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}'
    ]
    
    for keyword in keywords:
        for pattern in date_patterns:
            # Look for date near keyword
            search_pattern = rf'{keyword}.*?({pattern})'
            match = re.search(search_pattern, content, re.IGNORECASE)
            if match:
                return match.group(1)
    
    # If no keyword-specific date, look for any date
    for pattern in date_patterns:
        match = re.search(pattern, content)
        if match:
            return match.group(0)
    
    return None

# ==================== HIGH-PERFORMANCE BACKGROUND PROCESSOR ====================

class DocumentBatchProcessor:
    """Processes documents in batches without threading issues"""
    
    def __init__(self, max_concurrent=10, batch_size=1000):
        self.max_concurrent = max_concurrent
        self.batch_size = batch_size
        self.is_running = False
        self.stats = {
            'total_processed': 0,
            'total_validated': 0,
            'total_rejected': 0,
            'financial_reports': 0,
            'meeting_docs': 0,
            'other_docs': 0,
            'last_run_time': None,
            'current_speed_docs_per_min': 0,
            'queue_size': 0
        }
    
    async def scan_unprocessed_documents(self, limit=100000):
        """Find documents that need processing"""
        try:
            # Look for documents without enriched metadata
            pipeline = [
                {
                    "$match": {
                        "deleted": False,
                        "$or": [
                            {"metadata_extracted": {"$ne": True}},
                            {"metadata_extracted": {"$exists": False}}
                        ]
                    }
                },
                {"$project": {"id": 1, "versions": 1, "_id": 0}},
                {"$sort": {"created_at": 1}},  # Oldest first
                {"$limit": limit}
            ]
            
            documents = await db.documents.aggregate(pipeline).to_list(length=limit)
            
            logger.info(f"Found {len(documents)} documents needing metadata extraction")
            return documents
            
        except Exception as e:
            logger.error(f"Error scanning documents: {e}")
            return []
    
    async def process_document(self, document):
        """Process a single document asynchronously"""
        start_time = time.time()
        
        try:
            doc_id = document["id"]
            latest_version = max(document["versions"], key=lambda x: x["version_number"])
            
            # Get file path
            file_path = Path(latest_version.get("storage_path"))
            if not file_path.exists():
                # Try uploads directory
                file_path = UPLOAD_DIR / file_path.name
                if not file_path.exists():
                    return {
                        "status": "failed",
                        "reason": "File not found",
                        "document_id": doc_id
                    }
            
            # Read and extract text
            try:
                with open(file_path, 'rb') as f:
                    file_content = f.read()
                
                extracted_text = extract_text(
                    file_content,
                    latest_version.get("content_type", ""),
                    latest_version.get("filename", "")
                )
                
                if not extracted_text or len(extracted_text) < 10:
                    # Mark as processed but not enriched
                    await db.documents.update_one(
                        {"id": doc_id},
                        {"$set": {"metadata_extracted": True}}
                    )
                    return {
                        "status": "skipped",
                        "reason": "No text content extracted",
                        "document_id": doc_id
                    }
                
                # Validate document
                validation = validate_document_type(
                    latest_version.get("filename", ""),
                    extracted_text
                )
                
                # Only process if valid and has relevant keywords
                if not validation.should_process:
                    # Mark as processed but not enriched
                    await db.documents.update_one(
                        {"id": doc_id},
                        {"$set": {"metadata_extracted": True}}
                    )
                    return {
                        "status": "skipped",
                        "reason": "No relevant keywords found",
                        "document_id": doc_id,
                        "validation": validation.dict()
                    }
                
                # Create enriched metadata
                enriched_metadata = DocumentMetadataEnriched(
                    document_id=doc_id,
                    document_type=validation.document_type,
                    extracted_keywords=validation.extracted_keywords,
                    validation_status="validated",
                    validation_reason="Keywords matched",
                    processed_at=datetime.now(timezone.utc).isoformat(),
                    processing_duration_ms=int((time.time() - start_time) * 1000),
                    version=1
                )
                logger.info("Document Type:" + validation.document_type)
                # Extract specific metadata based on document type
                if validation.document_type == "financial_report":
                    financial_meta = extract_financial_metadata(
                        extracted_text,
                        latest_version.get("filename", "")
                    )
                    enriched_metadata.financial_metadata = financial_meta
                    
                    # Add financial tags
                    tags_to_add = ["financial", "report", "finance"]
                    if financial_meta and financial_meta.report_type:
                        tags_to_add.append(financial_meta.report_type)
                    
                    await db.documents.update_one(
                        {"id": doc_id},
                        {"$addToSet": {"tags": {"$each": tags_to_add}}}
                    )
                    
                elif validation.document_type == "meeting":
                    meeting_meta = extract_meeting_metadata(
                        extracted_text,
                        latest_version.get("filename", "")
                    )
                    enriched_metadata.meeting_metadata = meeting_meta
                    
                    # Add meeting tags
                    tags_to_add = ["meeting"]
                    if meeting_meta and meeting_meta.meeting_type:
                        tags_to_add.append(meeting_meta.meeting_type)
                    await db.documents.update_one(
                        {"id": doc_id},
                        {"$addToSet": {"tags": {"$each": tags_to_add}}}
                    )
                
                # Store enriched metadata
                await db.document_metadata_enriched.insert_one(
                    enriched_metadata.model_dump()
                )
                
                # Update document status
                await db.documents.update_one(
                    {"id": doc_id},
                    {
                        "$set": {
                            "metadata_extracted": True,
                            "metadata_extracted_at": datetime.now(timezone.utc).isoformat(),
                            "document_type": validation.document_type,
                            "last_processed": datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
                
                processing_time = int((time.time() - start_time) * 1000)
                
                return {
                    "status": "success",
                    "document_id": doc_id,
                    "document_type": validation.document_type,
                    "processing_time_ms": processing_time,
                    "keywords_found": len(validation.extracted_keywords),
                    "confidence_score": validation.confidence_score
                }
                
            except Exception as e:
                logger.error(f"Error processing document {doc_id}: {e}")
                return {
                    "status": "failed",
                    "reason": str(e),
                    "document_id": doc_id
                }
            
        except Exception as e:
            logger.error(f"Document processing error: {e}")
            return {"status": "error", "error": str(e)}
    
    async def process_batch(self, documents, batch_job_id=None):
        """Process a batch of documents in parallel"""
        if not documents:
            return {"processed": 0, "successful": 0, "failed": 0}
        
        logger.info(f"Processing batch of {len(documents)} documents...")
        
        results = []
        successful = 0
        skipped = 0
        failed = 0
        financial_reports = 0
        meeting_docs = 0
        
        start_time = time.time()
        
        # Process documents with limited concurrency
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def process_with_limit(document):
            async with semaphore:
                return await self.process_document(document)
        
        # Create tasks for all documents
        tasks = [process_with_limit(doc) for doc in documents[:self.batch_size]]
        
        # Process results as they complete
        for task in asyncio.as_completed(tasks):
            try:
                result = await asyncio.wait_for(task, timeout=300)  # 5 minute timeout
                results.append(result)
                
                if result.get("status") == "success":
                    successful += 1
                    if result.get("document_type") == "financial_report":
                        financial_reports += 1
                    elif result.get("document_type") == "meeting":
                        meeting_docs += 1
                elif result.get("status") == "skipped":
                    skipped += 1
                else:
                    failed += 1
                
                # Update batch job progress
                if batch_job_id:
                    await db.batch_jobs.update_one(
                        {"id": batch_job_id},
                        {
                            "$inc": {
                                "processed_documents": 1,
                                "successful": 1 if result.get("status") == "success" else 0,
                                "skipped": 1 if result.get("status") == "skipped" else 0,
                                "failed": 1 if result.get("status") == "failed" else 0
                            }
                        }
                    )
                
                # Log progress every 100 documents
                processed = successful + skipped + failed
                if processed % 100 == 0:
                    elapsed = time.time() - start_time
                    docs_per_min = (processed / elapsed) * 60 if elapsed > 0 else 0
                    logger.info(f"Progress: {processed}/{len(documents)} | Speed: {docs_per_min:.1f} docs/min")
                    
            except Exception as e:
                logger.error(f"Task failed: {e}")
                failed += 1
                results.append({"status": "failed", "error": str(e)})
        
        # Calculate performance
        total_time = time.time() - start_time
        docs_per_min = (len(documents) / total_time) * 60 if total_time > 0 else 0
        
        logger.info(f"Batch complete: {successful} successful, {skipped} skipped, {failed} failed")
        logger.info(f"Financial reports: {financial_reports}, Meeting docs: {meeting_docs}")
        logger.info(f"Processing speed: {docs_per_min:.1f} documents/minute")
        logger.info(f"Total time: {total_time:.2f} seconds")
        
        # Update statistics
        self.stats['total_processed'] += len(documents)
        self.stats['total_validated'] += successful
        self.stats['total_rejected'] += skipped
        self.stats['financial_reports'] += financial_reports
        self.stats['meeting_docs'] += meeting_docs
        self.stats['other_docs'] += (successful - financial_reports - meeting_docs)
        self.stats['current_speed_docs_per_min'] = docs_per_min
        
        # Update batch job if exists
        if batch_job_id:
            await db.batch_jobs.update_one(
                {"id": batch_job_id},
                {
                    "$set": {
                        "status": "completed",
                        "end_time": datetime.now(timezone.utc).isoformat(),
                        "duration_seconds": total_time
                    }
                }
            )
        
        return {
            "total": len(documents),
            "successful": successful,
            "skipped": skipped,
            "failed": failed,
            "financial_reports": financial_reports,
            "meeting_docs": meeting_docs,
            "processing_speed_docs_per_min": docs_per_min,
            "total_time_seconds": total_time
        }
    
    async def run_processing_cycle(self, limit=100000):
        """Run one complete processing cycle"""
        try:
            logger.info("=== Starting document processing cycle ===")
            
            # Create batch job record
            batch_job_id = str(uuid.uuid4())
            batch_job = {
                "id": batch_job_id,
                "name": f"Auto-process-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                "description": f"Automatic metadata extraction for up to {limit} documents",
                "status": "running",
                "total_documents": 0,
                "processed_documents": 0,
                "successful": 0,
                "skipped": 0,
                "failed": 0,
                "start_time": datetime.now(timezone.utc).isoformat(),
                "created_by": "system",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "parameters": {
                    "limit": limit,
                    "max_concurrent": self.max_concurrent,
                    "batch_size": self.batch_size
                }
            }
            await db.batch_jobs.insert_one(batch_job)
            
            # Get documents to process
            documents = await self.scan_unprocessed_documents(limit=limit)
            
            if not documents:
                logger.info("No documents need processing")
                await db.batch_jobs.update_one(
                    {"id": batch_job_id},
                    {"$set": {"status": "completed", "end_time": datetime.now(timezone.utc).isoformat()}}
                )
                return {"message": "No documents to process"}
            
            total_documents = len(documents)
            logger.info(f"Will process {total_documents} documents")
            
            # Update batch job with total count
            await db.batch_jobs.update_one(
                {"id": batch_job_id},
                {"$set": {"total_documents": total_documents}}
            )
            
            # Process in chunks
            chunk_size = self.batch_size
            all_results = []
            
            for i in range(0, total_documents, chunk_size):
                chunk = documents[i:i + chunk_size]
                logger.info(f"Processing chunk {i//chunk_size + 1}/{(total_documents + chunk_size - 1)//chunk_size}")
                
                chunk_results = await self.process_batch(chunk, batch_job_id)
                all_results.append(chunk_results)
                
                # Small pause between chunks
                if i + chunk_size < total_documents:
                    await asyncio.sleep(1)
            
            # Calculate totals
            total_successful = sum(r.get("successful", 0) for r in all_results)
            total_skipped = sum(r.get("skipped", 0) for r in all_results)
            total_failed = sum(r.get("failed", 0) for r in all_results)
            
            logger.info(f"=== Processing Cycle Complete ===")
            logger.info(f"Total documents: {total_documents}")
            logger.info(f"Successfully processed: {total_successful}")
            logger.info(f"Skipped (no keywords): {total_skipped}")
            logger.info(f"Failed: {total_failed}")
            
            self.stats['last_run_time'] = datetime.now(timezone.utc).isoformat()
            
            return {
                "batch_job_id": batch_job_id,
                "total_documents": total_documents,
                "successful": total_successful,
                "skipped": total_skipped,
                "failed": total_failed
            }
            
        except Exception as e:
            logger.error(f"Processing cycle error: {e}")
            return {"error": str(e)}
    
    async def start_async_worker(self):
        """Start the async background worker (call this from main event loop)"""
        self.is_running = True
        logger.info(f"Background document processor started with {self.max_concurrent} concurrent workers")
        
        while self.is_running:
            try:
                await self.run_processing_cycle(limit=100000)
                
                logger.info("Waiting 10 minutes before next processing cycle...")
                # Wait 10 minutes using async sleep
                for _ in range(600):  # 600 seconds = 10 minutes
                    if not self.is_running:
                        break
                    await asyncio.sleep(1)
                    
            except Exception as e:
                logger.error(f"Background worker error: {e}")
                await asyncio.sleep(60)  # Wait 1 minute on error
        
        logger.info("Background document processor stopped")
    
    def get_stats(self):
        """Get processor statistics"""
        stats = self.stats.copy()
        stats['is_running'] = self.is_running
        stats['max_concurrent'] = self.max_concurrent
        stats['batch_size'] = self.batch_size
        
        # Add system info
        stats['system'] = {
            'cpu_percent': psutil.cpu_percent(interval=1),
            'memory_percent': psutil.virtual_memory().percent,
            'thread_count': threading.active_count()
        }
        
        # Calculate target metrics
        target_docs_per_10min = 100000
        current_capacity = stats['current_speed_docs_per_min'] * 10
        
        stats['performance'] = {
            'target_documents_per_10min': target_docs_per_10min,
            'current_capacity_per_10min': current_capacity,
            'meeting_target': current_capacity >= target_docs_per_10min,
            'efficiency_percentage': min(100, (current_capacity / target_docs_per_10min) * 100) if target_docs_per_10min > 0 else 0
        }
        
        return stats
# ==================== CREATE PROCESSOR INSTANCE ====================

# Optimize for 100,000 documents per 10 minutes
# With 50 workers, each needs to process 2000 docs/10min = 3.33 docs/second
processor = DocumentBatchProcessor(
    max_concurrent=10,  # Reduced for stability
    batch_size=500
)

# ==================== NEW API ENDPOINTS ====================

# ==================== SUMMARIZATION ROUTES ====================

@api_router.post("/documents/{document_id}/summarize", response_model=SummaryResponse)
async def summarize_document(
    document_id: str,
    request: SummarizeRequest,
    user: Dict = Depends(require_permission("documents:read"))
):
    """Generate summary for a document using Cohere AI"""
    try:
        # Get document
        document = await db.documents.find_one({"id": document_id, "deleted": False}, {"_id": 0})
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        if not can_access_document(user, document):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get latest version
        latest_version = max(document["versions"], key=lambda x: x["version_number"])
        
        # Check if extracted text exists
        extracted_text = latest_version.get("extracted_text")
        if not extracted_text:
            raise HTTPException(
                status_code=400, 
                detail="No text content available for summarization. Please ensure document has been processed."
            )
        
        # Generate summary
        summarization_result = await summarizer.summarize_document(
            document_id=document_id,
            document_text=extracted_text,
            method=request.method,
            max_length=request.max_length,
            temperature=request.temperature,
            additional_instructions=request.additional_instructions
        )
        
        # Store summary in database
        summary_doc = DocumentSummary(
            document_id=document_id,
            summary_type=request.method,
            content=summarization_result["summary"],
            word_count=summarization_result["metadata"]["word_count"],
            reading_time_minutes=summarization_result["metadata"]["reading_time_minutes"],
            model_used=summarization_result["metadata"].get("model_used"),
            temperature=request.temperature,
            max_tokens=request.max_length,
            created_by=user["id"]
        ).model_dump()
        
        await db.document_summaries.insert_one(summary_doc)
        
        # Add summary ID to metadata
        summarization_result["metadata"]["summary_id"] = summary_doc["id"]
        summarization_result["metadata"]["created_at"] = summary_doc["created_at"]
        
        # Create audit event
        await create_audit_event(
            actor=user,
            action="DOCUMENT_SUMMARIZED",
            resource_type="document",
            resource_id=document_id,
            permission_used="documents:read",
            after_state={
                "method": request.method,
                "summary_length": len(summarization_result["summary"]),
                "model_used": summarization_result["metadata"].get("model_used", "fallback")
            }
        )
        
        return SummaryResponse(
            summary=summarization_result["summary"],
            metadata=summarization_result["metadata"],
            analysis=summarization_result.get("analysis")
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Summarization error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate summary")

@api_router.get("/documents/{document_id}/summaries", response_model=List[DocumentSummary])
async def get_document_summaries(
    document_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: Dict = Depends(require_permission("documents:read"))
):
    """Get all summaries for a document"""
    # Check document access
    document = await db.documents.find_one({"id": document_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    skip = (page - 1) * page_size
    summaries = await db.document_summaries.find(
        {"document_id": document_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    
    return [DocumentSummary(**summary) for summary in summaries]

@api_router.get("/summaries/{summary_id}", response_model=DocumentSummary)
async def get_summary(
    summary_id: str,
    user: Dict = Depends(require_permission("documents:read"))
):
    """Get a specific summary"""
    summary = await db.document_summaries.find_one({"id": summary_id}, {"_id": 0})
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    
    # Check document access
    document = await db.documents.find_one({"id": summary["document_id"], "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return DocumentSummary(**summary)

@api_router.delete("/summaries/{summary_id}")
async def delete_summary(
    summary_id: str,
    user: Dict = Depends(require_permission("documents:write"))
):
    """Delete a specific summary"""
    summary = await db.document_summaries.find_one({"id": summary_id}, {"_id": 0})
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    
    # Check document access and ownership
    document = await db.documents.find_one({"id": summary["document_id"], "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if document["owner_id"] != user["id"] and "admin" not in user.get("roles", []):
        raise HTTPException(status_code=403, detail="Only owner or admin can delete summaries")
    
    await db.document_summaries.delete_one({"id": summary_id})
    
    await create_audit_event(
        actor=user,
        action="SUMMARY_DELETED",
        resource_type="summary",
        resource_id=summary_id,
        permission_used="documents:write"
    )
    
    return {"message": "Summary deleted successfully"}

@api_router.post("/summarize/raw", response_model=SummaryResponse)
async def summarize_raw_text(
    request: Dict[str, Any],
    user: Dict = Depends(require_permission("documents:read"))
):
    """Generate summary from raw text (not from a document)"""
    try:
        text = request.get("text", "")
        method = request.get("method", "extractive")
        max_length = request.get("max_length", 500)
        temperature = request.get("temperature", 0.3)
        additional_instructions = request.get("additional_instructions")
        
        if not text.strip():
            raise HTTPException(status_code=400, detail="No text provided")
        
        # Generate summary
        summarization_result = await summarizer.summarize_document(
            document_id="raw-text",
            document_text=text,
            method=method,
            max_length=max_length,
            temperature=temperature,
            additional_instructions=additional_instructions
        )
        
        return SummaryResponse(
            summary=summarization_result["summary"],
            metadata=summarization_result["metadata"],
            analysis=summarization_result.get("analysis")
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Raw summarization error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate summary")

@api_router.get("/documents/{document_id}/analysis")
async def analyze_document(
    document_id: str,
    user: Dict = Depends(require_permission("documents:read"))
):
    """Analyze document content (topics, sentiment, type)"""
    try:
        # Get document
        document = await db.documents.find_one({"id": document_id, "deleted": False}, {"_id": 0})
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        if not can_access_document(user, document):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get latest version text
        latest_version = max(document["versions"], key=lambda x: x["version_number"])
        extracted_text = latest_version.get("extracted_text", "")
        
        if not extracted_text:
            raise HTTPException(
                status_code=400, 
                detail="No text content available for analysis"
            )
        
        # Analyze document
        analysis = await summarizer._analyze_document(extracted_text)
        
        return {
            "document_id": document_id,
            "document_title": document["title"],
            "analysis": analysis,
            "extracted_text_preview": extracted_text[:500] + "..." if len(extracted_text) > 500 else extracted_text
        }
        
    except Exception as e:
        logger.error(f"Document analysis error: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze document")

@api_router.get("/documents/search/summarized")
async def search_summarized_documents(
    query: str = Query("", description="Search query"),
    document_type: Optional[str] = Query(None, description="Filter by document type"),
    topics: Optional[List[str]] = Query(None, description="Filter by topics"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: Dict = Depends(require_permission("documents:read"))
):
    """Search documents that have been summarized"""
    try:
        # Build pipeline for summarized documents
        pipeline = []
        
        # Match documents with summaries
        pipeline.append({
            "$lookup": {
                "from": "document_summaries",
                "localField": "id",
                "foreignField": "document_id",
                "as": "summaries"
            }
        })
        
        # Filter documents with at least one summary
        pipeline.append({
            "$match": {
                "summaries": {"$ne": []},
                "deleted": False
            }
        })
        
        # RBAC filter - only accessible documents
        user_groups = user.get("groups", [])
        if "admin" not in user.get("roles", []):
            pipeline.append({
                "$match": {
                    "$or": [
                        {"owner_id": user["id"]},
                        {"visibility": "ORG"},
                        {"$and": [{"visibility": "GROUP"}, {"group_id": {"$in": user_groups}}]}
                    ]
                }
            })
        
        # Text search if query provided
        if query:
            pipeline.append({
                "$match": {
                    "$or": [
                        {"title": {"$regex": query, "$options": "i"}},
                        {"description": {"$regex": query, "$options": "i"}},
                        {"tags": {"$in": [query]}}
                    ]
                }
            })
        
        # Lookup document metadata if available
        pipeline.append({
            "$lookup": {
                "from": "document_metadata_enriched",
                "localField": "id",
                "foreignField": "document_id",
                "as": "metadata"
            }
        })
        
        # Add metadata fields
        pipeline.append({
            "$addFields": {
                "enriched_metadata": {"$arrayElemAt": ["$metadata", 0]},
                "latest_summary": {"$arrayElemAt": ["$summaries", 0]},
                "summary_count": {"$size": "$summaries"}
            }
        })
        
        # Filter by document type if specified
        if document_type:
            pipeline.append({
                "$match": {
                    "$or": [
                        {"enriched_metadata.document_type": document_type},
                        {"latest_summary.summary_type": document_type}
                    ]
                }
            })
        
        # Filter by topics if specified
        if topics:
            pipeline.append({
                "$match": {
                    "enriched_metadata.extracted_keywords": {"$in": topics}
                }
            })
        
        # Project only needed fields
        pipeline.append({
            "$project": {
                "id": 1,
                "title": 1,
                "description": 1,
                "owner_id": 1,
                "visibility": 1,
                "created_at": 1,
                "updated_at": 1,
                "summary_count": 1,
                "latest_summary": {
                    "summary_type": 1,
                    "created_at": 1,
                    "word_count": 1
                },
                "enriched_metadata": {
                    "document_type": 1,
                    "extracted_keywords": 1,
                    "validation_status": 1
                }
            }
        })
        
        # Sort and paginate
        pipeline.append({"$sort": {"latest_summary.created_at": -1}})
        pipeline.append({"$skip": (page - 1) * page_size})
        pipeline.append({"$limit": page_size})
        
        # Get count for pagination
        count_pipeline = pipeline.copy()
        count_pipeline[-3:] = [{"$count": "total"}]  # Remove sort, skip, limit, add count
        
        results = await db.documents.aggregate(pipeline).to_list(page_size)
        count_result = await db.documents.aggregate(count_pipeline).to_list(1)
        total = count_result[0]["total"] if count_result else 0
        
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "results": results
        }
        
    except Exception as e:
        logger.error(f"Search summarized documents error: {e}")
        raise HTTPException(status_code=500, detail="Failed to search summarized documents")
    
def require_permission(permission: str):
    async def permission_checker(user: Dict = Depends(get_current_user)):
        if not has_permission(user, permission):
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission}")
        return user
    return permission_checker
def has_permission(user: Dict, permission: str) -> bool:
    user_roles = user.get("roles", [])
    for role_name in user_roles:
        if role_name == "admin":
            return True
    return permission in get_user_permissions(user)

def get_user_permissions(user: Dict) -> List[str]:
    # This would normally query roles from DB, simplified for MVP
    role_permissions = {
        "admin": ["*"],
        "records_manager": ["documents:read", "documents:write", "records:manage", "retention:manage"],
        "auditor": ["documents:read", "audit:read"],
        "user": ["documents:read", "documents:write"]
    }
    permissions = set()
    for role in user.get("roles", []):
        perms = role_permissions.get(role, [])
        if "*" in perms:
            return ["*"]
        permissions.update(perms)
    return list(permissions)

def require_permission(permission: str):
    async def permission_checker(user: Dict = Depends(get_current_user)):
        if not has_permission(user, permission):
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission}")
        return user
    return permission_checker

@api_router.post("/documents/validate-and-process", response_model=DocumentResponse)
async def validate_and_process_document(
    title: str = Form(...),
    description: str = Form(""),
    visibility: str = Form("PRIVATE"),
    group_id: Optional[str] = Form(None),
    tags: str = Form(""),
    file: UploadFile = File(...),
    user: Dict = Depends(require_permission("documents:write"))
):
    """Upload document with validation and automatic metadata extraction"""
    # First upload the document normally
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in VALID_FILE_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(VALID_FILE_EXTENSIONS)}")
    
    # Save file
    file_content = await file.read()
    storage_filename = f"{doc_id}_v1{file_ext}"
    storage_path = UPLOAD_DIR / storage_filename
    
    async with aiofiles.open(storage_path, 'wb') as f:
        await f.write(file_content)
    
    # Extract text
    extracted_text = extract_text(file_content, file.content_type, file.filename)
    
    tags_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    
    version = {
        "version_number": 1,
        "filename": file.filename,
        "file_size": len(file_content),
        "content_type": file.content_type,
        "storage_path": str(storage_path),
        "extracted_text": extracted_text,
        "uploaded_at": now,
        "uploaded_by": user["id"]
    }
    
    document = {
        "id": doc_id,
        "title": title,
        "description": description,
        "visibility": visibility,
        "group_id": group_id,
        "tags": tags_list,
        "owner_id": user["id"],
        "current_version": 1,
        "versions": [version],
        "is_record": False,
        "record_declared_at": None,
        "retention_schedule_id": None,
        "legal_hold": False,
        "legal_hold_reason": None,
        "checked_out": False,
        "checked_out_by": None,
        "checked_out_by_name": None,
        "checked_out_at": None,
        "view_count": 0,
        "last_viewed_at": None,
        "last_viewed_by": None,
        "metadata_extracted": False,
        "document_type": "unknown",
        "deleted": False,
        "created_at": now,
        "updated_at": now
    }
    
    await db.documents.insert_one(document)
    
    # Create search index
    await db.document_search.insert_one({
        "document_id": doc_id,
        "title": title,
        "description": description,
        "tags": tags_list,
        "extracted_text": extracted_text,
        "visibility": visibility,
        "group_id": group_id,
        "owner_id": user["id"]
    })
    
    # Validate document
    validation = validate_document_type(file.filename, extracted_text)
    
    # Store validation result
    validation_doc = {
        "document_id": doc_id,
        "validation": validation.dict(),
        "validated_at": now,
        "validated_by": user["id"]
    }
    await db.document_validations.insert_one(validation_doc)
    
    # If valid, process immediately
    if validation.should_process:
        # Process in background
        async def process_async():
            try:
                result = processor.process_document_thread(document)
                logger.info(f"Document {doc_id} processed: {result}")
            except Exception as e:
                logger.error(f"Error processing document {doc_id}: {e}")
        
        asyncio.create_task(process_async())
    
    await create_audit_event(
        actor=user,
        action="DOCUMENT_VALIDATED_AND_UPLOADED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="documents:write",
        after_state={"validation_result": validation.dict()}
    )
    
    # Return document with validation info
    response = DocumentResponse(**document)
    response_dict = response.model_dump()
    response_dict["validation"] = validation.dict()
    response_dict["should_process"] = validation.should_process
    
    return response_dict

@api_router.post("/batch/start", response_model=BatchJob)
async def start_batch_processing(
    background_tasks: BackgroundTasks,
    limit: int = Query(100000, ge=1, le=1000000),
    user: Dict = Depends(require_permission("admin"))
):
    """Start a batch processing job"""
    # Create batch job record
    batch_job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    batch_job = {
        "id": batch_job_id,
        "name": f"Manual-batch-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "description": f"Manual batch processing for up to {limit} documents",
        "status": "pending",
        "total_documents": 0,
        "processed_documents": 0,
        "successful": 0,
        "skipped": 0,
        "failed": 0,
        "created_by": user["id"],
        "created_at": now,
        "parameters": {
            "limit": limit,
            "max_workers": processor.max_workers,
            "batch_size": processor.batch_size
        }
    }
    await db.batch_jobs.insert_one(batch_job)
    
    # Start processing in background
    async def process_task():
        try:
            await processor.run_processing_cycle(limit=limit)
        except Exception as e:
            logger.error(f"Batch processing failed: {e}")
            await db.batch_jobs.update_one(
                {"id": batch_job_id},
                {"$set": {"status": "failed", "end_time": datetime.now(timezone.utc).isoformat()}}
            )
    
    background_tasks.add_task(process_task)
    
    await create_audit_event(
        actor=user,
        action="BATCH_PROCESSING_STARTED",
        resource_type="batch_job",
        resource_id=batch_job_id,
        permission_used="admin",
        after_state={"limit": limit}
    )
    
    return BatchJob(**batch_job)

@api_router.get("/batch/jobs", response_model=List[BatchJob])
async def list_batch_jobs(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: Dict = Depends(require_permission("admin"))
):
    """List batch processing jobs"""
    query = {}
    if status:
        query["status"] = status
    
    skip = (page - 1) * page_size
    jobs = await db.batch_jobs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    
    return [BatchJob(**job) for job in jobs]

@api_router.get("/batch/jobs/{job_id}", response_model=BatchJob)
async def get_batch_job(job_id: str, user: Dict = Depends(require_permission("admin"))):
    """Get batch job details"""
    job = await db.batch_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found")
    return BatchJob(**job)

@api_router.post("/processor/start")
async def start_processor(
    max_workers: int = Query(50, ge=1, le=200),
    user: Dict = Depends(require_permission("admin"))
):
    """Start the background processor"""
    if processor.is_running:
        raise HTTPException(status_code=400, detail="Processor is already running")
    
    processor.max_workers = max_workers
    processor.start_background_worker()
    
    await create_audit_event(
        actor=user,
        action="BACKGROUND_PROCESSOR_STARTED",
        resource_type="processor",
        resource_id="system",
        permission_used="admin",
        after_state={"max_workers": max_workers}
    )
    
    return {
        "message": "Background processor started",
        "max_workers": max_workers,
        "target_capacity": "100,000 documents per 10 minutes"
    }

@api_router.post("/processor/stop")
async def stop_processor(user: Dict = Depends(require_permission("admin"))):
    """Stop the background processor"""
    if not processor.is_running:
        raise HTTPException(status_code=400, detail="Processor is not running")
    
    processor.stop_background_worker()
    
    await create_audit_event(
        actor=user,
        action="BACKGROUND_PROCESSOR_STOPPED",
        resource_type="processor",
        resource_id="system",
        permission_used="admin"
    )
    
    return {"message": "Background processor stopped"}

@api_router.get("/processor/stats")
async def get_processor_stats(user: Dict = Depends(get_current_user)):
    """Get processor statistics"""
    return processor.get_stats()

@api_router.get("/search/financial-reports")
async def search_financial_reports(
    report_type: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: Dict = Depends(require_permission("documents:read"))
):
    """Search financial reports"""
    # Build query for financial reports
    pipeline = [
        {
            "$match": {
                "document_type": "financial_report",
                "validation_status": "validated"
            }
        }
    ]
    
    # Add filters
    match_stage = {}
    if report_type:
        match_stage["financial_metadata.report_type"] = report_type
    if period:
        match_stage["financial_metadata.period"] = {"$regex": period, "$options": "i"}
    if year:
        match_stage["financial_metadata.fiscal_year"] = year
    
    if match_stage:
        pipeline.append({"$match": match_stage})
    
    # Get document IDs
    pipeline.extend([
        {"$project": {"document_id": 1, "_id": 0}},
        {"$skip": (page - 1) * page_size},
        {"$limit": page_size}
    ])
    
    metadata_docs = await db.document_metadata_enriched.aggregate(pipeline).to_list(page_size)
    doc_ids = [md["document_id"] for md in metadata_docs]
    
    if not doc_ids:
        return {
            "total": 0,
            "page": page,
            "page_size": page_size,
            "results": []
        }
    
    # Get documents with RBAC
    query = {
        "id": {"$in": doc_ids},
        "deleted": False
    }
    
    # RBAC filter
    user_groups = user.get("groups", [])
    if "admin" not in user.get("roles", []):
        query["$or"] = [
            {"owner_id": user["id"]},
            {"visibility": "ORG"},
            {"$and": [{"visibility": "GROUP"}, {"group_id": {"$in": user_groups}}]}
        ]
    
    documents = await db.documents.find(query, {"_id": 0}).to_list(page_size)
    
    # Get enriched metadata for each document
    results = []
    for doc in documents:
        metadata = await db.document_metadata_enriched.find_one(
            {"document_id": doc["id"]},
            {"_id": 0}
        )
        doc_dict = DocumentResponse(**doc).model_dump()
        if metadata:
            doc_dict["enriched_metadata"] = metadata
        results.append(doc_dict)
    
    # Get total count
    count_pipeline = [
        {
            "$match": {
                "document_type": "financial_report",
                "validation_status": "validated"
            }
        },
        {"$count": "total"}
    ]
    
    if match_stage:
        count_pipeline.insert(1, {"$match": match_stage})
    
    count_result = await db.document_metadata_enriched.aggregate(count_pipeline).to_list(1)
    total = count_result[0]["total"] if count_result else 0
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": results
    }

@api_router.get("/search/meetings")
async def search_meetings(
    meeting_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    organizer: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: Dict = Depends(require_permission("documents:read"))
):
    """Search meeting documents"""
    # Build query for meetings
    pipeline = [
        {
            "$match": {
                "document_type": "meeting",
                "validation_status": "validated"
            }
        }
    ]
    
    # Add filters
    match_stage = {}
    if meeting_type:
        match_stage["meeting_metadata.meeting_type"] = meeting_type
    if organizer:
        match_stage["meeting_metadata.organizer"] = {"$regex": organizer, "$options": "i"}
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        match_stage["meeting_metadata.date"] = date_filter
    
    if match_stage:
        pipeline.append({"$match": match_stage})
    
    # Get document IDs
    pipeline.extend([
        {"$project": {"document_id": 1, "_id": 0}},
        {"$skip": (page - 1) * page_size},
        {"$limit": page_size}
    ])
    
    metadata_docs = await db.document_metadata_enriched.aggregate(pipeline).to_list(page_size)
    doc_ids = [md["document_id"] for md in metadata_docs]
    
    if not doc_ids:
        return {
            "total": 0,
            "page": page,
            "page_size": page_size,
            "results": []
        }
    
    # Get documents with RBAC
    query = {
        "id": {"$in": doc_ids},
        "deleted": False
    }
    
    # RBAC filter
    user_groups = user.get("groups", [])
    if "admin" not in user.get("roles", []):
        query["$or"] = [
            {"owner_id": user["id"]},
            {"visibility": "ORG"},
            {"$and": [{"visibility": "GROUP"}, {"group_id": {"$in": user_groups}}]}
        ]
    
    documents = await db.documents.find(query, {"_id": 0}).to_list(page_size)
    
    # Get enriched metadata for each document
    results = []
    for doc in documents:
        metadata = await db.document_metadata_enriched.find_one(
            {"document_id": doc["id"]},
            {"_id": 0}
        )
        doc_dict = DocumentResponse(**doc).model_dump()
        if metadata:
            doc_dict["enriched_metadata"] = metadata
        results.append(doc_dict)
    
    # Get total count
    count_pipeline = [
        {
            "$match": {
                "document_type": "meeting",
                "validation_status": "validated"
            }
        },
        {"$count": "total"}
    ]
    
    if match_stage:
        count_pipeline.insert(1, {"$match": match_stage})
    
    count_result = await db.document_metadata_enriched.aggregate(count_pipeline).to_list(1)
    total = count_result[0]["total"] if count_result else 0
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": results
    }

@api_router.get("/documents/{doc_id}/metadata/enriched")
async def get_enriched_metadata(doc_id: str, user: Dict = Depends(require_permission("documents:read"))):
    """Get enriched metadata for a document"""
    # Check document access
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get enriched metadata
    metadata = await db.document_metadata_enriched.find_one({"document_id": doc_id}, {"_id": 0})
    if not metadata:
        raise HTTPException(status_code=404, detail="No enriched metadata found")
    
    # Get validation result
    validation = await db.document_validations.find_one(
        {"document_id": doc_id},
        {"_id": 0, "validation": 1}
    )
    
    response = {
        "document": DocumentResponse(**document),
        "enriched_metadata": metadata,
        "validation": validation.get("validation") if validation else None
    }
    
    return response

# ==================== ENHANCED STARTUP ====================

@app.on_event("startup")
async def startup_event():
    # Create text indexes
    await db.document_search.create_index([
        ("title", "text"),
        ("description", "text"),
        ("extracted_text", "text"),
        ("tags", "text")
    ])
    
    # Create indexes for new collections
    await db.document_metadata_enriched.create_index([("document_id", 1)], unique=True)
    await db.document_metadata_enriched.create_index([("document_type", 1)])
    await db.document_metadata_enriched.create_index([("validation_status", 1)])
    await db.document_metadata_enriched.create_index([("financial_metadata.report_type", 1)])
    await db.document_metadata_enriched.create_index([("financial_metadata.fiscal_year", 1)])
    await db.document_metadata_enriched.create_index([("meeting_metadata.meeting_type", 1)])
    await db.document_metadata_enriched.create_index([("meeting_metadata.date", 1)])
    
    await db.document_validations.create_index([("document_id", 1)], unique=True)
    await db.document_validations.create_index([("validation.is_valid", 1)])
    
    await db.batch_jobs.create_index([("status", 1)])
    await db.batch_jobs.create_index([("created_at", -1)])
    await db.batch_jobs.create_index([("created_by", 1)])
    
    await db.documents.create_index([("metadata_extracted", 1)])
    await db.documents.create_index([("document_type", 1)])
    await db.documents.create_index([("created_at", -1)])
    
    # Seed default roles...
    roles = [
        {"id": "role-admin", "name": "admin", "description": "Full system access", "permissions": ["*"], "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "role-records-manager", "name": "records_manager", "description": "Manage records and retention", "permissions": ["documents:read", "documents:write", "records:manage", "retention:manage"], "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "role-auditor", "name": "auditor", "description": "View audit logs", "permissions": ["documents:read", "audit:read"], "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "role-user", "name": "user", "description": "Standard user", "permissions": ["documents:read", "documents:write"], "created_at": datetime.now(timezone.utc).isoformat()}
    ]
    for role in roles:
        existing = await db.roles.find_one({"name": role["name"]})
        if not existing:
            await db.roles.insert_one(role)
    
    # Seed admin user
    admin_email = "admin@paperless.com"
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_password = bcrypt.hashpw("admin123".encode(), bcrypt.gensalt()).decode()
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "full_name": "System Administrator",
            "password_hash": admin_password,
            "is_active": True,
            "roles": ["admin"],
            "groups": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        logger.info(f"Created admin user: {admin_email} / admin123")
    
    # Start background processor as async task
    AUTO_START_PROCESSOR = os.environ.get('AUTO_START_BACKGROUND_PROCESSOR', 'false').lower() == 'true'
    
    if AUTO_START_PROCESSOR:
        logger.info("Starting background processor as async task...")
        # Start processor as background task
        asyncio.create_task(processor.start_async_worker())
        logger.info("Background processor started with async task")
    
    logger.info("Enhanced DMS startup complete with financial/meeting metadata extraction")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean shutdown"""
    if processor.is_running:
        logger.info("Stopping background processor...")
        processor.stop_background_worker()
    client.close()

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)





# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user_data: UserCreate):
    # Check license for user limits
    license_doc = await get_active_license()
    if license_doc:
        user_count = await db.users.count_documents({})
        if user_count >= license_doc.get("max_users", 5):
            raise HTTPException(status_code=400, detail="User limit reached. Please upgrade your license.")
    
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = bcrypt.hashpw(user_data.password.encode(), bcrypt.gensalt()).decode()
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user = {
        "id": user_id,
        "email": user_data.email,
        "full_name": user_data.full_name,
        "password_hash": hashed_password,
        "is_active": True,
        "roles": ["user"],
        "groups": [],
        "created_at": now,
        "updated_at": now
    }
    await db.users.insert_one(user)
    
    await create_audit_event(
        actor={"id": user_id, "email": user_data.email, "roles": ["user"], "groups": []},
        action="USER_REGISTERED",
        resource_type="user",
        resource_id=user_id
    )
    
    return UserResponse(
        id=user_id,
        email=user_data.email,
        full_name=user_data.full_name,
        is_active=True,
        roles=["user"],
        groups=[],
        created_at=now
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not bcrypt.checkpw(credentials.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is deactivated")
    
    token = create_token(user["id"], user["email"], user.get("roles", []), user.get("groups", []))
    
    await create_audit_event(
        actor=user,
        action="USER_LOGIN",
        resource_type="user",
        resource_id=user["id"]
    )
    
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            full_name=user["full_name"],
            is_active=user["is_active"],
            roles=user.get("roles", []),
            groups=user.get("groups", []),
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: Dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        full_name=user["full_name"],
        is_active=user["is_active"],
        roles=user.get("roles", []),
        groups=user.get("groups", []),
        created_at=user["created_at"]
    )

# ==================== LICENSE ROUTES ====================

@api_router.get("/license/status", response_model=LicenseResponse)
async def get_license_status():
    """Get current license status (public endpoint)"""
    status = await check_license_valid()
    return LicenseResponse(**status)

@api_router.post("/license/activate", response_model=LicenseResponse)
async def activate_license(request: LicenseActivateRequest, user: Dict = Depends(require_permission("admin"))):
    """Activate a license key (admin only)"""
    # Decode and validate the license key
    license_data = decode_license_key(request.license_key)
    
    if not license_data:
        raise HTTPException(status_code=400, detail="Invalid license key format")
    
    if license_data.get("is_expired"):
        raise HTTPException(status_code=400, detail="License key has expired")
    
    # Deactivate any existing license
    await db.licenses.update_many({}, {"$set": {"is_active": False}})
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Store the new license
    license_doc = {
        "id": str(uuid.uuid4()),
        "license_key_hash": hashlib.sha256(request.license_key.encode()).hexdigest(),
        "license_type": license_data["license_type"],
        "organization_name": request.organization_name or license_data["organization_name"],
        "max_users": license_data["max_users"],
        "max_documents": license_data["max_documents"],
        "features": get_license_features(license_data["license_type"]),
        "activated_at": now,
        "expires_at": license_data["expires_at"],
        "activated_by": user["email"],
        "is_active": True
    }
    
    await db.licenses.insert_one(license_doc)
    
    await create_audit_event(
        actor=user,
        action="LICENSE_ACTIVATED",
        resource_type="license",
        resource_id=license_doc["id"],
        permission_used="admin",
        after_state={
            "license_type": license_data["license_type"],
            "expires_at": license_data["expires_at"]
        }
    )
    
    logger.info(f"License activated by {user['email']}: {license_data['license_type']}")
    
    expires_at = datetime.fromisoformat(license_data["expires_at"].replace('Z', '+00:00'))
    days_remaining = (expires_at - datetime.now(timezone.utc)).days
    
    return LicenseResponse(
        is_valid=True,
        license_type=license_data["license_type"],
        organization_name=license_doc["organization_name"],
        max_users=license_data["max_users"],
        max_documents=license_data["max_documents"],
        features=license_doc["features"],
        activated_at=now,
        expires_at=license_data["expires_at"],
        days_remaining=days_remaining,
        activated_by=user["email"]
    )

@api_router.delete("/license/deactivate")
async def deactivate_license(user: Dict = Depends(require_permission("admin"))):
    """Deactivate the current license (admin only)"""
    license_doc = await get_active_license()
    if not license_doc:
        raise HTTPException(status_code=404, detail="No active license found")
    
    await db.licenses.update_one({"id": license_doc["id"]}, {"$set": {"is_active": False}})
    
    await create_audit_event(
        actor=user,
        action="LICENSE_DEACTIVATED",
        resource_type="license",
        resource_id=license_doc["id"],
        permission_used="admin"
    )
    
    return {"message": "License deactivated"}

@api_router.get("/license/generate-trial")
async def generate_trial_license():
    """Generate a trial license key (for demo purposes)"""
    # Generate a 30-day trial license
    key = generate_license_key(
        license_type="TRIAL",
        org_name="Trial User",
        max_users=5,
        max_docs=100,
        days_valid=30
    )
    return {
        "license_key": key,
        "type": "TRIAL",
        "valid_days": 30,
        "max_users": 5,
        "max_documents": 100,
        "note": "This is a trial license for evaluation purposes"
    }

@api_router.get("/license/generate/{license_type}")
async def generate_license(
    license_type: str,
    org_name: str = Query(...),
    days: int = Query(365),
    user: Dict = Depends(require_permission("admin"))
):
    """Generate a license key (admin only, for demo)"""
    if license_type not in ["TRIAL", "STANDARD", "ENTERPRISE"]:
        raise HTTPException(status_code=400, detail="Invalid license type")
    
    limits = {
        "TRIAL": {"users": 5, "docs": 100},
        "STANDARD": {"users": 25, "docs": 10000},
        "ENTERPRISE": {"users": 9999, "docs": 1000000}
    } 
    
    key = generate_license_key(
        license_type=license_type,
        org_name=org_name,
        max_users=limits[license_type]["users"],
        max_docs=limits[license_type]["docs"],
        days_valid=days
    )
    
    return {
        "license_key": key,
        "type": license_type,
        "organization": org_name,
        "valid_days": days,
        "max_users": limits[license_type]["users"],
        "max_documents": limits[license_type]["docs"]
    }

# ==================== USER MANAGEMENT ROUTES ====================

@api_router.get("/users", response_model=List[UserResponse])
async def list_users(user: Dict = Depends(require_permission("admin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]

@api_router.put("/users/{user_id}/roles")
async def update_user_roles(user_id: str, roles: List[str], admin: Dict = Depends(require_permission("admin"))):
    before_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not before_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one({"id": user_id}, {"$set": {"roles": roles, "updated_at": datetime.now(timezone.utc).isoformat()}})
    
    await create_audit_event(
        actor=admin,
        action="USER_ROLES_UPDATED",
        resource_type="user",
        resource_id=user_id,
        permission_used="admin",
        before_state={"roles": before_user.get("roles", [])},
        after_state={"roles": roles}
    )
    
    return {"message": "Roles updated"}

@api_router.put("/users/{user_id}/groups")
async def update_user_groups(user_id: str, groups: List[str], admin: Dict = Depends(require_permission("admin"))):
    before_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not before_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one({"id": user_id}, {"$set": {"groups": groups, "updated_at": datetime.now(timezone.utc).isoformat()}})
    
    await create_audit_event(
        actor=admin,
        action="USER_GROUPS_UPDATED",
        resource_type="user",
        resource_id=user_id,
        permission_used="admin",
        before_state={"groups": before_user.get("groups", [])},
        after_state={"groups": groups}
    )
    
    return {"message": "Groups updated"}

# ==================== GROUP ROUTES ====================

@api_router.post("/groups", response_model=GroupResponse)
async def create_group(group_data: GroupBase, user: Dict = Depends(require_permission("admin"))):
    group_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    group = {
        "id": group_id,
        "name": group_data.name,
        "description": group_data.description,
        "members": [],
        "created_at": now
    }
    await db.groups.insert_one(group)
    
    await create_audit_event(actor=user, action="GROUP_CREATED", resource_type="group", resource_id=group_id, permission_used="admin")
    
    return GroupResponse(**group)

@api_router.get("/groups", response_model=List[GroupResponse])
async def list_groups(user: Dict = Depends(get_current_user)):
    groups = await db.groups.find({}, {"_id": 0}).to_list(100)
    return [GroupResponse(**g) for g in groups]

@api_router.put("/groups/{group_id}/members")
async def update_group_members(group_id: str, members: List[str], user: Dict = Depends(require_permission("admin"))):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await db.groups.update_one({"id": group_id}, {"$set": {"members": members}})
    
    await create_audit_event(actor=user, action="GROUP_MEMBERS_UPDATED", resource_type="group", resource_id=group_id, permission_used="admin")
    
    return {"message": "Members updated"}

# ==================== ROLE ROUTES ====================

@api_router.get("/roles", response_model=List[RoleResponse])
async def list_roles(user: Dict = Depends(get_current_user)):
    roles = await db.roles.find({}, {"_id": 0}).to_list(100)
    return [RoleResponse(**r) for r in roles]

# ==================== DOCUMENT ROUTES ====================

@api_router.post("/documents", response_model=DocumentResponse)
async def create_document(
    title: str = Form(...),
    description: str = Form(""),
    visibility: str = Form("PRIVATE"),
    group_id: Optional[str] = Form(None),
    tags: str = Form(""),
    file: UploadFile = File(...),
    user: Dict = Depends(require_permission("documents:write"))
):
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Save file
    file_content = await file.read()
    file_ext = Path(file.filename).suffix
    storage_filename = f"{doc_id}_v1{file_ext}"
    storage_path = UPLOAD_DIR / storage_filename
    
    async with aiofiles.open(storage_path, 'wb') as f:
        await f.write(file_content)
    
    # Extract text
    extracted_text = extract_text(file_content, file.content_type, file.filename)
    
    tags_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    
    version = {
        "version_number": 1,
        "filename": file.filename,
        "file_size": len(file_content),
        "content_type": file.content_type,
        "storage_path": str(storage_path),
        "extracted_text": extracted_text,
        "uploaded_at": now,
        "uploaded_by": user["id"]
    }
    
    document = {
        "id": doc_id,
        "title": title,
        "description": description,
        "visibility": visibility,
        "group_id": group_id,
        "tags": tags_list,
        "owner_id": user["id"],
        "current_version": 1,
        "versions": [version],
        "is_record": False,
        "record_declared_at": None,
        "retention_schedule_id": None,
        "legal_hold": False,
        "legal_hold_reason": None,
        "checked_out": False,
        "checked_out_by": None,
        "checked_out_by_name": None,
        "checked_out_at": None,
        "view_count": 0,
        "last_viewed_at": None,
        "last_viewed_by": None,
        "deleted": False,
        "created_at": now,
        "updated_at": now
    }
    
    await db.documents.insert_one(document)
    
    # Create text index entry
    await db.document_search.insert_one({
        "document_id": doc_id,
        "title": title,
        "description": description,
        "tags": tags_list,
        "extracted_text": extracted_text,
        "visibility": visibility,
        "group_id": group_id,
        "owner_id": user["id"]
    })
    
    await create_audit_event(
        actor=user,
        action="DOCUMENT_CREATED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="documents:write"
    )
    
    return DocumentResponse(**document)

@api_router.get("/documents", response_model=List[DocumentResponse])
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    visibility: Optional[str] = None,
    is_record: Optional[bool] = None,
    legal_hold: Optional[bool] = None,
    user: Dict = Depends(require_permission("documents:read"))
):
    query = {"deleted": False}
    
    # RBAC filter
    user_groups = user.get("groups", [])
    if "admin" not in user.get("roles", []):
        query["$or"] = [
            {"owner_id": user["id"]},
            {"visibility": "ORG"},
            {"$and": [{"visibility": "GROUP"}, {"group_id": {"$in": user_groups}}]}
        ]
    
    if visibility:
        query["visibility"] = visibility
    if is_record is not None:
        query["is_record"] = is_record
    if legal_hold is not None:
        query["legal_hold"] = legal_hold
    
    skip = (page - 1) * page_size
    documents = await db.documents.find(query, {"_id": 0}).skip(skip).limit(page_size).to_list(page_size)
    
    return [DocumentResponse(**d) for d in documents]
# ==================== ENHANCED SEARCH SERVICE ====================

class DocumentSearchService:
    """Service for searching documents with metadata enrichment"""
    
    def __init__(self, db):
        self.db = db
        self.document_search_collection = db.document_search
        self.document_enriched_collection = db.document_metadata_enriched
    
    async def search_by_prompt(self, user_prompt: str, limit: int = 20, skip: int = 0, user: Dict = None) -> List[Dict[str, Any]]:
        """
        Search documents based on user prompt, prioritizing text search
        then enriching with metadata from DocumentDataEnriched
        """
        # Step 1: Search in document_search.extracted_text
        search_results = await self._search_extracted_text(user_prompt, limit, skip)
        
        if not search_results:
            return []
        
        # Step 2: Filter by user permissions
        filtered_results = await self._filter_by_permissions(search_results, user)
        
        if not filtered_results:
            return []
        
        # Step 3: Enrich with DocumentDataEnriched metadata
        enriched_results = await self._enrich_with_metadata(filtered_results)
        
        return enriched_results
    
    async def _search_extracted_text(self, prompt: str, limit: int, skip: int) -> List[Dict[str, Any]]:
        """Search in extracted_text field using MongoDB text search or regex"""
        
        # Method 1: MongoDB Text Search (if text index exists)
        try:
            # Check if text index exists
            indexes = await self.document_search_collection.index_information()
            has_text_index = any('text' in idx for idx in indexes.values())
            
            if has_text_index:
                # Use MongoDB text search
                results = await self.document_search_collection.find(
                    {"$text": {"$search": prompt}},
                    {"score": {"$meta": "textScore"}}
                ).sort([("score", {"$meta": "textScore"})]) \
                 .skip(skip).limit(limit).to_list(length=limit)
                
                if results:
                    return results
        except Exception:
            # Text index doesn't exist or search failed
            pass
        
        # Method 2: Use regex search as fallback
        # Split prompt into search terms
        search_terms = re.findall(r'\w+', prompt.lower())
        
        if not search_terms:
            return []
        
        # Create regex patterns for each term
        regex_patterns = [re.compile(re.escape(term), re.IGNORECASE) for term in search_terms]
        
        # Build query: match any of the terms in extracted_text
        or_conditions = []
        for pattern in regex_patterns:
            or_conditions.append({"extracted_text": {"$regex": pattern}})
        
        query = {"$or": or_conditions} if len(or_conditions) > 1 else or_conditions[0]
        
        results = await self.document_search_collection.find(query) \
            .skip(skip).limit(limit).to_list(length=limit)
        
        return results
    
    async def _filter_by_permissions(self, search_results: List[Dict[str, Any]], user: Dict) -> List[Dict[str, Any]]:
        """Filter search results by user permissions"""
        
        if not search_results or not user:
            return search_results
        
        # Extract document_ids from search results
        doc_ids = [result.get("document_id") for result in search_results if result.get("document_id")]
        
        if not doc_ids:
            return []
        
        # Get documents with their full metadata for permission checking
        documents = await self.db.documents.find(
            {"id": {"$in": doc_ids}, "deleted": False},
            {"_id": 0}
        ).to_list(length=len(doc_ids))
        
        # Filter documents by user access
        accessible_docs = []
        for doc in documents:
            if can_access_document(user, doc):
                accessible_docs.append(doc)
        
        # Get the corresponding search results for accessible documents
        accessible_doc_ids = {doc["id"] for doc in accessible_docs}
        filtered_search_results = [
            result for result in search_results 
            if result.get("document_id") in accessible_doc_ids
        ]
        
        return filtered_search_results
    
    async def _enrich_with_metadata(self, search_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich search results with metadata from DocumentDataEnriched"""
        
        if not search_results:
            return []
        
        # Extract document_ids from search results
        doc_ids = [result.get("document_id") for result in search_results if result.get("document_id")]
        
        if not doc_ids:
            return search_results
        
        # Get enriched metadata for these documents
        enriched_metadata = await self.document_enriched_collection.find(
            {"document_id": {"$in": doc_ids}}
        ).to_list(length=len(doc_ids))
        
        # Create lookup dictionary for fast access
        metadata_by_doc_id = {md["document_id"]: md for md in enriched_metadata}
        
        # Merge results
        enriched_results = []
        for result in search_results:
            doc_id = result.get("document_id")
            enriched_result = {
                **result,
                "enriched_metadata": metadata_by_doc_id.get(doc_id, {})
            }
            enriched_results.append(enriched_result)
        
        return enriched_results
    
    async def search_advanced(
        self,
        prompt: str,
        user: Dict,
        document_type: Optional[str] = None,
        validation_status: Optional[str] = None,
        tags: Optional[List[str]] = None,
        group_id: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 20,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """Advanced search with filters"""
        
        # Build base query for text search
        text_results = await self._search_extracted_text(prompt, limit=100, skip=0)
        
        if not text_results:
            return []
        
        # Filter by permissions
        filtered_results = await self._filter_by_permissions(text_results, user)
        
        if not filtered_results:
            return []
        
        # Get document IDs from filtered results
        filtered_doc_ids = [r.get("document_id") for r in filtered_results if r.get("document_id")]
        
        # Build filter query for DocumentDataEnriched
        filter_query = {"document_id": {"$in": filtered_doc_ids}}
        
        if document_type:
            filter_query["document_type"] = document_type
        if validation_status:
            filter_query["validation_status"] = validation_status
        
        # Apply date filters if provided
        if date_from or date_to:
            # Need to get document creation dates
            docs = await self.db.documents.find(
                {"id": {"$in": filtered_doc_ids}},
                {"id": 1, "created_at": 1}
            ).to_list(length=len(filtered_doc_ids))
            
            # Filter by date range
            date_filtered_ids = []
            for doc in docs:
                doc_date = doc.get("created_at")
                if not doc_date:
                    continue
                
                if date_from and doc_date < date_from:
                    continue
                if date_to and doc_date > date_to:
                    continue
                
                date_filtered_ids.append(doc["id"])
            
            filter_query["document_id"]["$in"] = date_filtered_ids
        
        # Get filtered enriched documents
        filtered_enriched = await self.document_enriched_collection.find(filter_query) \
            .skip(skip).limit(limit).to_list(length=limit)
        
        enriched_doc_ids = [doc["document_id"] for doc in filtered_enriched]
        
        # Get search data for filtered documents
        search_data = await self.document_search_collection.find(
            {"document_id": {"$in": enriched_doc_ids}}
        ).to_list(length=len(enriched_doc_ids))
        
        # Apply additional filters from document_search
        if tags:
            search_data = [doc for doc in search_data 
                          if any(tag in doc.get("tags", []) for tag in tags)]
        if group_id:
            search_data = [doc for doc in search_data 
                          if doc.get("group_id") == group_id]
        
        # Enrich and return
        return await self._enrich_with_metadata(search_data)
    
    async def get_relevant_context(self, prompt: str, user: Dict, max_chars: int = 2000) -> str:
        """Get relevant text context from search results for RAG or similar use cases"""
        
        results = await self.search_by_prompt(prompt, limit=5, user=user)
        
        context_parts = []
        total_chars = 0
        
        for result in results:
            extracted_text = result.get("extracted_text", "")
            if not extracted_text:
                continue
            
            # Truncate if needed
            remaining_chars = max_chars - total_chars
            if remaining_chars <= 0:
                break
            
            if len(extracted_text) > remaining_chars:
                # Try to cut at sentence boundary
                truncated = extracted_text[:remaining_chars]
                last_period = truncated.rfind('.')
                if last_period > 0:
                    truncated = truncated[:last_period + 1]
                context_text = truncated
            else:
                context_text = extracted_text
            
            # Add metadata context
            metadata = result.get("enriched_metadata", {})
            metadata_info = f"[Document: {metadata.get('document_type', 'Unknown')}, "
            metadata_info += f"Status: {metadata.get('validation_status', 'Unknown')}]"
            
            context_parts.append(f"{metadata_info}\n{context_text}")
            total_chars += len(context_text)
        
        return "\n\n---\n\n".join(context_parts)

# Create search service instance
search_service = DocumentSearchService(db)


@api_router.get("/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str, track_view: bool = True, user: Dict = Depends(require_permission("documents:read"))):
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check access
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Track document view
    if track_view:
        now = datetime.now(timezone.utc).isoformat()
        await db.documents.update_one(
            {"id": doc_id},
            {
                "$inc": {"view_count": 1},
                "$set": {"last_viewed_at": now, "last_viewed_by": user["email"]}
            }
        )
        
        # Store view event
        await db.document_views.insert_one({
            "id": str(uuid.uuid4()),
            "document_id": doc_id,
            "user_id": user["id"],
            "user_email": user["email"],
            "viewed_at": now
        })
        
        # Refresh document with updated view count
        document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    
    return DocumentResponse(**document)

@api_router.get("/documents/{doc_id}/views")
async def get_document_views(
    doc_id: str,
    limit: int = Query(20, ge=1, le=100),
    user: Dict = Depends(require_permission("documents:read"))
):
    """Get view history for a document"""
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    views = await db.document_views.find(
        {"document_id": doc_id},
        {"_id": 0}
    ).sort("viewed_at", -1).limit(limit).to_list(limit)
    
    return {
        "document_id": doc_id,
        "total_views": document.get("view_count", 0),
        "recent_views": views
    }

# ==================== CHECKOUT/CHECKIN ====================

@api_router.post("/documents/{doc_id}/checkout", response_model=DocumentResponse)
async def checkout_document(
    doc_id: str,
    request: CheckoutRequest = None,
    user: Dict = Depends(require_permission("documents:write"))
):
    """Checkout document for exclusive editing"""
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if document.get("is_record"):
        raise HTTPException(status_code=400, detail="Cannot checkout a declared record")
    
    if document.get("legal_hold"):
        raise HTTPException(status_code=400, detail="Document is under legal hold")
    
    if document.get("checked_out"):
        if document.get("checked_out_by") == user["id"]:
            raise HTTPException(status_code=400, detail="You already have this document checked out")
        raise HTTPException(
            status_code=400, 
            detail=f"Document is already checked out by {document.get('checked_out_by_name', 'another user')}"
        )
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.documents.update_one(
        {"id": doc_id},
        {"$set": {
            "checked_out": True,
            "checked_out_by": user["id"],
            "checked_out_by_name": user["full_name"],
            "checked_out_at": now,
            "updated_at": now
        }}
    )
    
    await create_audit_event(
        actor=user,
        action="DOCUMENT_CHECKED_OUT",
        resource_type="document",
        resource_id=doc_id,
        permission_used="documents:write",
        after_state={"comment": request.comment if request else None}
    )
    
    updated_doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    return DocumentResponse(**updated_doc)

@api_router.post("/documents/{doc_id}/checkin", response_model=DocumentResponse)
async def checkin_document(
    doc_id: str,
    file: UploadFile = File(None),
    comment: str = Form(""),
    user: Dict = Depends(require_permission("documents:write"))
):
    """Checkin document, optionally with a new version"""
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.get("checked_out"):
        raise HTTPException(status_code=400, detail="Document is not checked out")
    
    # Only the user who checked it out (or admin) can check it in
    if document.get("checked_out_by") != user["id"] and "admin" not in user.get("roles", []):
        raise HTTPException(status_code=403, detail="Only the user who checked out the document can check it in")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # If file provided, create new version
    if file:
        new_version = document["current_version"] + 1
        
        file_content = await file.read()
        file_ext = Path(file.filename).suffix
        storage_filename = f"{doc_id}_v{new_version}{file_ext}"
        storage_path = UPLOAD_DIR / storage_filename
        
        async with aiofiles.open(storage_path, 'wb') as f:
            await f.write(file_content)
        
        extracted_text = extract_text(file_content, file.content_type, file.filename)
        
        version = {
            "version_number": new_version,
            "filename": file.filename,
            "file_size": len(file_content),
            "content_type": file.content_type,
            "storage_path": str(storage_path),
            "extracted_text": extracted_text,
            "uploaded_at": now,
            "uploaded_by": user["id"],
            "checkin_comment": comment or None
        }
        
        await db.documents.update_one(
            {"id": doc_id},
            {
                "$push": {"versions": version},
                "$set": {
                    "current_version": new_version,
                    "checked_out": False,
                    "checked_out_by": None,
                    "checked_out_by_name": None,
                    "checked_out_at": None,
                    "updated_at": now
                }
            }
        )
        
        # Update search index
        await db.document_search.update_one(
            {"document_id": doc_id},
            {"$set": {"extracted_text": extracted_text}}
        )
        
        await create_audit_event(
            actor=user,
            action="DOCUMENT_CHECKED_IN_WITH_VERSION",
            resource_type="document",
            resource_id=doc_id,
            permission_used="documents:write",
            after_state={"version": new_version, "comment": comment}
        )
    else:
        # Just release the checkout without new version
        await db.documents.update_one(
            {"id": doc_id},
            {"$set": {
                "checked_out": False,
                "checked_out_by": None,
                "checked_out_by_name": None,
                "checked_out_at": None,
                "updated_at": now
            }}
        )
        
        await create_audit_event(
            actor=user,
            action="DOCUMENT_CHECKED_IN",
            resource_type="document",
            resource_id=doc_id,
            permission_used="documents:write",
            after_state={"comment": comment}
        )
    
    updated_doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    return DocumentResponse(**updated_doc)

@api_router.delete("/documents/{doc_id}/checkout", response_model=DocumentResponse)
async def cancel_checkout(doc_id: str, user: Dict = Depends(require_permission("documents:write"))):
    """Cancel checkout without checking in (discard changes)"""
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.get("checked_out"):
        raise HTTPException(status_code=400, detail="Document is not checked out")
    
    # Only the user who checked it out (or admin) can cancel
    if document.get("checked_out_by") != user["id"] and "admin" not in user.get("roles", []):
        raise HTTPException(status_code=403, detail="Only the user who checked out the document can cancel")
    
    await db.documents.update_one(
        {"id": doc_id},
        {"$set": {
            "checked_out": False,
            "checked_out_by": None,
            "checked_out_by_name": None,
            "checked_out_at": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await create_audit_event(
        actor=user,
        action="DOCUMENT_CHECKOUT_CANCELLED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="documents:write"
    )
    
    updated_doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    return DocumentResponse(**updated_doc)

@api_router.get("/documents/checked-out/me")
async def get_my_checkouts(user: Dict = Depends(get_current_user)):
    """Get documents currently checked out by the current user"""
    documents = await db.documents.find(
        {"checked_out": True, "checked_out_by": user["id"], "deleted": False},
        {"_id": 0}
    ).to_list(100)
    
    return [DocumentResponse(**d) for d in documents]

def can_access_document(user: Dict, document: Dict) -> bool:
    if "admin" in user.get("roles", []):
        return True
    if document["owner_id"] == user["id"]:
        return True
    if document["visibility"] == "ORG":
        return True
    if document["visibility"] == "GROUP" and document.get("group_id") in user.get("groups", []):
        return True
    return False

@api_router.post("/documents/{doc_id}/versions", response_model=DocumentResponse)
async def add_document_version(
    doc_id: str,
    file: UploadFile = File(...),
    user: Dict = Depends(require_permission("documents:write"))
):
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if document.get("is_record"):
        raise HTTPException(status_code=400, detail="Cannot modify a declared record")
    
    if document.get("legal_hold"):
        raise HTTPException(status_code=400, detail="Document is under legal hold")
    
    # Check if document is checked out by someone else
    if document.get("checked_out") and document.get("checked_out_by") != user["id"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Document is checked out by {document.get('checked_out_by_name', 'another user')}. Please wait for them to check in."
        )
    
    now = datetime.now(timezone.utc).isoformat()
    new_version = document["current_version"] + 1
    
    file_content = await file.read()
    file_ext = Path(file.filename).suffix
    storage_filename = f"{doc_id}_v{new_version}{file_ext}"
    storage_path = UPLOAD_DIR / storage_filename
    
    async with aiofiles.open(storage_path, 'wb') as f:
        await f.write(file_content)
    
    extracted_text = extract_text(file_content, file.content_type, file.filename)
    
    version = {
        "version_number": new_version,
        "filename": file.filename,
        "file_size": len(file_content),
        "content_type": file.content_type,
        "storage_path": str(storage_path),
        "extracted_text": extracted_text,
        "uploaded_at": now,
        "uploaded_by": user["id"]
    }
    
    await db.documents.update_one(
        {"id": doc_id},
        {
            "$push": {"versions": version},
            "$set": {"current_version": new_version, "updated_at": now}
        }
    )
    
    # Update search index
    await db.document_search.update_one(
        {"document_id": doc_id},
        {"$set": {"extracted_text": extracted_text}}
    )
    
    await create_audit_event(
        actor=user,
        action="DOCUMENT_VERSION_ADDED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="documents:write"
    )
    
    updated_doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    return DocumentResponse(**updated_doc)

@api_router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, version: int = None, user: Dict = Depends(require_permission("documents:read"))):
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    version_num = version or document["current_version"]
    version_data = next((v for v in document["versions"] if v["version_number"] == version_num), None)
    
    if not version_data:
        raise HTTPException(status_code=404, detail="Version not found")
    
    file_path = Path(version_data["storage_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    await create_audit_event(
        actor=user,
        action="DOCUMENT_DOWNLOADED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="documents:read"
    )
    
    async def file_iterator():
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(8192):
                yield chunk
    
    return StreamingResponse(
        file_iterator(),
        media_type=version_data["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{version_data["filename"]}"'}
    )

@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: Dict = Depends(require_permission("documents:write"))):
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if document["owner_id"] != user["id"] and "admin" not in user.get("roles", []):
        raise HTTPException(status_code=403, detail="Only owner or admin can delete")
    
    if document.get("is_record"):
        raise HTTPException(status_code=400, detail="Cannot delete a declared record")
    
    if document.get("legal_hold"):
        raise HTTPException(status_code=400, detail="Document is under legal hold")
    
    await db.documents.update_one({"id": doc_id}, {"$set": {"deleted": True, "updated_at": datetime.now(timezone.utc).isoformat()}})
    
    await create_audit_event(
        actor=user,
        action="DOCUMENT_DELETED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="documents:write"
    )
    
    return {"message": "Document deleted"}

# ==================== BULK UPLOAD ====================

@api_router.post("/documents/bulk", response_model=BulkUploadResponse)
async def bulk_upload_documents(
    files: List[UploadFile] = File(...),
    visibility: str = Form("PRIVATE"),
    group_id: Optional[str] = Form(None),
    tags: str = Form(""),
    user: Dict = Depends(require_permission("documents:write"))
):
    """Upload multiple documents at once"""
    successful_docs = []
    errors = []
    tags_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    
    for file in files:
        try:
            doc_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            
            # Generate title from filename
            title = file.filename.rsplit('.', 1)[0] if '.' in file.filename else file.filename
            
            # Save file
            file_content = await file.read()
            file_ext = Path(file.filename).suffix
            storage_filename = f"{doc_id}_v1{file_ext}"
            storage_path = UPLOAD_DIR / storage_filename
            
            async with aiofiles.open(storage_path, 'wb') as f:
                await f.write(file_content)
            
            # Extract text
            extracted_text = extract_text(file_content, file.content_type, file.filename)
            
            version = {
                "version_number": 1,
                "filename": file.filename,
                "file_size": len(file_content),
                "content_type": file.content_type,
                "storage_path": str(storage_path),
                "extracted_text": extracted_text,
                "uploaded_at": now,
                "uploaded_by": user["id"]
            }
            
            document = {
                "id": doc_id,
                "title": title,
                "description": "",
                "visibility": visibility,
                "group_id": group_id,
                "tags": tags_list,
                "owner_id": user["id"],
                "current_version": 1,
                "versions": [version],
                "is_record": False,
                "record_declared_at": None,
                "retention_schedule_id": None,
                "legal_hold": False,
                "legal_hold_reason": None,
                "checked_out": False,
                "checked_out_by": None,
                "checked_out_by_name": None,
                "checked_out_at": None,
                "view_count": 0,
                "last_viewed_at": None,
                "last_viewed_by": None,
                "deleted": False,
                "created_at": now,
                "updated_at": now
            }
            
            await db.documents.insert_one(document)
            
            # Create search index entry
            await db.document_search.insert_one({
                "document_id": doc_id,
                "title": title,
                "description": "",
                "tags": tags_list,
                "extracted_text": extracted_text,
                "visibility": visibility,
                "group_id": group_id,
                "owner_id": user["id"]
            })
            
            successful_docs.append(DocumentResponse(**document))
            
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})
            logger.error(f"Bulk upload error for {file.filename}: {e}")
    
    # Create single audit event for bulk upload
    if successful_docs:
        await create_audit_event(
            actor=user,
            action="DOCUMENTS_BULK_UPLOADED",
            resource_type="document",
            resource_id=f"bulk-{len(successful_docs)}-files",
            permission_used="documents:write",
            after_state={"count": len(successful_docs), "doc_ids": [d.id for d in successful_docs]}
        )
    
    return BulkUploadResponse(
        total_files=len(files),
        successful=len(successful_docs),
        failed=len(errors),
        documents=successful_docs,
        errors=errors
    )

# ==================== DOCUMENT PREVIEW ====================

@api_router.get("/documents/{doc_id}/preview")
async def preview_document(doc_id: str, version: int = None, user: Dict = Depends(require_permission("documents:read"))):
    """Get document for inline preview (PDF, images, text files)"""
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Access denied")
    
    version_num = version or document["current_version"]
    version_data = next((v for v in document["versions"] if v["version_number"] == version_num), None)
    
    if not version_data:
        raise HTTPException(status_code=404, detail="Version not found")
    
    file_path = Path(version_data["storage_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    content_type = version_data["content_type"]
    
    # For PDFs and images, serve inline for preview
    async def file_iterator():
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(8192):
                yield chunk
    
    # Set appropriate headers for preview
    headers = {}
    if content_type == "application/pdf":
        headers["Content-Disposition"] = f'inline; filename="{version_data["filename"]}"'
    elif content_type.startswith("image/"):
        headers["Content-Disposition"] = f'inline; filename="{version_data["filename"]}"'
    else:
        # For other files, return as download
        headers["Content-Disposition"] = f'attachment; filename="{version_data["filename"]}"'
    
    return StreamingResponse(
        file_iterator(),
        media_type=content_type,
        headers=headers
    )

# ==================== NOTIFICATION ROUTES ====================

@api_router.get("/notifications")
async def get_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: Dict = Depends(get_current_user)
):
    """Get notifications for current user"""
    query = {"recipient_email": user["email"]}
    skip = (page - 1) * page_size
    
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    total = await db.notifications.count_documents(query)
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "notifications": notifications
    }

@api_router.post("/notifications/check-deadlines")
async def trigger_deadline_check(
    background_tasks: BackgroundTasks,
    user: Dict = Depends(require_permission("records:manage"))
):
    """Manually trigger disposition deadline check"""
    background_tasks.add_task(check_disposition_deadlines)
    return {"message": "Deadline check scheduled"}

@api_router.get("/notifications/settings")
async def get_notification_settings(user: Dict = Depends(get_current_user)):
    """Get notification settings for user"""
    settings = await db.notification_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        return NotificationSettings()
    return NotificationSettings(**settings)

@api_router.put("/notifications/settings")
async def update_notification_settings(
    settings: NotificationSettings,
    user: Dict = Depends(get_current_user)
):
    """Update notification settings for user"""
    await db.notification_settings.update_one(
        {"user_id": user["id"]},
        {"$set": {**settings.model_dump(), "user_id": user["id"]}},
        upsert=True
    )
    return {"message": "Settings updated"}

# ==================== SEARCH ROUTES ====================

@api_router.post("/search", response_model=SearchResponse)
async def search_documents(search: SearchRequest, user: Dict = Depends(require_permission("documents:read"))):
    # Build text search query for document_search collection
    search_query = {}
    if search.query:
        search_query["$text"] = {"$search": search.query}
    
    # Add filters to search collection query
    if search.filters:
        if search.filters.get("visibility"):
            search_query["visibility"] = search.filters["visibility"]
        if search.filters.get("tags"):
            search_query["tags"] = {"$in": search.filters["tags"]}
    
    # Get matching document IDs from search index
    if search_query:
        search_results = await db.document_search.find(search_query, {"document_id": 1, "_id": 0}).to_list(1000)
        doc_ids = [r["document_id"] for r in search_results]
    else:
        doc_ids = None  # Will fetch all documents
    
    # Build main documents query with RBAC and advanced filters
    doc_query = {"deleted": False}
    if doc_ids is not None:
        doc_query["id"] = {"$in": doc_ids}
    
    # RBAC filter
    user_groups = user.get("groups", [])
    if "admin" not in user.get("roles", []):
        doc_query["$or"] = [
            {"owner_id": user["id"]},
            {"visibility": "ORG"},
            {"$and": [{"visibility": "GROUP"}, {"group_id": {"$in": user_groups}}]}
        ]
    
    # Enhanced filters
    if search.filters:
        if search.filters.get("is_record") is not None:
            doc_query["is_record"] = search.filters["is_record"]
        if search.filters.get("legal_hold") is not None:
            doc_query["legal_hold"] = search.filters["legal_hold"]
    
    # Date range filters
    if search.date_from or search.date_to:
        date_filter = {}
        if search.date_from:
            date_filter["$gte"] = search.date_from
        if search.date_to:
            date_filter["$lte"] = search.date_to
        doc_query["created_at"] = date_filter
    
    # File type filter (by extension in filename)
    if search.file_types:
        extension_patterns = [f".*\\.{ext}$" for ext in search.file_types]
        doc_query["versions.filename"] = {"$regex": "|".join(extension_patterns), "$options": "i"}
    
    # Owner filter
    if search.owner_id:
        doc_query["owner_id"] = search.owner_id
    
    # Sorting
    sort_field = search.sort_by or "created_at"
    sort_direction = -1 if search.sort_order == "desc" else 1
    
    total = await db.documents.count_documents(doc_query)
    skip = (search.page - 1) * search.page_size
    documents = await db.documents.find(doc_query, {"_id": 0}).sort(sort_field, sort_direction).skip(skip).limit(search.page_size).to_list(search.page_size)
    
    return SearchResponse(
        total=total,
        page=search.page,
        page_size=search.page_size,
        results=[DocumentResponse(**d) for d in documents]
    )

# ==================== RECORDS MANAGEMENT ROUTES ====================

@api_router.post("/documents/{doc_id}/declare-record", response_model=DocumentResponse)
async def declare_record(doc_id: str, retention_schedule_id: str = None, user: Dict = Depends(require_permission("records:manage"))):
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if document.get("is_record"):
        raise HTTPException(status_code=400, detail="Document is already a record")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.documents.update_one(
        {"id": doc_id},
        {"$set": {
            "is_record": True,
            "record_declared_at": now,
            "retention_schedule_id": retention_schedule_id,
            "updated_at": now
        }}
    )
    
    await create_audit_event(
        actor=user,
        action="RECORD_DECLARED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="records:manage"
    )
    
    updated_doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    return DocumentResponse(**updated_doc)

@api_router.post("/documents/{doc_id}/legal-hold", response_model=DocumentResponse)
async def apply_legal_hold(doc_id: str, reason: str, user: Dict = Depends(require_permission("records:manage"))):
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.documents.update_one(
        {"id": doc_id},
        {"$set": {
            "legal_hold": True,
            "legal_hold_reason": reason,
            "updated_at": now
        }}
    )
    
    await create_audit_event(
        actor=user,
        action="LEGAL_HOLD_APPLIED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="records:manage",
        after_state={"reason": reason}
    )
    
    updated_doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    return DocumentResponse(**updated_doc)

@api_router.delete("/documents/{doc_id}/legal-hold", response_model=DocumentResponse)
async def release_legal_hold(doc_id: str, user: Dict = Depends(require_permission("records:manage"))):
    document = await db.documents.find_one({"id": doc_id, "deleted": False}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    await db.documents.update_one(
        {"id": doc_id},
        {"$set": {
            "legal_hold": False,
            "legal_hold_reason": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await create_audit_event(
        actor=user,
        action="LEGAL_HOLD_RELEASED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="records:manage"
    )
    
    updated_doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    return DocumentResponse(**updated_doc)

# ==================== RETENTION SCHEDULE ROUTES ====================

@api_router.post("/retention-schedules", response_model=RetentionScheduleResponse)
async def create_retention_schedule(schedule: RetentionScheduleBase, user: Dict = Depends(require_permission("retention:manage"))):
    schedule_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    schedule_doc = {
        "id": schedule_id,
        **schedule.model_dump(),
        "created_at": now,
        "created_by": user["id"]
    }
    await db.retention_schedules.insert_one(schedule_doc)
    
    await create_audit_event(
        actor=user,
        action="RETENTION_SCHEDULE_CREATED",
        resource_type="retention_schedule",
        resource_id=schedule_id,
        permission_used="retention:manage"
    )
    
    return RetentionScheduleResponse(**schedule_doc)

@api_router.get("/retention-schedules", response_model=List[RetentionScheduleResponse])
async def list_retention_schedules(user: Dict = Depends(get_current_user)):
    schedules = await db.retention_schedules.find({}, {"_id": 0}).to_list(100)
    return [RetentionScheduleResponse(**s) for s in schedules]

@api_router.put("/documents/{doc_id}/retention-schedule")
async def assign_retention_schedule(doc_id: str, retention_schedule_id: str, user: Dict = Depends(require_permission("records:manage"))):
    document = await db.documents.find_one({"id": doc_id, "deleted": False})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    schedule = await db.retention_schedules.find_one({"id": retention_schedule_id})
    if not schedule:
        raise HTTPException(status_code=404, detail="Retention schedule not found")
    
    await db.documents.update_one(
        {"id": doc_id},
        {"$set": {"retention_schedule_id": retention_schedule_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await create_audit_event(
        actor=user,
        action="RETENTION_SCHEDULE_ASSIGNED",
        resource_type="document",
        resource_id=doc_id,
        permission_used="records:manage",
        after_state={"retention_schedule_id": retention_schedule_id}
    )
    
    return {"message": "Retention schedule assigned"}

# ==================== DISPOSITION ROUTES ====================

@api_router.get("/disposition-queue", response_model=List[DispositionRequest])
async def get_disposition_queue(user: Dict = Depends(require_permission("records:manage"))):
    # Find records past their retention period
    now = datetime.now(timezone.utc)
    
    # Get pending dispositions
    dispositions = await db.disposition_requests.find({"status": "PENDING"}, {"_id": 0}).to_list(100)
    
    return [DispositionRequest(**d) for d in dispositions]

@api_router.post("/disposition-queue/generate")
async def generate_disposition_requests(user: Dict = Depends(require_permission("records:manage"))):
    """Generate disposition requests for records past retention"""
    now = datetime.now(timezone.utc)
    
    # Find records with retention schedules
    records = await db.documents.find({
        "is_record": True,
        "deleted": False,
        "retention_schedule_id": {"$ne": None}
    }, {"_id": 0}).to_list(1000)
    
    created = 0
    for record in records:
        # Check if already has pending disposition
        existing = await db.disposition_requests.find_one({
            "document_id": record["id"],
            "status": {"$in": ["PENDING", "APPROVED"]}
        })
        if existing:
            continue
        
        schedule = await db.retention_schedules.find_one({"id": record["retention_schedule_id"]}, {"_id": 0})
        if not schedule:
            continue
        
        # Calculate if past retention
        declared_at = datetime.fromisoformat(record["record_declared_at"].replace('Z', '+00:00'))
        retention_end = declared_at + timedelta(days=schedule["retention_period_days"])
        
        if now >= retention_end:
            disp_id = str(uuid.uuid4())
            disposition = {
                "id": disp_id,
                "document_id": record["id"],
                "document_title": record["title"],
                "retention_schedule_id": record["retention_schedule_id"],
                "scheduled_date": retention_end.isoformat(),
                "disposition_action": schedule["disposition_action"],
                "status": "PENDING",
                "requested_at": now.isoformat(),
                "approved_by": None,
                "approved_at": None
            }
            await db.disposition_requests.insert_one(disposition)
            created += 1
    
    return {"message": f"Generated {created} disposition requests"}

@api_router.post("/disposition-queue/{disp_id}/approve")
async def approve_disposition(disp_id: str, user: Dict = Depends(require_permission("records:manage"))):
    disposition = await db.disposition_requests.find_one({"id": disp_id})
    if not disposition:
        raise HTTPException(status_code=404, detail="Disposition request not found")
    
    if disposition["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Disposition is not pending")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.disposition_requests.update_one(
        {"id": disp_id},
        {"$set": {"status": "APPROVED", "approved_by": user["id"], "approved_at": now}}
    )
    
    await create_audit_event(
        actor=user,
        action="DISPOSITION_APPROVED",
        resource_type="disposition",
        resource_id=disp_id,
        permission_used="records:manage"
    )
    
    return {"message": "Disposition approved"}

@api_router.post("/disposition-queue/{disp_id}/reject")
async def reject_disposition(disp_id: str, user: Dict = Depends(require_permission("records:manage"))):
    disposition = await db.disposition_requests.find_one({"id": disp_id})
    if not disposition:
        raise HTTPException(status_code=404, detail="Disposition request not found")
    
    await db.disposition_requests.update_one(
        {"id": disp_id},
        {"$set": {"status": "REJECTED"}}
    )
    
    await create_audit_event(
        actor=user,
        action="DISPOSITION_REJECTED",
        resource_type="disposition",
        resource_id=disp_id,
        permission_used="records:manage"
    )
    
    return {"message": "Disposition rejected"}

@api_router.post("/disposition-queue/{disp_id}/execute")
async def execute_disposition(disp_id: str, user: Dict = Depends(require_permission("records:manage"))):
    disposition = await db.disposition_requests.find_one({"id": disp_id})
    if not disposition:
        raise HTTPException(status_code=404, detail="Disposition request not found")
    
    if disposition["status"] != "APPROVED":
        raise HTTPException(status_code=400, detail="Disposition must be approved first")
    
    # Check for legal hold
    document = await db.documents.find_one({"id": disposition["document_id"]})
    if document and document.get("legal_hold"):
        raise HTTPException(status_code=400, detail="Document is under legal hold")
    
    # Execute based on action
    if disposition["disposition_action"] == "DESTROY":
        await db.documents.update_one(
            {"id": disposition["document_id"]},
            {"$set": {"deleted": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    # ARCHIVE and TRANSFER would have additional logic
    
    await db.disposition_requests.update_one(
        {"id": disp_id},
        {"$set": {"status": "EXECUTED"}}
    )
    
    await create_audit_event(
        actor=user,
        action="DISPOSITION_EXECUTED",
        resource_type="disposition",
        resource_id=disp_id,
        permission_used="records:manage",
        after_state={"action": disposition["disposition_action"]}
    )
    
    return {"message": "Disposition executed"}

# ==================== AUDIT ROUTES ====================

@api_router.get("/audit", response_model=List[AuditEvent])
async def get_audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: Dict = Depends(require_permission("audit:read"))
):
    query = {}
    if action:
        query["action"] = action
    if resource_type:
        query["resource_type"] = resource_type
    if actor_id:
        query["actor_id"] = actor_id
    if start_date:
        query["timestamp"] = {"$gte": start_date}
    if end_date:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = end_date
        else:
            query["timestamp"] = {"$lte": end_date}
    
    skip = (page - 1) * page_size
    events = await db.audit_events.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(page_size).to_list(page_size)
    
    return [AuditEvent(**e) for e in events]

@api_router.get("/audit/actions")
async def get_audit_actions(user: Dict = Depends(require_permission("audit:read"))):
    actions = await db.audit_events.distinct("action")
    return actions

@api_router.get("/audit/resource-types")
async def get_audit_resource_types(user: Dict = Depends(require_permission("audit:read"))):
    types = await db.audit_events.distinct("resource_type")
    return types

# ==================== DASHBOARD STATS ====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: Dict = Depends(get_current_user)):
    total_docs = await db.documents.count_documents({"deleted": False})
    total_records = await db.documents.count_documents({"deleted": False, "is_record": True})
    legal_holds = await db.documents.count_documents({"deleted": False, "legal_hold": True})
    pending_dispositions = await db.disposition_requests.count_documents({"status": "PENDING"})
    
    return {
        "total_documents": total_docs,
        "total_records": total_records,
        "legal_holds": legal_holds,
        "pending_dispositions": pending_dispositions
    }

# ==================== ROOT & HEALTH ====================

@api_router.get("/")
async def root():
    return {"message": "Document Management System API", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== STARTUP: SEED DATA ====================

@app.on_event("startup")
async def startup_event():
    # Create text indexes
    await db.document_search.create_index([
        ("title", "text"),
        ("description", "text"),
        ("extracted_text", "text"),
        ("tags", "text")
    ])
    
    # Seed default roles
    roles = [
        {"id": "role-admin", "name": "admin", "description": "Full system access", "permissions": ["*"], "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "role-records-manager", "name": "records_manager", "description": "Manage records and retention", "permissions": ["documents:read", "documents:write", "records:manage", "retention:manage"], "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "role-auditor", "name": "auditor", "description": "View audit logs", "permissions": ["documents:read", "audit:read"], "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "role-user", "name": "user", "description": "Standard user", "permissions": ["documents:read", "documents:write"], "created_at": datetime.now(timezone.utc).isoformat()}
    ]
    for role in roles:
        existing = await db.roles.find_one({"name": role["name"]})
        if not existing:
            await db.roles.insert_one(role)
    
    # Seed admin user
    admin_email = "admin@paperless.com"
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_password = bcrypt.hashpw("admin123".encode(), bcrypt.gensalt()).decode()
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "full_name": "System Administrator",
            "password_hash": admin_password,
            "is_active": True,
            "roles": ["admin"],
            "groups": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        logger.info(f"Created admin user: {admin_email} / admin123")
    
    # Seed default retention schedules
    schedules = [
        {"id": "rs-1year", "name": "1 Year Retention", "description": "Destroy after 1 year", "retention_period_days": 365, "disposition_action": "DESTROY", "created_at": datetime.now(timezone.utc).isoformat(), "created_by": "system"},
        {"id": "rs-3year", "name": "3 Year Retention", "description": "Archive after 3 years", "retention_period_days": 1095, "disposition_action": "ARCHIVE", "created_at": datetime.now(timezone.utc).isoformat(), "created_by": "system"},
        {"id": "rs-7year", "name": "7 Year Retention", "description": "Destroy after 7 years (regulatory)", "retention_period_days": 2555, "disposition_action": "DESTROY", "created_at": datetime.now(timezone.utc).isoformat(), "created_by": "system"}
    ]
    for schedule in schedules:
        existing = await db.retention_schedules.find_one({"id": schedule["id"]})
        if not existing:
            await db.retention_schedules.insert_one(schedule)
    
    logger.info("DMS startup complete. Indexes and seed data created.")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
