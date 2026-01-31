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

# ==================== MODELS ====================

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    
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
        "ENTERPRISE": {"users": 1000, "docs": 1000000}
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
