import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
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
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../components/ui/table";
import { Scale, FileText, Eye, Plus, X } from "lucide-react";
import { toast } from "sonner";

export default function LegalHoldsPage() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [holdReason, setHoldReason] = useState("");
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [allDocs, setAllDocs] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [holdRes, allRes] = await Promise.all([
        axios.get(`${API}/documents?legal_hold=true&page_size=100`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/documents?page_size=100`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setDocuments(holdRes.data);
      setAllDocs(allRes.data.filter(d => !d.legal_hold));
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApplyHold = async () => {
    if (!selectedDoc || !holdReason.trim()) {
      toast.error("Please select a document and provide a reason");
      return;
    }
    try {
      await axios.post(
        `${API}/documents/${selectedDoc}/legal-hold`,
        null,
        {
          params: { reason: holdReason },
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success("Legal hold applied");
      setShowApplyDialog(false);
      setSelectedDoc(null);
      setHoldReason("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to apply hold");
    }
  };

  const handleReleaseHold = async (docId) => {
    try {
      await axios.delete(`${API}/documents/${docId}/legal-hold`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Legal hold released");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to release hold");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Legal Holds</h1>
          <p className="text-muted-foreground mt-1">Prevent modification or deletion of documents under legal review</p>
        </div>
        <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
          <DialogTrigger asChild>
            <Button className="btn-hover" data-testid="apply-hold-btn">
              <Plus className="w-4 h-4 mr-2" />
              Apply Legal Hold
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply Legal Hold</DialogTitle>
              <DialogDescription>
                Select a document and provide a reason for the legal hold.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Document</Label>
                <select
                  className="w-full h-10 px-3 rounded border bg-background"
                  value={selectedDoc || ""}
                  onChange={(e) => setSelectedDoc(e.target.value)}
                  data-testid="select-doc"
                >
                  <option value="">Select a document</option>
                  {allDocs.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input
                  placeholder="Enter reason for legal hold"
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  data-testid="hold-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApplyDialog(false)}>Cancel</Button>
              <Button onClick={handleApplyHold} data-testid="confirm-apply">Apply Hold</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <Card className="border" data-testid="holds-stat">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded bg-red-50 flex items-center justify-center">
            <Scale className="w-8 h-8 text-red-600" />
          </div>
          <div>
            <p className="text-3xl font-heading font-bold">{documents.length}</p>
            <p className="text-muted-foreground">Documents Under Legal Hold</p>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-lg font-heading">Active Legal Holds</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider">Document</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Reason</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Record Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <div className="h-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <Scale className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No documents under legal hold</p>
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc) => (
                  <TableRow key={doc.id} className="table-row-hover" data-testid={`hold-row-${doc.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-red-50 flex items-center justify-center">
                          <Scale className="w-4 h-4 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium truncate max-w-[200px]">{doc.title}</p>
                          <p className="text-xs text-muted-foreground mono">{doc.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm max-w-[300px] truncate">{doc.legal_hold_reason || "—"}</p>
                    </TableCell>
                    <TableCell>
                      {doc.is_record ? (
                        <span className="text-xs px-2 py-0.5 rounded badge-record">Record</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Document</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleReleaseHold(doc.id)}
                          data-testid={`release-${doc.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Release
                        </Button>
                        <Link to={`/documents/${doc.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`view-${doc.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Info Card */}
      <Card className="border border-amber-200 bg-amber-50/50">
        <CardContent className="p-6">
          <h3 className="font-heading font-semibold mb-2">About Legal Holds</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Legal holds prevent any modifications to the document content</li>
            <li>• Documents under hold cannot be deleted or have new versions added</li>
            <li>• Holds override retention schedules - disposition is blocked</li>
            <li>• Only records managers can apply or release legal holds</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
