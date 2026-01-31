import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { 
  FileText, 
  Download, 
  Upload, 
  Archive, 
  Scale, 
  Trash2, 
  Clock,
  ChevronLeft,
  Eye,
  AlertCircle,
  Maximize2,
  X as XIcon,
  Lock,
  Unlock,
  User,
  BarChart3
} from "lucide-react";
import { toast } from "sonner";

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission, user } = useAuth();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState("none");
  const [holdReason, setHoldReason] = useState("");
  const [showDeclareDialog, setShowDeclareDialog] = useState(false);
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [checkinFile, setCheckinFile] = useState(null);
  const [checkinComment, setCheckinComment] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [viewHistory, setViewHistory] = useState(null);
  const [showViewHistory, setShowViewHistory] = useState(false);

  const fetchDocument = async () => {
    try {
      const response = await axios.get(`${API}/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocument(response.data);
    } catch (error) {
      toast.error("Failed to load document");
      navigate("/documents");
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await axios.get(`${API}/retention-schedules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchedules(response.data);
    } catch (error) {
      console.error("Failed to load schedules");
    }
  };

  useEffect(() => {
    fetchDocument();
    fetchSchedules();
  }, [id]);

  const handleDownload = async (versionNum) => {
    try {
      const response = await axios.get(`${API}/documents/${id}/download?version=${versionNum}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const version = document.versions.find(v => v.version_number === versionNum);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = version?.filename || 'document';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (error) {
      toast.error("Download failed");
    }
  };

  const handleUploadVersion = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      await axios.post(`${API}/documents/${id}/versions`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });
      toast.success("New version uploaded");
      setUploadFile(null);
      fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeclareRecord = async () => {
    try {
      const scheduleParam = selectedSchedule === "none" ? undefined : selectedSchedule;
      await axios.post(
        `${API}/documents/${id}/declare-record`,
        null,
        {
          params: scheduleParam ? { retention_schedule_id: scheduleParam } : {},
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success("Document declared as record");
      setShowDeclareDialog(false);
      fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to declare record");
    }
  };

  const handleApplyHold = async () => {
    if (!holdReason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    try {
      await axios.post(
        `${API}/documents/${id}/legal-hold`,
        null,
        {
          params: { reason: holdReason },
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success("Legal hold applied");
      setShowHoldDialog(false);
      setHoldReason("");
      fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to apply hold");
    }
  };

  const handleReleaseHold = async () => {
    try {
      await axios.delete(`${API}/documents/${id}/legal-hold`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Legal hold released");
      fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to release hold");
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Document deleted");
      navigate("/documents");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete");
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const canPreview = (contentType) => {
    return contentType === "application/pdf" || 
           contentType?.startsWith("image/") ||
           contentType?.startsWith("text/");
  };

  const openPreview = async (versionNum) => {
    const version = document.versions.find(v => v.version_number === versionNum);
    if (!version || !canPreview(version.content_type)) {
      toast.error("Preview not available for this file type");
      return;
    }
    
    try {
      const response = await axios.get(`${API}/documents/${id}/preview?version=${versionNum}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: version.content_type }));
      setPreviewUrl(url);
      setShowPreview(true);
    } catch (error) {
      toast.error("Failed to load preview");
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setShowPreview(false);
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      await axios.post(`${API}/documents/${id}/checkout`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Document checked out successfully");
      fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to checkout document");
    } finally {
      setCheckingOut(false);
    }
  };

  const handleCheckin = async () => {
    setCheckingIn(true);
    try {
      const formData = new FormData();
      if (checkinFile) {
        formData.append("file", checkinFile);
      }
      formData.append("comment", checkinComment);

      await axios.post(`${API}/documents/${id}/checkin`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });
      toast.success(checkinFile ? "Document checked in with new version" : "Document checked in");
      setShowCheckinDialog(false);
      setCheckinFile(null);
      setCheckinComment("");
      fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to checkin document");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCancelCheckout = async () => {
    try {
      await axios.delete(`${API}/documents/${id}/checkout`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Checkout cancelled");
      fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to cancel checkout");
    }
  };

  const fetchViewHistory = async () => {
    try {
      const response = await axios.get(`${API}/documents/${id}/views?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setViewHistory(response.data);
      setShowViewHistory(true);
    } catch (error) {
      toast.error("Failed to load view history");
    }
  };

  const isCheckedOutByMe = document?.checked_out && document?.checked_out_by === user?.id;
  const isCheckedOutByOther = document?.checked_out && document?.checked_out_by !== user?.id;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!document) return null;

  const latestVersion = document.versions[document.current_version - 1];
  const canModify = !document.is_record && !document.legal_hold && !isCheckedOutByOther;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Checkout Banner */}
      {document.checked_out && (
        <div className={`p-4 rounded-lg border ${
          isCheckedOutByMe 
            ? "bg-blue-50 border-blue-200 text-blue-800" 
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5" />
            <div className="flex-1">
              {isCheckedOutByMe ? (
                <p className="font-medium">You have this document checked out</p>
              ) : (
                <p className="font-medium">Checked out by {document.checked_out_by_name}</p>
              )}
              <p className="text-sm opacity-80">
                Since {new Date(document.checked_out_at).toLocaleString()}
              </p>
            </div>
            {isCheckedOutByMe && (
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={() => setShowCheckinDialog(true)}
                  data-testid="header-checkin-btn"
                >
                  <Unlock className="w-4 h-4 mr-1" />
                  Check In
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleCancelCheckout}
                  data-testid="header-cancel-checkout-btn"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="back-btn">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-heading font-bold">{document.title}</h1>
            {document.is_record && <Badge className="badge-record">Record</Badge>}
            {document.legal_hold && <Badge className="badge-hold">Legal Hold</Badge>}
            {document.checked_out && (
              <Badge className={isCheckedOutByMe ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-amber-50 text-amber-700 border border-amber-200"}>
                <Lock className="w-3 h-3 mr-1" />
                {isCheckedOutByMe ? "Checked Out (You)" : "Checked Out"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-muted-foreground mono text-sm">{document.id}</p>
            {document.view_count > 0 && (
              <button 
                onClick={fetchViewHistory}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                data-testid="view-count-btn"
              >
                <Eye className="w-3 h-3" />
                {document.view_count} views
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Document Info */}
          <Card className="border">
            <CardHeader>
              <CardTitle className="text-lg font-heading">Document Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {document.description && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
                  <p className="mt-1">{document.description}</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Visibility</Label>
                  <p className="mt-1">
                    <span className={`text-sm px-2 py-0.5 rounded border ${
                      document.visibility === "ORG" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      document.visibility === "GROUP" ? "bg-purple-50 text-purple-700 border-purple-200" :
                      "bg-gray-50 text-gray-700 border-gray-200"
                    }`}>
                      {document.visibility}
                    </span>
                  </p>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Current Version</Label>
                  <p className="mt-1 mono">v{document.current_version}</p>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Created</Label>
                  <p className="mt-1">{new Date(document.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Updated</Label>
                  <p className="mt-1">{new Date(document.updated_at).toLocaleString()}</p>
                </div>
              </div>
              {document.tags?.length > 0 && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tags</Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {document.tags.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded bg-muted">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Versions */}
          <Card className="border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-heading">Version History</CardTitle>
              {canModify && (
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0])}
                    className="max-w-[200px]"
                    data-testid="version-file-input"
                  />
                  <Button 
                    onClick={handleUploadVersion} 
                    disabled={!uploadFile || uploading}
                    size="sm"
                    data-testid="upload-version-btn"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...document.versions].reverse().map((version) => (
                  <div 
                    key={version.version_number}
                    className="flex items-center justify-between p-3 rounded border bg-card hover:bg-muted transition-colors"
                    data-testid={`version-${version.version_number}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-primary/5 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">
                          Version {version.version_number}
                          {version.version_number === document.current_version && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground">Latest</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {version.filename} • {formatFileSize(version.file_size)} • {new Date(version.uploaded_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canPreview(version.content_type) && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openPreview(version.version_number)}
                          data-testid={`preview-v${version.version_number}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDownload(version.version_number)}
                        data-testid={`download-v${version.version_number}`}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Document Preview */}
          {latestVersion && canPreview(latestVersion.content_type) && (
            <Card className="border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-heading">Preview</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => openPreview(document.current_version)}
                  data-testid="fullscreen-preview"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {latestVersion.content_type === "application/pdf" ? (
                  <div className="aspect-[3/4] bg-muted rounded overflow-hidden">
                    <iframe
                      src={`${API}/documents/${id}/preview?token=${token}`}
                      className="w-full h-full border-0"
                      title="Document Preview"
                    />
                  </div>
                ) : latestVersion.content_type?.startsWith("image/") ? (
                  <img 
                    src={`${API}/documents/${id}/preview`}
                    alt={document.title}
                    className="w-full rounded"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click the expand icon to preview this file
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Extracted Text Preview */}
          {latestVersion?.extracted_text && (
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-lg font-heading">Extracted Text Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded bg-muted max-h-64 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-mono">
                    {latestVersion.extracted_text.slice(0, 2000)}
                    {latestVersion.extracted_text.length > 2000 && "..."}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="border">
            <CardHeader>
              <CardTitle className="text-lg font-heading">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full justify-start btn-hover" 
                variant="outline"
                onClick={() => handleDownload(document.current_version)}
                data-testid="download-latest"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Latest
              </Button>

              {/* Checkout/Checkin Actions */}
              {canModify && !document.checked_out && (
                <Button 
                  className="w-full justify-start btn-hover" 
                  variant="outline"
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  data-testid="checkout-btn"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {checkingOut ? "Checking out..." : "Check Out"}
                </Button>
              )}

              {isCheckedOutByMe && (
                <>
                  <Dialog open={showCheckinDialog} onOpenChange={setShowCheckinDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        className="w-full justify-start btn-hover" 
                        data-testid="checkin-btn"
                      >
                        <Unlock className="w-4 h-4 mr-2" />
                        Check In
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Check In Document</DialogTitle>
                        <DialogDescription>
                          Optionally upload a new version when checking in.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>New Version (Optional)</Label>
                          <Input
                            type="file"
                            onChange={(e) => setCheckinFile(e.target.files?.[0])}
                            data-testid="checkin-file"
                          />
                          <p className="text-xs text-muted-foreground">
                            Leave empty to check in without creating a new version
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Comment</Label>
                          <Textarea
                            placeholder="Describe changes made..."
                            value={checkinComment}
                            onChange={(e) => setCheckinComment(e.target.value)}
                            rows={3}
                            data-testid="checkin-comment"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCheckinDialog(false)}>Cancel</Button>
                        <Button onClick={handleCheckin} disabled={checkingIn} data-testid="confirm-checkin">
                          {checkingIn ? "Checking in..." : "Check In"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button 
                    className="w-full justify-start" 
                    variant="ghost"
                    onClick={handleCancelCheckout}
                    data-testid="cancel-checkout-btn"
                  >
                    <XIcon className="w-4 h-4 mr-2" />
                    Cancel Checkout
                  </Button>
                </>
              )}

              {isCheckedOutByOther && (
                <div className="p-3 rounded bg-amber-50 border border-amber-200 text-sm">
                  <div className="flex items-center gap-2 text-amber-800">
                    <Lock className="w-4 h-4" />
                    <span>Checked out by {document.checked_out_by_name}</span>
                  </div>
                </div>
              )}

              {hasPermission("records:manage") && !document.is_record && (
                <Dialog open={showDeclareDialog} onOpenChange={setShowDeclareDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      className="w-full justify-start btn-hover" 
                      variant="outline"
                      disabled={document.legal_hold}
                      data-testid="declare-record-btn"
                    >
                      <Archive className="w-4 h-4 mr-2" />
                      Declare as Record
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Declare as Record</DialogTitle>
                      <DialogDescription>
                        This will lock the document and prevent future modifications.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Retention Schedule (Optional)</Label>
                        <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
                          <SelectTrigger data-testid="schedule-select">
                            <SelectValue placeholder="Select a schedule" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {schedules.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowDeclareDialog(false)}>Cancel</Button>
                      <Button onClick={handleDeclareRecord} data-testid="confirm-declare">Declare Record</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {hasPermission("records:manage") && (
                document.legal_hold ? (
                  <Button 
                    className="w-full justify-start btn-hover" 
                    variant="outline"
                    onClick={handleReleaseHold}
                    data-testid="release-hold-btn"
                  >
                    <Scale className="w-4 h-4 mr-2" />
                    Release Legal Hold
                  </Button>
                ) : (
                  <Dialog open={showHoldDialog} onOpenChange={setShowHoldDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        className="w-full justify-start btn-hover" 
                        variant="outline"
                        data-testid="apply-hold-btn"
                      >
                        <Scale className="w-4 h-4 mr-2" />
                        Apply Legal Hold
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Apply Legal Hold</DialogTitle>
                        <DialogDescription>
                          This will prevent any modifications or deletions to this document.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Reason</Label>
                          <Input
                            placeholder="Enter reason for legal hold"
                            value={holdReason}
                            onChange={(e) => setHoldReason(e.target.value)}
                            data-testid="hold-reason-input"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowHoldDialog(false)}>Cancel</Button>
                        <Button onClick={handleApplyHold} data-testid="confirm-hold">Apply Hold</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )
              )}

              {canModify && (
                <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      className="w-full justify-start" 
                      variant="destructive"
                      data-testid="delete-btn"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Document
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Document</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete this document? This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                      <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete">Delete</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>

          {/* Record Info */}
          {document.is_record && (
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-lg font-heading flex items-center gap-2">
                  <Archive className="w-5 h-5 text-emerald-600" />
                  Record Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Declared At</Label>
                  <p className="mt-1 text-sm">{new Date(document.record_declared_at).toLocaleString()}</p>
                </div>
                {document.retention_schedule_id && (
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Retention Schedule</Label>
                    <p className="mt-1 text-sm mono">{document.retention_schedule_id}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Legal Hold Info */}
          {document.legal_hold && (
            <Card className="border border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-heading flex items-center gap-2 text-red-700">
                  <Scale className="w-5 h-5" />
                  Legal Hold Active
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{document.legal_hold_reason}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Fullscreen Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={closePreview}
            data-testid="close-preview"
          >
            <XIcon className="w-6 h-6" />
          </Button>
          <div className="w-full h-full max-w-5xl max-h-[90vh] flex items-center justify-center">
            {latestVersion?.content_type === "application/pdf" ? (
              <iframe
                src={previewUrl}
                className="w-full h-full rounded bg-white"
                title="Document Preview"
              />
            ) : latestVersion?.content_type?.startsWith("image/") ? (
              <img 
                src={previewUrl}
                alt={document.title}
                className="max-w-full max-h-full object-contain rounded"
              />
            ) : (
              <div className="bg-white rounded p-8 max-w-3xl max-h-[80vh] overflow-auto">
                <pre className="text-sm whitespace-pre-wrap">
                  {latestVersion?.extracted_text || "Preview not available"}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View History Modal */}
      <Dialog open={showViewHistory} onOpenChange={setShowViewHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              View History
            </DialogTitle>
            <DialogDescription>
              {viewHistory?.total_views || 0} total views
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto">
            {viewHistory?.recent_views?.length > 0 ? (
              <div className="space-y-2">
                {viewHistory.recent_views.map((view, index) => (
                  <div 
                    key={view.id || index}
                    className="flex items-center gap-3 p-2 rounded bg-muted"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{view.user_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(view.viewed_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No view history yet</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
