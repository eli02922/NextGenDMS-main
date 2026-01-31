# NextGen DMS - Document Management System (DMS) + Records Management System (RMS)

## Original Problem Statement
Build a Document Management System (DMS) + Records Management System (RMS) with:
- Document upload/versioning
- RBAC (users/groups/roles/permissions)
- Text extraction from PDFs/docs
- Full-text search
- Records management (declare record, retention schedules, legal holds, disposition workflow)
- Comprehensive audit logging

## Architecture
**Stack:** FastAPI + React + MongoDB (Streamlined Monolith)
- **Backend:** FastAPI with JWT authentication, RBAC middleware
- **Frontend:** React with Shadcn UI components
- **Database:** MongoDB with text indexes for search
- **Storage:** Local file system for documents
- **Text Extraction:** PyPDF2 + python-docx

## User Personas
1. **Admin:** Full system access, user management, license activation
2. **Records Manager:** Declare records, manage retention, apply legal holds
3. **Auditor:** View audit logs, read-only document access
4. **User:** Upload/view/download documents

## Core Requirements (All Implemented)
- [x] User authentication (JWT)
- [x] Role-based access control (4 roles)
- [x] Document upload with metadata
- [x] Document versioning
- [x] Text extraction (PDF, DOCX, TXT)
- [x] Full-text search with filters
- [x] Records declaration
- [x] Retention schedules (3 default schedules)
- [x] Legal holds (apply/release)
- [x] Disposition workflow
- [x] Audit logging (append-only)
- [x] Dashboard with stats
- [x] Admin panel (users/groups/roles)

## Phase 2 Features (Added 2025-01-25)
- [x] PDF/Image Document Preview (inline and fullscreen modal)
- [x] Bulk Upload (multiple files at once)
- [x] Folder Upload (preserve folder structure)
- [x] Email Notifications for disposition deadlines (notification system + SMTP integration)
- [x] Enhanced Search with date range filters, file type filters, sorting options
- [x] Document View Tracking
- [x] Document Checkout/Check-in with locking

## Phase 3 Features (Added 2026-01-25)
- [x] License Activation System (Trial, Standard, Enterprise tiers)
- [x] Application branding updated to "NextGen DMS"
- [x] Comprehensive README documentation with installation instructions

## What's Been Implemented

### Backend (50+ endpoints)
- Complete FastAPI server with JWT authentication
- Document CRUD with versioning
- Bulk upload endpoint (`POST /api/documents/bulk`)
- Folder upload endpoint (`POST /api/documents/folder`)
- Document preview endpoint (`GET /api/documents/{id}/preview`)
- Document checkout/checkin (`POST /api/documents/{id}/checkout`, `POST /api/documents/{id}/checkin`)
- Document view tracking (`GET /api/documents/{id}/views`)
- Enhanced search with date_from, date_to, file_types, sort_by, sort_order
- Notification system (`/api/notifications/*` endpoints)
- License management (`/api/license/*` endpoints)
- Background task for disposition deadline checking
- Text extraction service
- MongoDB text search indexes
- Records management workflow
- Audit event logging
- Seed data (admin user, roles, retention schedules)

### Frontend (11+ pages)
- Login, Dashboard, Documents, Upload, Detail, Records, Legal Holds, Disposition, Audit, Admin, **License**
- Bulk Upload tab with drag-and-drop multi-file support
- Folder Upload tab
- Advanced Filters panel (date range, file type, sorting)
- Document Preview modal with fullscreen support
- Document Checkout/Check-in UI
- License Management page with trial generation
- NextGen DMS branding throughout
- Responsive layout with sidebar navigation
- Shadcn UI components

## API Endpoints Summary
### Authentication
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me

### Documents
- GET /api/documents
- POST /api/documents (single upload)
- POST /api/documents/bulk (bulk upload)
- POST /api/documents/folder (folder upload)
- GET /api/documents/{id}
- GET /api/documents/{id}/download
- GET /api/documents/{id}/preview
- GET /api/documents/{id}/views
- POST /api/documents/{id}/versions
- DELETE /api/documents/{id}

### Checkout/Check-in
- POST /api/documents/{id}/checkout
- POST /api/documents/{id}/checkin
- DELETE /api/documents/{id}/checkout
- GET /api/documents/checked-out/me

### Search
- POST /api/search (Enhanced with date_from, date_to, file_types, sort_by, sort_order)

### Records Management
- POST /api/documents/{id}/declare-record
- POST /api/documents/{id}/legal-hold
- DELETE /api/documents/{id}/legal-hold
- GET /api/retention-schedules
- PUT /api/documents/{id}/retention-schedule

### Disposition
- GET /api/disposition-queue
- POST /api/disposition-queue/generate
- POST /api/disposition-queue/{id}/approve
- POST /api/disposition-queue/{id}/reject
- POST /api/disposition-queue/{id}/execute

### License
- GET /api/license/status (public)
- POST /api/license/activate
- DELETE /api/license/deactivate
- GET /api/license/generate-trial
- GET /api/license/generate/{type}

### Notifications
- GET /api/notifications
- POST /api/notifications/check-deadlines
- GET /api/notifications/settings
- PUT /api/notifications/settings

### Audit
- GET /api/audit
- GET /api/audit/actions
- GET /api/audit/resource-types

## Default Credentials
- **Admin:** admin@paperless.com / admin123

## Environment Variables
- MONGO_URL (required)
- DB_NAME (required)
- JWT_SECRET (optional, has default)
- LICENSE_SECRET (optional, has default)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM (optional, for email notifications)

## Prioritized Backlog

### P0 (Critical) - All Completed ✅
- Authentication & Authorization
- Document upload/download
- Search functionality
- Audit logging
- Records declaration
- Legal holds
- Disposition queue
- License activation

### P1 (High Priority) - Completed ✅
- PDF Document Preview
- Bulk Upload
- Folder Upload
- Enhanced Search with filters
- Notification System
- Document View Tracking
- Document Checkout/Check-in

### P2 (Medium Priority) - Future
- [ ] OCR for scanned documents (Tesseract integration)
- [ ] Document templates
- [ ] Export reports to PDF
- [ ] API documentation (Swagger UI auto-gen)
- [ ] Email notifications activation with SMTP

### P3 (Nice to Have) - Future
- [ ] Dark mode toggle
- [ ] Workflow automation rules
- [ ] Real-time collaboration
- [ ] Mobile app
- [ ] Checkout expiration (auto-release of locked documents)
- [ ] Checkout reminder notifications

## Next Tasks
1. Configure SMTP settings for live email notifications
2. Add OCR support using Tesseract for scanned PDFs
3. Implement PDF export for audit reports
4. Add document workflow templates
5. Implement checkout expiration feature
