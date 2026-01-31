import requests
import sys
import json
import io
from datetime import datetime

class DMSAPITester:
    def __init__(self, base_url="https://paperview-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_document_id = None
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        if files:
            # Remove Content-Type for multipart/form-data
            headers.pop('Content-Type', None)

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                if files:
                    response = requests.post(url, headers=headers, data=data, files=files)
                else:
                    response = requests.post(url, json=data, headers=headers, params=params)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, params=params)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, params=params)

            success = response.status_code == expected_status
            if success:
                try:
                    response_data = response.json() if response.content else {}
                except:
                    response_data = {}
                self.log_test(name, True)
                return True, response_data
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail = response.json().get('detail', '')
                    if error_detail:
                        error_msg += f" - {error_detail}"
                except:
                    pass
                self.log_test(name, False, error_msg)
                return False, {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test basic health endpoint"""
        return self.run_test("Health Check", "GET", "health", 200)

    def test_login(self, email="admin@paperless.com", password="admin123"):
        """Test login and store token"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user = response.get('user', {})
            return True
        return False

    def test_get_me(self):
        """Test get current user info"""
        return self.run_test("Get Current User", "GET", "auth/me", 200)

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        return self.run_test("Dashboard Stats", "GET", "dashboard/stats", 200)

    def test_list_documents(self):
        """Test document listing"""
        return self.run_test("List Documents", "GET", "documents", 200)

    def test_upload_document(self):
        """Test document upload"""
        # Create a test file
        test_content = "This is a test document for DMS testing.\nIt contains multiple lines.\nFor text extraction testing."
        test_file = io.BytesIO(test_content.encode())
        
        files = {'file': ('test_document.txt', test_file, 'text/plain')}
        data = {
            'title': 'Test Document for API Testing',
            'description': 'This is a test document uploaded via API testing',
            'visibility': 'PRIVATE',
            'tags': 'test,api,automation'
        }
        
        success, response = self.run_test(
            "Upload Document",
            "POST",
            "documents",
            200,
            data=data,
            files=files
        )
        
        if success and 'id' in response:
            self.test_document_id = response['id']
            return True
        return False

    def test_get_document_detail(self):
        """Test getting document details"""
        if not self.test_document_id:
            self.log_test("Get Document Detail", False, "No test document ID available")
            return False
        
        return self.run_test(
            "Get Document Detail",
            "GET",
            f"documents/{self.test_document_id}",
            200
        )

    def test_download_document(self):
        """Test document download"""
        if not self.test_document_id:
            self.log_test("Download Document", False, "No test document ID available")
            return False
        
        url = f"{self.api_url}/documents/{self.test_document_id}/download"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        try:
            response = requests.get(url, headers=headers)
            success = response.status_code == 200
            if success:
                self.log_test("Download Document", True)
                return True
            else:
                self.log_test("Download Document", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Download Document", False, f"Exception: {str(e)}")
            return False

    def test_upload_document_version(self):
        """Test uploading a new version of document"""
        if not self.test_document_id:
            self.log_test("Upload Document Version", False, "No test document ID available")
            return False
        
        # Create a new version file
        test_content = "This is version 2 of the test document.\nUpdated content for versioning test."
        test_file = io.BytesIO(test_content.encode())
        
        files = {'file': ('test_document_v2.txt', test_file, 'text/plain')}
        
        return self.run_test(
            "Upload Document Version",
            "POST",
            f"documents/{self.test_document_id}/versions",
            200,
            files=files
        )

    def test_declare_record(self):
        """Test declaring document as record"""
        if not self.test_document_id:
            self.log_test("Declare Record", False, "No test document ID available")
            return False
        
        return self.run_test(
            "Declare Record",
            "POST",
            f"documents/{self.test_document_id}/declare-record",
            200
        )

    def test_apply_legal_hold(self):
        """Test applying legal hold"""
        if not self.test_document_id:
            self.log_test("Apply Legal Hold", False, "No test document ID available")
            return False
        
        return self.run_test(
            "Apply Legal Hold",
            "POST",
            f"documents/{self.test_document_id}/legal-hold",
            200,
            params={"reason": "Test legal hold for API testing"}
        )

    def test_release_legal_hold(self):
        """Test releasing legal hold"""
        if not self.test_document_id:
            self.log_test("Release Legal Hold", False, "No test document ID available")
            return False
        
        return self.run_test(
            "Release Legal Hold",
            "DELETE",
            f"documents/{self.test_document_id}/legal-hold",
            200
        )

    def test_search_documents(self):
        """Test document search"""
        return self.run_test(
            "Search Documents",
            "POST",
            "search",
            200,
            data={
                "query": "test",
                "page": 1,
                "page_size": 10
            }
        )

    def test_list_users(self):
        """Test listing users (admin only)"""
        return self.run_test("List Users", "GET", "users", 200)

    def test_list_roles(self):
        """Test listing roles"""
        return self.run_test("List Roles", "GET", "roles", 200)

    def test_list_groups(self):
        """Test listing groups"""
        return self.run_test("List Groups", "GET", "groups", 200)

    def test_retention_schedules(self):
        """Test retention schedules"""
        return self.run_test("List Retention Schedules", "GET", "retention-schedules", 200)

    def test_audit_events(self):
        """Test audit events"""
        return self.run_test("List Audit Events", "GET", "audit", 200)

    def test_disposition_queue(self):
        """Test disposition queue"""
        return self.run_test("Get Disposition Queue", "GET", "disposition-queue", 200)

    # NEW FEATURE TESTS - Added for 4 new features

    def test_bulk_upload(self):
        """Test bulk document upload"""
        # Create multiple test files
        test_files = []
        for i in range(3):
            content = f"This is test document {i+1} for bulk upload testing.\nContent for document {i+1}."
            test_file = io.BytesIO(content.encode())
            test_files.append(('files', (f'bulk_test_{i+1}.txt', test_file, 'text/plain')))
        
        data = {
            'visibility': 'PRIVATE',
            'tags': 'bulk,test,automation'
        }
        
        success, response = self.run_test(
            "Bulk Upload Documents",
            "POST",
            "documents/bulk",
            200,
            data=data,
            files=test_files
        )
        
        if success and 'successful' in response:
            print(f"   📦 Bulk upload: {response.get('successful', 0)} successful, {response.get('failed', 0)} failed")
            return True
        return False

    def test_enhanced_search_with_date_filters(self):
        """Test enhanced search with date range and sorting"""
        # Test search with date filters
        search_data = {
            "query": "test",
            "page": 1,
            "page_size": 10,
            "date_from": "2024-01-01",
            "date_to": "2025-12-31",
            "sort_by": "created_at",
            "sort_order": "desc"
        }
        
        success, response = self.run_test(
            "Enhanced Search with Date Filters",
            "POST",
            "search",
            200,
            data=search_data
        )
        
        if success:
            print(f"   🔍 Search returned {response.get('total', 0)} results")
            return True
        return False

    def test_enhanced_search_with_file_types(self):
        """Test enhanced search with file type filters"""
        search_data = {
            "query": "",
            "page": 1,
            "page_size": 10,
            "file_types": ["txt", "pdf"],
            "sort_by": "title",
            "sort_order": "asc"
        }
        
        return self.run_test(
            "Enhanced Search with File Type Filters",
            "POST",
            "search",
            200,
            data=search_data
        )

    def test_document_preview(self):
        """Test document preview endpoint"""
        if not self.test_document_id:
            self.log_test("Document Preview", False, "No test document ID available")
            return False
        
        url = f"{self.api_url}/documents/{self.test_document_id}/preview"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        try:
            response = requests.get(url, headers=headers)
            success = response.status_code == 200
            if success:
                content_type = response.headers.get('content-type', '')
                print(f"   👁️ Preview content type: {content_type}")
                self.log_test("Document Preview", True)
                return True
            else:
                self.log_test("Document Preview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Document Preview", False, f"Exception: {str(e)}")
            return False

    def test_notifications_endpoints(self):
        """Test notification system endpoints"""
        # Test get notifications
        success1, _ = self.run_test(
            "Get Notifications",
            "GET",
            "notifications",
            200
        )
        
        # Test check deadlines endpoint
        success2, _ = self.run_test(
            "Check Disposition Deadlines",
            "POST",
            "notifications/check-deadlines",
            200
        )
        
        # Test notification settings
        success3, _ = self.run_test(
            "Get Notification Settings",
            "GET",
            "notifications/settings",
            200
        )
        
        return success1 and success2 and success3

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting DMS API Testing...")
        print(f"📍 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Basic connectivity
        self.test_health_check()
        
        # Authentication
        if not self.test_login():
            print("❌ Login failed, stopping tests")
            return False
        
        self.test_get_me()
        
        # Dashboard
        self.test_dashboard_stats()
        
        # Document operations
        self.test_list_documents()
        
        if self.test_upload_document():
            self.test_get_document_detail()
            self.test_download_document()
            self.test_upload_document_version()
            
            # Records management (only if document was created)
            self.test_apply_legal_hold()
            self.test_release_legal_hold()
            self.test_declare_record()
        
        # Search
        self.test_search_documents()
        
        # Admin functions
        self.test_list_users()
        self.test_list_roles()
        self.test_list_groups()
        self.test_retention_schedules()
        self.test_audit_events()
        self.test_disposition_queue()
        
        # NEW FEATURE TESTS
        print("\n🆕 Testing New Features...")
        self.test_bulk_upload()
        self.test_enhanced_search_with_date_filters()
        self.test_enhanced_search_with_file_types()
        
        if self.test_document_id:
            self.test_document_preview()
        
        self.test_notifications_endpoints()
        
        # Print summary
        print("=" * 60)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success rate: {success_rate:.1f}%")
        
        if self.test_document_id:
            print(f"📄 Test document created: {self.test_document_id}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = DMSAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/test_reports/backend_test_results.json', 'w') as f:
        json.dump({
            'summary': {
                'total_tests': tester.tests_run,
                'passed_tests': tester.tests_passed,
                'success_rate': (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0,
                'test_document_id': tester.test_document_id
            },
            'results': tester.test_results,
            'timestamp': datetime.now().isoformat()
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())