# NextGen DMS - Document Management System

A comprehensive Document Management System (DMS) and Records Management System (RMS) built with FastAPI, React, and MongoDB.

## Features

### Core Features
- **Document Management**: Upload, download, and organize documents with version control
- **Records Management**: Declare documents as official records with retention schedules
- **Legal Holds**: Apply legal holds to prevent modification or deletion of documents
- **Disposition Workflow**: Automated disposition queue based on retention schedules
- **Audit Logging**: Comprehensive audit trail for all system activities
- **License Management**: Activate and manage application licenses

### Advanced Features
- **PDF Preview**: View PDF documents directly in the browser
- **Bulk Upload**: Upload multiple documents at once
- **Folder Upload**: Upload entire folder structures while preserving hierarchy
- **Enhanced Search**: Full-text search with date range, file type, and sorting filters
- **Document Checkout**: Lock documents for exclusive editing with check-in/check-out
- **View Tracking**: Track document views and access history

## Tech Stack

- **Backend**: FastAPI (Python 3.10+)
- **Frontend**: React 18 with Shadcn/UI components
- **Database**: MongoDB
- **Authentication**: JWT-based authentication
- **File Storage**: Local filesystem

## Prerequisites

Before installation, ensure you have the following installed:

- **Python 3.10+**: [Download Python](https://www.python.org/downloads/)
- **Node.js 18+**: [Download Node.js](https://nodejs.org/)
- **MongoDB 5.0+**: [Download MongoDB](https://www.mongodb.com/try/download/community)
- **Yarn** (recommended): `npm install -g yarn`

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd nextgen-dms
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your settings
```

**Backend Environment Variables (.env):**
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=nextgen_dms
JWT_SECRET=your-secret-key-change-in-production

# Optional: Email notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-password
SMTP_FROM=noreply@example.com
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install

# Configure environment variables
cp .env.example .env
# Edit .env with your settings
```

**Frontend Environment Variables (.env):**
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 4. Start MongoDB

```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:5.0

# Or start local MongoDB service
mongod --dbpath /path/to/data
```

### 5. Start the Application

**Start Backend:**
```bash
cd backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Start Frontend:**
```bash
cd frontend
yarn start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8001
- API Documentation: http://localhost:8001/docs

## Default Credentials

After first startup, the system creates a default admin account:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@paperless.com | admin123 |

**Important:** Change the default password immediately after first login.

## License Activation

NextGen DMS requires a license to operate. After logging in for the first time:

1. Navigate to the License page (automatically redirected if no license)
2. Click "Generate Trial License" for a 30-day evaluation
3. Copy the generated license key
4. Click "Activate License" and paste the key
5. The application is now ready to use

### License Tiers

| Tier | Users | Documents | Features |
|------|-------|-----------|----------|
| Trial | 5 | 100 | Basic features |
| Standard | 25 | 10,000 | Records & Audit |
| Enterprise | Unlimited | Unlimited | All features + SSO |

## API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Document Endpoints
- `POST /api/documents` - Upload single document
- `POST /api/documents/bulk` - Bulk upload documents
- `POST /api/documents/folder` - Upload folder structure
- `GET /api/documents` - List documents
- `GET /api/documents/{id}` - Get document details
- `GET /api/documents/{id}/download` - Download document
- `GET /api/documents/{id}/preview` - Preview document
- `POST /api/documents/{id}/versions` - Upload new version
- `DELETE /api/documents/{id}` - Delete document

### Checkout Endpoints
- `POST /api/documents/{id}/checkout` - Check out document
- `POST /api/documents/{id}/checkin` - Check in document
- `DELETE /api/documents/{id}/checkout` - Cancel checkout
- `GET /api/documents/checked-out/me` - Get my checkouts

### Search Endpoint
- `POST /api/search` - Search documents with filters

### Records Management
- `POST /api/documents/{id}/declare-record` - Declare as record
- `POST /api/documents/{id}/legal-hold` - Apply legal hold
- `DELETE /api/documents/{id}/legal-hold` - Release legal hold
- `GET /api/retention-schedules` - List retention schedules
- `PUT /api/documents/{id}/retention-schedule` - Assign schedule

### Disposition
- `GET /api/disposition-queue` - Get disposition queue
- `POST /api/disposition-queue/generate` - Generate queue
- `POST /api/disposition-queue/{id}/approve` - Approve disposition
- `POST /api/disposition-queue/{id}/execute` - Execute disposition

### License Endpoints
- `GET /api/license/status` - Get license status
- `POST /api/license/activate` - Activate license
- `DELETE /api/license/deactivate` - Deactivate license
- `GET /api/license/generate-trial` - Generate trial license

### Audit Endpoints
- `GET /api/audit` - Get audit log
- `GET /api/audit/actions` - Get audit actions
- `GET /api/audit/resource-types` - Get resource types

## User Roles

| Role | Permissions |
|------|-------------|
| Admin | Full system access |
| Records Manager | Declare records, manage retention, apply legal holds |
| Auditor | View audit logs, read-only document access |
| User | Upload/view/download documents |

## Project Structure

```
/app
├── backend/
│   ├── .env                 # Backend environment variables
│   ├── requirements.txt     # Python dependencies
│   ├── server.py            # FastAPI application
│   └── uploads/             # Document storage
├── frontend/
│   ├── .env                 # Frontend environment variables
│   ├── package.json         # Node.js dependencies
│   ├── public/              # Static assets
│   └── src/
│       ├── App.js           # Main React application
│       ├── components/      # Reusable components
│       │   ├── ui/          # Shadcn UI components
│       │   └── DashboardLayout.jsx
│       └── pages/           # Page components
│           ├── LoginPage.jsx
│           ├── DashboardPage.jsx
│           ├── DocumentsPage.jsx
│           ├── UploadPage.jsx
│           ├── LicensePage.jsx
│           └── ...
└── memory/
    └── PRD.md               # Product Requirements Document
```

## Security Considerations

1. **Change Default Credentials**: Update admin password immediately
2. **JWT Secret**: Use a strong, unique JWT_SECRET in production
3. **HTTPS**: Deploy behind a reverse proxy with SSL/TLS
4. **Database Security**: Secure MongoDB with authentication
5. **File Uploads**: Uploaded files are stored locally; consider S3 for production

## Troubleshooting

### MongoDB Connection Issues
```bash
# Check MongoDB is running
mongosh --eval "db.runCommand('ping')"

# Verify connection string in backend/.env
MONGO_URL=mongodb://localhost:27017
```

### Frontend Build Issues
```bash
# Clear cache and reinstall
rm -rf node_modules yarn.lock
yarn install
```

### License Activation Fails
- Ensure the license key is copied completely (including all segments)
- Check the backend logs for specific error messages
- Try generating a new trial license

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. Contact the vendor for licensing options.

## Support

For support inquiries, please contact the development team or raise an issue in the repository.
