import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Clock, Trash2, Archive, ArrowRight, CheckCircle, XCircle, Play, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function DispositionPage() {
  const { token } = useAuth();
  const [dispositions, setDispositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchDispositions = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/disposition-queue`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDispositions(response.data);
    } catch (error) {
      toast.error("Failed to load disposition queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispositions();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await axios.post(`${API}/disposition-queue/generate`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(response.data.message);
      fetchDispositions();
    } catch (error) {
      toast.error("Failed to generate disposition requests");
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (dispId) => {
    try {
      await axios.post(`${API}/disposition-queue/${dispId}/approve`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Disposition approved");
      fetchDispositions();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to approve");
    }
  };

  const handleReject = async (dispId) => {
    try {
      await axios.post(`${API}/disposition-queue/${dispId}/reject`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Disposition rejected");
      fetchDispositions();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to reject");
    }
  };

  const handleExecute = async (dispId) => {
    try {
      await axios.post(`${API}/disposition-queue/${dispId}/execute`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Disposition executed");
      fetchDispositions();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to execute");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PENDING":
        return <Badge className="badge-pending">Pending</Badge>;
      case "APPROVED":
        return <Badge className="bg-blue-50 text-blue-700 border border-blue-200">Approved</Badge>;
      case "REJECTED":
        return <Badge className="bg-gray-50 text-gray-700 border border-gray-200">Rejected</Badge>;
      case "EXECUTED":
        return <Badge className="badge-record">Executed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case "DESTROY":
        return <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">Destroy</span>;
      case "ARCHIVE":
        return <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">Archive</span>;
      case "TRANSFER":
        return <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Transfer</span>;
      default:
        return <span className="text-xs">{action}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Disposition Queue</h1>
          <p className="text-muted-foreground mt-1">Review and approve record dispositions based on retention schedules</p>
        </div>
        <Button 
          onClick={handleGenerate} 
          disabled={generating}
          variant="outline"
          className="btn-hover"
          data-testid="generate-btn"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Generating..." : "Generate Requests"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border" data-testid="stat-pending">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-amber-50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {dispositions.filter(d => d.status === "PENDING").length}
              </p>
              <p className="text-sm text-muted-foreground">Pending Review</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border" data-testid="stat-approved">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-blue-50 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {dispositions.filter(d => d.status === "APPROVED").length}
              </p>
              <p className="text-sm text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border" data-testid="stat-executed">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-emerald-50 flex items-center justify-center">
              <Archive className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">
                {dispositions.filter(d => d.status === "EXECUTED").length}
              </p>
              <p className="text-sm text-muted-foreground">Executed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-lg font-heading">Disposition Requests</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider">Document</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Scheduled Date</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Action</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider w-48">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <div className="h-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : dispositions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Clock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No disposition requests</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click "Generate Requests" to check for records past retention
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                dispositions.map((disp) => (
                  <TableRow key={disp.id} className="table-row-hover" data-testid={`disp-row-${disp.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-amber-50 flex items-center justify-center">
                          <Trash2 className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-medium truncate max-w-[200px]">{disp.document_title}</p>
                          <p className="text-xs text-muted-foreground mono">{disp.document_id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(disp.scheduled_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {getActionBadge(disp.disposition_action)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(disp.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {disp.status === "PENDING" && (
                          <>
                            <Button 
                              size="sm" 
                              onClick={() => handleApprove(disp.id)}
                              data-testid={`approve-${disp.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleReject(disp.id)}
                              data-testid={`reject-${disp.id}`}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {disp.status === "APPROVED" && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleExecute(disp.id)}
                            data-testid={`execute-${disp.id}`}
                          >
                            <Play className="w-4 h-4 mr-1" />
                            Execute
                          </Button>
                        )}
                        <Link to={`/documents/${disp.document_id}`}>
                          <Button variant="ghost" size="icon" data-testid={`view-${disp.id}`}>
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
      <Card className="border">
        <CardContent className="p-6">
          <h3 className="font-heading font-semibold mb-2">Disposition Workflow</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="px-3 py-1 rounded bg-muted">Record Past Retention</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <span className="px-3 py-1 rounded badge-pending">Pending Review</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <span className="px-3 py-1 rounded bg-blue-50 text-blue-700">Approved</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <span className="px-3 py-1 rounded badge-record">Executed</span>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Documents under legal hold will be blocked from disposition until the hold is released.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
