import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../components/ui/table";
import { Archive, FileText, Eye, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function RecordsPage() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, documents, records

  const fetchData = async () => {
    setLoading(true);
    try {
      const [docsRes, schedulesRes] = await Promise.all([
        axios.get(`${API}/documents?page_size=100`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/retention-schedules`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setDocuments(docsRes.data);
      setSchedules(schedulesRes.data);
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeclareRecord = async (docId, scheduleId) => {
    try {
      await axios.post(
        `${API}/documents/${docId}/declare-record`,
        null,
        {
          params: scheduleId ? { retention_schedule_id: scheduleId } : {},
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success("Document declared as record");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to declare record");
    }
  };

  const handleAssignSchedule = async (docId, scheduleId) => {
    try {
      await axios.put(
        `${API}/documents/${docId}/retention-schedule`,
        null,
        {
          params: { retention_schedule_id: scheduleId },
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success("Retention schedule assigned");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to assign schedule");
    }
  };

  const filteredDocs = documents.filter(doc => {
    if (filter === "documents") return !doc.is_record;
    if (filter === "records") return doc.is_record;
    return true;
  });

  const getScheduleName = (scheduleId) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    return schedule?.name || "—";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Records Management</h1>
          <p className="text-muted-foreground mt-1">Declare documents as records and assign retention schedules</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border" data-testid="stat-total">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-primary/5 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">{documents.length}</p>
              <p className="text-sm text-muted-foreground">Total Documents</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border" data-testid="stat-records">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-emerald-50 flex items-center justify-center">
              <Archive className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">{documents.filter(d => d.is_record).length}</p>
              <p className="text-sm text-muted-foreground">Declared Records</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border" data-testid="stat-schedules">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-blue-50 flex items-center justify-center">
              <Archive className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold">{schedules.length}</p>
              <p className="text-sm text-muted-foreground">Retention Schedules</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48" data-testid="filter-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Documents</SelectItem>
            <SelectItem value="documents">Documents Only</SelectItem>
            <SelectItem value="records">Records Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider">Document</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Retention Schedule</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Declared At</TableHead>
                <TableHead className="text-xs uppercase tracking-wider w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <div className="h-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredDocs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Archive className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No documents found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredDocs.map((doc) => (
                  <TableRow key={doc.id} className="table-row-hover" data-testid={`record-row-${doc.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-primary/5 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium truncate max-w-[200px]">{doc.title}</p>
                          <p className="text-xs text-muted-foreground mono">{doc.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {doc.is_record ? (
                        <span className="text-xs px-2 py-0.5 rounded badge-record">Record</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200">Document</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {doc.is_record ? (
                        doc.retention_schedule_id ? (
                          <span className="text-sm">{getScheduleName(doc.retention_schedule_id)}</span>
                        ) : (
                          <Select onValueChange={(value) => handleAssignSchedule(doc.id, value)}>
                            <SelectTrigger className="w-40 h-8" data-testid={`assign-schedule-${doc.id}`}>
                              <SelectValue placeholder="Assign schedule" />
                            </SelectTrigger>
                            <SelectContent>
                              {schedules.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.record_declared_at ? new Date(doc.record_declared_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!doc.is_record && !doc.legal_hold && (
                          <Select onValueChange={(value) => handleDeclareRecord(doc.id, value === "no-schedule" ? null : value)}>
                            <SelectTrigger className="w-32 h-8" data-testid={`declare-${doc.id}`}>
                              <SelectValue placeholder="Declare" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="no-schedule">No Schedule</SelectItem>
                              {schedules.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
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

      {/* Retention Schedules Info */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-lg font-heading">Available Retention Schedules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {schedules.map(schedule => (
              <div 
                key={schedule.id} 
                className="p-4 rounded border bg-card"
                data-testid={`schedule-${schedule.id}`}
              >
                <h3 className="font-medium">{schedule.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{schedule.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">
                    {schedule.retention_period_days} days
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    schedule.disposition_action === "DESTROY" ? "bg-red-50 text-red-700" :
                    schedule.disposition_action === "ARCHIVE" ? "bg-blue-50 text-blue-700" :
                    "bg-amber-50 text-amber-700"
                  }`}>
                    {schedule.disposition_action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
