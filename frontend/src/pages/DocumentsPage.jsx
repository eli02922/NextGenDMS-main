import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
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
import { Label } from "../components/ui/label";
import { 
  FileText, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Eye,
  Download,
  MoreHorizontal,
  SlidersHorizontal,
  Calendar
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { toast } from "sonner";

export default function DocumentsPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [visibility, setVisibility] = useState("all");
  const [isRecord, setIsRecord] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fileType, setFileType] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);

  const fileTypes = [
    { value: "all", label: "All Types" },
    { value: "pdf", label: "PDF" },
    { value: "docx", label: "Word" },
    { value: "txt", label: "Text" },
    { value: "png,jpg,jpeg", label: "Images" }
  ];

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      let url = `${API}/documents?page=${page}&page_size=20`;
      if (visibility !== "all") url += `&visibility=${visibility}`;
      if (isRecord !== "all") url += `&is_record=${isRecord === "true"}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data);
      setTotal(response.data.length);
    } catch (error) {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const searchDocuments = async () => {
    setLoading(true);
    try {
      const searchPayload = {
        query: searchQuery || "",
        page,
        page_size: 20,
        filters: {
          visibility: visibility !== "all" ? visibility : undefined,
          is_record: isRecord !== "all" ? isRecord === "true" : undefined
        },
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        file_types: fileType !== "all" ? fileType.split(",") : undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      };

      const response = await axios.post(`${API}/search`, searchPayload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data.results);
      setTotal(response.data.total);
    } catch (error) {
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    searchDocuments();
  }, [page, visibility, isRecord, sortBy, sortOrder]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    searchDocuments();
  };

  const handleDownload = async (doc) => {
    try {
      const response = await axios.get(`${API}/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.versions?.[doc.current_version - 1]?.filename || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (error) {
      toast.error("Download failed");
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Documents</h1>
          <p className="text-muted-foreground mt-1">Browse and search your document library</p>
        </div>
        <Link to="/upload">
          <Button className="btn-hover" data-testid="upload-new-btn">
            Upload New
          </Button>
        </Link>
      </div>

      {/* Search & Filters */}
      <Card className="border">
        <CardContent className="p-4 space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, content, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="search-input"
              />
            </div>
            <div className="flex gap-2">
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger className="w-32" data-testid="visibility-filter">
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                  <SelectItem value="GROUP">Group</SelectItem>
                  <SelectItem value="ORG">Organization</SelectItem>
                </SelectContent>
              </Select>
              <Select value={isRecord} onValueChange={setIsRecord}>
                <SelectTrigger className="w-32" data-testid="record-filter">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="true">Records</SelectItem>
                  <SelectItem value="false">Documents</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowFilters(!showFilters)}
                data-testid="advanced-filters-btn"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
              <Button type="submit" data-testid="search-btn">
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </form>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="pt-4 border-t space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    data-testid="date-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    data-testid="date-to"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">File Type</Label>
                  <Select value={fileType} onValueChange={setFileType}>
                    <SelectTrigger data-testid="file-type-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fileTypes.map(ft => (
                        <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sort By</Label>
                  <div className="flex gap-2">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger data-testid="sort-by">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_at">Created</SelectItem>
                        <SelectItem value="updated_at">Updated</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortOrder} onValueChange={setSortOrder}>
                      <SelectTrigger className="w-24" data-testid="sort-order">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">Newest</SelectItem>
                        <SelectItem value="asc">Oldest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setFileType("all");
                    setSortBy("created_at");
                    setSortOrder("desc");
                    setSearchQuery("");
                    setVisibility("all");
                    setIsRecord("all");
                  }}
                  data-testid="clear-filters"
                >
                  Clear All Filters
                </Button>
                <Button 
                  type="button" 
                  size="sm"
                  onClick={searchDocuments}
                  data-testid="apply-filters"
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card className="border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider">Document</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Version</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Size</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Visibility</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Created</TableHead>
                <TableHead className="text-xs uppercase tracking-wider w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <div className="h-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No documents found</p>
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc) => {
                  const latestVersion = doc.versions?.[doc.current_version - 1];
                  return (
                    <TableRow 
                      key={doc.id} 
                      className="table-row-hover cursor-pointer"
                      data-testid={`doc-row-${doc.id}`}
                    >
                      <TableCell>
                        <Link to={`/documents/${doc.id}`} className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded bg-primary/5 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[200px]">{doc.title}</p>
                            <p className="text-xs text-muted-foreground mono truncate max-w-[200px]">
                              {doc.id.slice(0, 8)}...
                            </p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="mono text-sm">v{doc.current_version}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatFileSize(latestVersion?.file_size)}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded border ${
                          doc.visibility === "ORG" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          doc.visibility === "GROUP" ? "bg-purple-50 text-purple-700 border-purple-200" :
                          "bg-gray-50 text-gray-700 border-gray-200"
                        }`}>
                          {doc.visibility}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {doc.is_record && (
                            <span className="text-xs px-2 py-0.5 rounded badge-record">Record</span>
                          )}
                          {doc.legal_hold && (
                            <span className="text-xs px-2 py-0.5 rounded badge-hold">Hold</span>
                          )}
                          {doc.checked_out && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              Checked Out
                            </span>
                          )}
                          {!doc.is_record && !doc.legal_hold && !doc.checked_out && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`doc-menu-${doc.id}`}>
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/documents/${doc.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(doc)}>
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {documents.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Page {page} • {total} total documents
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
                disabled={documents.length < 20}
                data-testid="next-page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
