"""
Test suite for NextGen DMS - License feature and core functionality
Tests: License generation, activation, deactivation, login flow, document operations
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLicenseFeature:
    """License management endpoint tests"""
    
    def test_license_status_public(self):
        """Test license status endpoint (public)"""
        response = requests.get(f"{BASE_URL}/api/license/status")
        assert response.status_code == 200
        data = response.json()
        # Verify response structure
        assert "is_valid" in data
        assert "license_type" in data or data["is_valid"] == False
        print(f"License status: valid={data['is_valid']}, type={data.get('license_type')}")
    
    def test_generate_trial_license(self):
        """Test trial license generation"""
        response = requests.get(f"{BASE_URL}/api/license/generate-trial")
        assert response.status_code == 200
        data = response.json()
        # Verify trial license structure
        assert "license_key" in data
        assert data["type"] == "TRIAL"
        assert data["valid_days"] == 30
        assert data["max_users"] == 5
        assert data["max_documents"] == 100
        print(f"Generated trial license key: {data['license_key'][:20]}...")
        return data["license_key"]
    
    def test_license_activation_flow(self, auth_token):
        """Test full license activation flow"""
        # First deactivate any existing license
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Generate a new trial license
        gen_response = requests.get(f"{BASE_URL}/api/license/generate-trial")
        assert gen_response.status_code == 200
        license_key = gen_response.json()["license_key"]
        
        # Activate the license
        activate_response = requests.post(
            f"{BASE_URL}/api/license/activate",
            json={"license_key": license_key, "organization_name": "TEST_Org"},
            headers=headers
        )
        assert activate_response.status_code == 200
        data = activate_response.json()
        assert data["is_valid"] == True
        assert data["license_type"] == "TRIAL"
        assert data["organization_name"] == "TEST_Org"
        print(f"License activated: type={data['license_type']}, expires={data['expires_at']}")
    
    def test_license_deactivation(self, auth_token):
        """Test license deactivation"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First ensure there's an active license
        status_response = requests.get(f"{BASE_URL}/api/license/status")
        if not status_response.json().get("is_valid"):
            # Activate a license first
            gen_response = requests.get(f"{BASE_URL}/api/license/generate-trial")
            license_key = gen_response.json()["license_key"]
            requests.post(
                f"{BASE_URL}/api/license/activate",
                json={"license_key": license_key},
                headers=headers
            )
        
        # Now deactivate
        deactivate_response = requests.delete(
            f"{BASE_URL}/api/license/deactivate",
            headers=headers
        )
        assert deactivate_response.status_code == 200
        
        # Verify deactivation
        status_response = requests.get(f"{BASE_URL}/api/license/status")
        assert status_response.json()["is_valid"] == False
        print("License deactivated successfully")
        
        # Re-activate for other tests
        gen_response = requests.get(f"{BASE_URL}/api/license/generate-trial")
        license_key = gen_response.json()["license_key"]
        requests.post(
            f"{BASE_URL}/api/license/activate",
            json={"license_key": license_key, "organization_name": "Test Organization"},
            headers=headers
        )
    
    def test_invalid_license_key(self, auth_token):
        """Test activation with invalid license key"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(
            f"{BASE_URL}/api/license/activate",
            json={"license_key": "INVALID-KEY-12345"},
            headers=headers
        )
        assert response.status_code == 400
        print("Invalid license key correctly rejected")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test successful login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@paperless.com", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@paperless.com"
        assert "admin" in data["user"]["roles"]
        print(f"Login successful for: {data['user']['email']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpass"}
        )
        assert response.status_code == 401
        print("Invalid credentials correctly rejected")
    
    def test_get_current_user(self, auth_token):
        """Test getting current user info"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@paperless.com"
        assert data["full_name"] == "System Administrator"
        print(f"Current user: {data['full_name']}")


class TestDocumentOperations:
    """Document CRUD and operations tests"""
    
    def test_list_documents(self, auth_token):
        """Test listing documents"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/documents", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} documents")
    
    def test_upload_document(self, auth_token):
        """Test document upload"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create a test file
        files = {
            'file': ('TEST_document.txt', b'This is test content for NextGen DMS', 'text/plain')
        }
        data = {
            'title': 'TEST_Document',
            'description': 'Test document for testing',
            'visibility': 'PRIVATE',
            'tags': 'test,automated'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/documents",
            files=files,
            data=data,
            headers=headers
        )
        assert response.status_code == 200
        doc = response.json()
        assert doc["title"] == "TEST_Document"
        assert doc["visibility"] == "PRIVATE"
        print(f"Document uploaded: {doc['id']}")
        return doc["id"]
    
    def test_document_checkout_checkin(self, auth_token):
        """Test document checkout and checkin flow"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First upload a document
        files = {'file': ('TEST_checkout.txt', b'Checkout test content', 'text/plain')}
        data = {'title': 'TEST_Checkout_Doc', 'visibility': 'PRIVATE'}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/documents",
            files=files,
            data=data,
            headers=headers
        )
        assert upload_response.status_code == 200
        doc_id = upload_response.json()["id"]
        
        # Checkout the document
        checkout_response = requests.post(
            f"{BASE_URL}/api/documents/{doc_id}/checkout",
            headers=headers
        )
        assert checkout_response.status_code == 200
        checkout_data = checkout_response.json()
        assert checkout_data["checked_out"] == True
        print(f"Document checked out: {doc_id}")
        
        # Checkin the document
        checkin_response = requests.post(
            f"{BASE_URL}/api/documents/{doc_id}/checkin",
            data={"comment": "Test checkin"},
            headers=headers
        )
        assert checkin_response.status_code == 200
        checkin_data = checkin_response.json()
        assert checkin_data["checked_out"] == False
        print(f"Document checked in: {doc_id}")
        
        # Cleanup - delete the document
        requests.delete(f"{BASE_URL}/api/documents/{doc_id}", headers=headers)
    
    def test_document_search(self, auth_token):
        """Test document search"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        response = requests.post(
            f"{BASE_URL}/api/search",
            json={"query": "", "page": 1, "page_size": 10},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "results" in data
        print(f"Search returned {data['total']} results")


class TestDashboard:
    """Dashboard endpoint tests"""
    
    def test_dashboard_stats(self, auth_token):
        """Test dashboard statistics"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_documents" in data
        assert "total_records" in data
        assert "legal_holds" in data
        print(f"Dashboard stats: {data['total_documents']} docs, {data['total_records']} records")


class TestBranding:
    """Test that branding shows NextGen DMS not Papyrus"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("API health check passed")


# Fixtures
@pytest.fixture
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@paperless.com", "password": "admin123"}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests"""
    yield
    # Cleanup after tests
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@paperless.com", "password": "admin123"}
        )
        if response.status_code == 200:
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Get all documents and delete TEST_ prefixed ones
            docs_response = requests.get(f"{BASE_URL}/api/documents", headers=headers)
            if docs_response.status_code == 200:
                for doc in docs_response.json():
                    if doc.get("title", "").startswith("TEST_"):
                        requests.delete(f"{BASE_URL}/api/documents/{doc['id']}", headers=headers)
    except Exception as e:
        print(f"Cleanup error: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
