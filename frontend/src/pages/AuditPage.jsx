import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
import { ClipboardList, Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";

export default function AuditPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actions, setActions] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [filters, setFilters] = useState({
    action: "all",
    resource_type: "all",
    start_date: "",
    end_date: ""
  });

  const fetchEvents = async () => {
    setLoading(true);
    try {
      let url = `${API}/audit?page=${page}&page_size=50`;
      if (filters.action !== "all") url += `&action=${filters.action}`;
      if (filters.resource_type !== "all") url += `&resource_type=${filters.resource_type}`;
      if (filters.start_date) url += `&start_date=${filters.start_date}`;
      if (filters.end_date) url += `&end_date=${filters.end_date}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(response.data);
    } catch (error) {
      toast.error("Failed to load audit events");
    } finally {
      setLoading(false);
    }
  };

  const fetchFilters = async () => {
    try {
      const [actionsRes, typesRes] = await Promise.all([
        axios.get(`${API}/audit/actions`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/audit/resource-types`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setActions(actionsRes.data);
      setResourceTypes(typesRes.data);
    } catch (error) {
      console.error("Failed to load filter options");
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [page, filters]);

  const handleSearch = () => {
    setPage(1);
    fetchEvents();
  };

  const getActionColor = (action) => {
    if (action.includes("DELETE") || action.includes("DESTROY")) return "text-red-600 bg-red-50 border-red-200";
    if (action.includes("CREATE") || action.includes("REGISTER")) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (action.includes("UPDATE") || action.includes("ASSIGN")) return "text-blue-600 bg-blue-50 border-blue-200";
    if (action.includes("LOGIN") || action.includes("LOGOUT")) return "text-purple-600 bg-purple-50 border-purple-200";
    return "text-gray-600 bg-gray-50 border-gray-200";
  };

  const exportToCSV = () => {
    const headers = ["Timestamp", "Actor", "Action", "Resource Type", "Resource ID", "Permission"];
    const rows = events.map(e => [
      e.timestamp,
      e.actor_email,
      e.action,
      e.resource_type,
      e.resource_id,
      e.permission_used || ""
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    toast.success("Audit log exported");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Audit Logs</h1>
          <p className="text-muted-foreground mt-1">Complete audit trail of all system activities</p>
        </div>
        <Button variant="outline" onClick={exportToCSV} className="btn-hover" data-testid="export-btn">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="border">
        <CardContent className="p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label className="text-xs">Action</Label>
              <Select 
                value={filters.action} 
                onValueChange={(v) => setFilters(prev => ({ ...prev, action: v }))}
              >
                <SelectTrigger data-testid="action-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actions.map(action => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Resource Type</Label>
              <Select 
                value={filters.resource_type} 
                onValueChange={(v) => setFilters(prev => ({ ...prev, resource_type: v }))}
              >
                <SelectTrigger data-testid="type-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {resourceTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
                data-testid="start-date"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters(prev => ({ ...prev, end_date: e.target.value }))}
                data-testid="end-date"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} className="w-full" data-testid="apply-filters">
                <Search className="w-4 h-4 mr-2" />
                Apply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card className="border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider">Timestamp</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Actor</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Action</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Resource</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Permission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <div className="h-10 bg-muted rounded animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No audit events found</p>
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event) => (
                  <TableRow key={event.id} className="table-row-hover" data-testid={`audit-row-${event.id}`}>
                    <TableCell className="mono text-xs">
                      {new Date(event.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{event.actor_email}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.actor_roles?.join(", ")}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded border ${getActionColor(event.action)}`}>
                        {event.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{event.resource_type}</p>
                        <p className="text-xs text-muted-foreground mono">
                          {event.resource_id?.slice(0, 12)}...
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.permission_used || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {events.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Page {page} • {events.length} events
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="prev-page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={events.length < 50}
                data-testid="next-page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Info */}
      <Card className="border">
        <CardContent className="p-6">
          <h3 className="font-heading font-semibold mb-2">About Audit Logging</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• All audit events are append-only and cannot be modified or deleted</li>
            <li>• Events capture actor details, roles, groups, and permissions used</li>
            <li>• Before/after state is recorded for update operations</li>
            <li>• Export functionality available for compliance reporting</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
