import { createContext, useContext, useState, useEffect, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";

// Pages
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentsPage from "./pages/DocumentsPage";
import DocumentDetailPage from "./pages/DocumentDetailPage";
import UploadPage from "./pages/UploadPage";
import RecordsPage from "./pages/RecordsPage";
import LegalHoldsPage from "./pages/LegalHoldsPage";
import DispositionPage from "./pages/DispositionPage";
import AuditPage from "./pages/AuditPage";
import AdminPage from "./pages/AdminPage";
import LicensePage from "./pages/LicensePage";
import DashboardLayout from "./components/DashboardLayout";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("dms_token"));
  const [loading, setLoading] = useState(true);
  const [license, setLicense] = useState(null);

  const fetchLicense = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/license/status`);
      setLicense(response.data);
    } catch (error) {
      console.error("Failed to fetch license status");
    }
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      localStorage.setItem("dms_token", access_token);
      setToken(access_token);
      setUser(userData);
      fetchLicense();
      toast.success("Login successful");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
      return false;
    }
  }, [fetchLicense]);

  const register = useCallback(async (email, password, fullName) => {
    try {
      await axios.post(`${API}/auth/register`, { 
        email, 
        password, 
        full_name: fullName 
      });
      toast.success("Registration successful. Please login.");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed");
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("dms_token");
    setToken(null);
    setUser(null);
    setLicense(null);
    toast.info("Logged out");
  }, []);

  const hasRole = useCallback((role) => {
    if (!user) return false;
    return user.roles?.includes(role) || user.roles?.includes("admin");
  }, [user]);

  const hasPermission = useCallback((permission) => {
    if (!user) return false;
    if (user.roles?.includes("admin")) return true;
    
    const rolePermissions = {
      records_manager: ["documents:read", "documents:write", "records:manage", "retention:manage"],
      auditor: ["documents:read", "audit:read"],
      user: ["documents:read", "documents:write"]
    };
    
    for (const role of user.roles || []) {
      const perms = rolePermissions[role] || [];
      if (perms.includes(permission)) return true;
    }
    return false;
  }, [user]);

  const isLicensed = useCallback(() => {
    return license?.is_valid === true;
  }, [license]);

  useEffect(() => {
    fetchLicense();
  }, [fetchLicense]);

  useEffect(() => {
    const fetchUser = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
        } catch (error) {
          localStorage.removeItem("dms_token");
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, hasRole, hasPermission, license, isLicensed, fetchLicense }}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route
const ProtectedRoute = ({ children, requiredPermission, skipLicenseCheck = false }) => {
  const { user, loading, hasPermission, isLicensed } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check license status (skip for license page itself)
  if (!skipLicenseCheck && !isLicensed()) {
    return <Navigate to="/license" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <h2 className="text-2xl font-heading font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </DashboardLayout>
    );
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/license" element={
            <ProtectedRoute skipLicenseCheck={true}>
              <DashboardLayout><LicensePage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/" element={
            <ProtectedRoute>
              <DashboardLayout><DashboardPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/documents" element={
            <ProtectedRoute requiredPermission="documents:read">
              <DashboardLayout><DocumentsPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/documents/:id" element={
            <ProtectedRoute requiredPermission="documents:read">
              <DashboardLayout><DocumentDetailPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/upload" element={
            <ProtectedRoute requiredPermission="documents:write">
              <DashboardLayout><UploadPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/records" element={
            <ProtectedRoute requiredPermission="records:manage">
              <DashboardLayout><RecordsPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/legal-holds" element={
            <ProtectedRoute requiredPermission="records:manage">
              <DashboardLayout><LegalHoldsPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/disposition" element={
            <ProtectedRoute requiredPermission="records:manage">
              <DashboardLayout><DispositionPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/audit" element={
            <ProtectedRoute requiredPermission="audit:read">
              <DashboardLayout><AuditPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requiredPermission="admin">
              <DashboardLayout><AdminPage /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
