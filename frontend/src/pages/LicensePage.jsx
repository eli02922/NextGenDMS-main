import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { 
  Key, 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  Building,
  Users,
  FileText,
  Calendar,
  Clock,
  Copy,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";

export default function LicensePage() {
  const { token, hasPermission } = useAuth();
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState("");
  const [orgName, setOrgName] = useState("");
  const [activating, setActivating] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [trialKey, setTrialKey] = useState(null);
  const [generatingTrial, setGeneratingTrial] = useState(false);
  const [standardKey, setStandardKey] = useState(null);
  const [generatingStandard, setGeneratingStandard] = useState(false);
  const [enterpriseKey, setEnterpriseKey] = useState(null);
  const [generatingEnterprise, setGeneratingEnterprise] = useState(false);

  const fetchLicenseStatus = async () => {
    try {
      const response = await axios.get(`${API}/license/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLicense(response.data);
    } catch (error) {
      console.error("Failed to fetch license status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
  }, [token]);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toast.error("Please enter a license key");
      return;
    }

    setActivating(true);
    try {
      const response = await axios.post(`${API}/license/activate`, {
        license_key: licenseKey,
        organization_name: orgName || undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setLicense(response.data);
      toast.success("License activated successfully!");
      setShowActivateDialog(false);
      setLicenseKey("");
      setOrgName("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to activate license");
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await axios.delete(`${API}/license/deactivate`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("License deactivated");
      fetchLicenseStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to deactivate license");
    }
  };

  const handleGenerateTrial = async () => {
    setGeneratingTrial(true);
    try {
      const response = await axios.get(`${API}/license/generate-trial`);
      setTrialKey(response.data);
      toast.success("Trial license generated!");
    } catch (error) {
      toast.error("Failed to generate trial license");
    } finally {
      setGeneratingTrial(false);
    }
  };

 const handleGenerateStandard = async () => {
  setGeneratingStandard(true);
  try {
    const response = await axios.get(`${API}/license/generate/STANDARD`, {
      params: {
        org_name: "Your Organization",
        days: 365
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // Transform response to match expected format
    const formattedResponse = {
      license_key: response.data.license_key,
      license_type: response.data.type || "STANDARD",
      expires_at: new Date(Date.now() + response.data.valid_days * 24 * 60 * 60 * 1000).toISOString(),
      max_users: response.data.max_users,
      max_documents: response.data.max_documents,
      organization_name: response.data.organization
    };
    
    setStandardKey(formattedResponse);
    toast.success("Standard license generated!");
  } catch (error) {
    console.error("Error generating standard license:", error);
    toast.error(error.response?.data?.detail || "Failed to generate standard license");
  } finally {
    setGeneratingStandard(false);
  }
};

const handleGenerateEnterprise = async () => {
  setGeneratingEnterprise(true);
  try {
    const response = await axios.get(`${API}/license/generate/ENTERPRISE`, {
      params: {
        org_name: "Your Organization", 
        days: 365
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // Transform response to match expected format
    const formattedResponse = {
      license_key: response.data.license_key,
      license_type: response.data.type || "ENTERPRISE",
      expires_at: new Date(Date.now() + response.data.valid_days * 24 * 60 * 60 * 1000).toISOString(),
      max_users: response.data.max_users,
      max_documents: response.data.max_documents,
      organization_name: response.data.organization
    };
    
    setEnterpriseKey(formattedResponse);
    toast.success("Enterprise license generated!");
  } catch (error) {
    console.error("Error generating enterprise license:", error);
    toast.error(error.response?.data?.detail || "Failed to generate enterprise license");
  } finally {
    setGeneratingEnterprise(false);
  }
};

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getLicenseStatusColor = () => {
    if (!license?.is_valid) return "text-red-600";
    if (license?.days_remaining <= 7) return "text-amber-600";
    return "text-emerald-600";
  };

  const getLicenseStatusIcon = () => {
    if (!license?.is_valid) return <XCircle className="w-6 h-6 text-red-600" />;
    if (license?.days_remaining <= 7) return <AlertTriangle className="w-6 h-6 text-amber-600" />;
    return <CheckCircle className="w-6 h-6 text-emerald-600" />;
  };

  const getLicenseTypeBadge = (type) => {
    const styles = {
      TRIAL: "bg-amber-50 text-amber-700 border-amber-200",
      STANDARD: "bg-blue-50 text-blue-700 border-blue-200",
      ENTERPRISE: "bg-purple-50 text-purple-700 border-purple-200"
    };
    return styles[type] || "bg-gray-50 text-gray-700 border-gray-200";
  };

  // Auto-fill generated license key to activate dialog
  const handleActivateGeneratedLicense = (licenseKey) => {
    setLicenseKey(licenseKey);
    setShowActivateDialog(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">License Management</h1>
          <p className="text-muted-foreground mt-1">Manage your NextGen DMS license</p>
        </div>
        {hasPermission("admin") && (
          <Dialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
            <DialogTrigger asChild>
              <Button className="btn-hover" data-testid="activate-license-btn">
                <Key className="w-4 h-4 mr-2" />
                {license?.is_valid ? "Update License" : "Activate License"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Activate License</DialogTitle>
                <DialogDescription>
                  Enter your license key to activate or update your NextGen DMS license.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>License Key *</Label>
                  <Input
                    placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    className="font-mono"
                    data-testid="license-key-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Organization Name (Optional)</Label>
                  <Input
                    placeholder="Your Company Name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    data-testid="org-name-input"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowActivateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleActivate} disabled={activating} data-testid="confirm-activate">
                  {activating ? "Activating..." : "Activate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* License Status Card */}
      <Card className="border">
        <CardHeader className="flex flex-row items-center gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            license?.is_valid ? "bg-emerald-50" : "bg-red-50"
          }`}>
            {loading ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            ) : (
              getLicenseStatusIcon()
            )}
          </div>
          <div>
            <CardTitle className="text-xl font-heading">
              {loading ? "Checking license..." : license?.is_valid ? "License Active" : "No Active License"}
            </CardTitle>
            <CardDescription className={getLicenseStatusColor()}>
              {license?.is_valid 
                ? `${license.days_remaining} days remaining`
                : "Please activate a license to use all features"
              }
            </CardDescription>
          </div>
          {license?.license_type && (
            <Badge className={`ml-auto ${getLicenseTypeBadge(license.license_type)}`}>
              {license.license_type}
            </Badge>
          )}
        </CardHeader>
        {license?.is_valid && (
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-blue-50 flex items-center justify-center">
                  <Building className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Organization</p>
                  <p className="font-medium">{license.organization_name || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-purple-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Max Users</p>
                  <p className="font-medium">{license.max_users?.toLocaleString() || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-emerald-50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Max Documents</p>
                  <p className="font-medium">{license.max_documents?.toLocaleString() || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-amber-50 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Expires</p>
                  <p className="font-medium">
                    {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* License Features */}
      {license?.is_valid && license?.features?.length > 0 && (
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-lg font-heading">Licensed Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {license.features.map((feature) => (
                <Badge key={feature} variant="outline" className="capitalize">
                  <CheckCircle className="w-3 h-3 mr-1 text-emerald-600" />
                  {feature.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* License Details */}
      {license?.is_valid && (
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-lg font-heading">License Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Activated At</Label>
                <p className="mt-1">{license.activated_at ? new Date(license.activated_at).toLocaleString() : "—"}</p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Activated By</Label>
                <p className="mt-1">{license.activated_by || "—"}</p>
              </div>
            </div>
            {hasPermission("admin") && (
              <div className="pt-4 border-t">
                <Button variant="outline" onClick={handleDeactivate} data-testid="deactivate-btn">
                  Deactivate License
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trial License Generator */}
      {!license?.is_valid && (
        <Card className="border border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              Get a Trial License
            </CardTitle>
            <CardDescription>
              Generate a 30-day trial license to evaluate NextGen DMS
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {trialKey ? (
              <div className="space-y-3">
                <div className="p-4 rounded bg-white border">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your Trial License Key</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 p-2 bg-muted rounded font-mono text-sm break-all">
                      {trialKey.license_key}
                    </code>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(trialKey.license_key)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    {trialKey.valid_days} days
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    {trialKey.max_users} users
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    {trialKey.max_documents} documents
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => copyToClipboard(trialKey.license_key)}
                    variant="outline" 
                    className="flex-1"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Key
                  </Button>
                  <Button 
                    onClick={() => handleActivateGeneratedLicense(trialKey.license_key)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Activate Now
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy this key and use the "Activate License" button above to activate.
                </p>
              </div>
            ) : (
              <Button 
                onClick={handleGenerateTrial}
                disabled={generatingTrial}
                data-testid="generate-trial-btn"
              >
                {generatingTrial ? "Generating..." : "Generate Trial License"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Standard License Generator */}
      {hasPermission("admin") && !license?.is_valid && (
        <Card className="border border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Get a Standard License
            </CardTitle>
            <CardDescription>
              Generate a Standard license to upgrade your NextGen DMS
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {standardKey ? (
              <div className="space-y-3">
                <div className="p-4 rounded bg-white border">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your Standard License Key</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 p-2 bg-muted rounded font-mono text-sm break-all">
                      {standardKey.license_key}
                    </code>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(standardKey.license_key)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    Expires: {new Date(standardKey.expires_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    {standardKey.max_users} users
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    {standardKey.max_documents} documents
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => copyToClipboard(standardKey.license_key)}
                    variant="outline" 
                    className="flex-1"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Key
                  </Button>
                  <Button 
                    onClick={() => handleActivateGeneratedLicense(standardKey.license_key)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Activate Now
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy this key and use the "Activate License" button above to activate.
                </p>
              </div>
            ) : (
              <Button 
                onClick={handleGenerateStandard}
                disabled={generatingStandard}
                data-testid="generate-standard-btn"
              >
                {generatingStandard ? "Generating..." : "Generate Standard License"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enterprise License Generator */}
      {hasPermission("admin") && !license?.is_valid && (
        <Card className="border border-purple-200 bg-purple-50/50">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Building className="w-5 h-5 text-purple-600" />
              Get an Enterprise License
            </CardTitle>
            <CardDescription>
              Generate an Enterprise license for your organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {enterpriseKey ? (
              <div className="space-y-3">
                <div className="p-4 rounded bg-white border">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your Enterprise License Key</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 p-2 bg-muted rounded font-mono text-sm break-all">
                      {enterpriseKey.license_key}
                    </code>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(enterpriseKey.license_key)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    Expires: {new Date(enterpriseKey.expires_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    {enterpriseKey.max_users} users
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    {enterpriseKey.max_documents} documents
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => copyToClipboard(enterpriseKey.license_key)}
                    variant="outline" 
                    className="flex-1"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Key
                  </Button>
                  <Button 
                    onClick={() => handleActivateGeneratedLicense(enterpriseKey.license_key)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Activate Now
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy this key and use the "Activate License" button above to activate.
                </p>
              </div>
            ) : (
              <Button 
                onClick={handleGenerateEnterprise}
                disabled={generatingEnterprise}
                data-testid="generate-enterprise-btn"
              >
                {generatingEnterprise ? "Generating..." : "Generate Enterprise License"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* License Tiers Info */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-lg font-heading">License Tiers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded border bg-amber-50/50">
              <Badge className={getLicenseTypeBadge("TRIAL")}>Trial</Badge>
              <p className="text-2xl font-heading font-bold mt-2">Free</p>
              <p className="text-sm text-muted-foreground">30 days</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  5 users
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  100 documents
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Basic features
                </li>
              </ul>
            </div>
            <div className="p-4 rounded border bg-blue-50/50">
              <Badge className={getLicenseTypeBadge("STANDARD")}>Standard</Badge>
              <p className="text-2xl font-heading font-bold mt-2">Contact Sales</p>
              <p className="text-sm text-muted-foreground">Annual</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  25 users
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  10,000 documents
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Records & Audit
                </li>
              </ul>
            </div>
            <div className="p-4 rounded border bg-purple-50/50">
              <Badge className={getLicenseTypeBadge("ENTERPRISE")}>Enterprise</Badge>
              <p className="text-2xl font-heading font-bold mt-2">Contact Sales</p>
              <p className="text-sm text-muted-foreground">Custom</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Unlimited users
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Unlimited documents
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  All features + SSO
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}