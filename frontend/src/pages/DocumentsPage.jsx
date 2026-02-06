import { useState, useEffect, useCallback } from "react";
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
  ChevronLeft, 
  ChevronRight,
  Eye,
  Download,
  MoreHorizontal,
  SlidersHorizontal,
  Loader2,
  X,
  Copy,
  FileDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

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
  
  // Modal states
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [documentSummary, setDocumentSummary] = useState("");
  const [summarizationMethod, setSummarizationMethod] = useState("extractive");
  const [maxLength, setMaxLength] = useState(500);
  const [temperature, setTemperature] = useState(0.3);
  const [customInstructions, setCustomInstructions] = useState("");
  const [summaryMetadata, setSummaryMetadata] = useState(null);
  const [documentAnalysis, setDocumentAnalysis] = useState(null);
  const [previousSummaries, setPreviousSummaries] = useState([]);

  const fileTypes = [
    { value: "all", label: "All Types" },
    { value: "pdf", label: "PDF" },
    { value: "docx", label: "Word" },
    { value: "txt", label: "Text" },
    { value: "png,jpg,jpeg", label: "Images" }
  ];

  const summarizationMethods = [
    { value: "extractive", label: "Extractive Summary", description: "Extracts key sentences from the document" },
    { value: "abstractive", label: "Abstractive Summary", description: "Generates new sentences to summarize content" },
    { value: "bullet_points", label: "Bullet Points", description: "Creates concise bullet point summary" },
    { value: "executive", label: "Executive Summary", description: "High-level summary for executives" }
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

  const handleSummarizeDocument = useCallback(async (doc) => {
    setSelectedDocument(doc);
    setDocumentSummary("");
    setSummaryMetadata(null);
    setDocumentAnalysis(null);
    setPreviousSummaries([]);
    setSummarizationMethod("extractive");
    setMaxLength(500);
    setTemperature(0.3);
    setCustomInstructions("");
    
    setSummaryModalOpen(true);
    
    try {
      const response = await axios.get(
        `${API}/documents/${doc.id}/summaries`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setPreviousSummaries(response.data);
    } catch (error) {
      console.error("Error loading previous summaries:", error);
    }
  }, [token]);

  const generateSummary = async () => {
    if (!selectedDocument) return;
    
    setSummaryLoading(true);
    try {
      const response = await axios.post(
        `${API}/documents/${selectedDocument.id}/summarize`,
        {
          method: summarizationMethod,
          max_length: maxLength,
          temperature: temperature,
          additional_instructions: customInstructions || undefined
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      setDocumentSummary(response.data.summary);
      setSummaryMetadata(response.data.metadata);
      setDocumentAnalysis(response.data.analysis || {});
      
      const summariesResponse = await axios.get(
        `${API}/documents/${selectedDocument.id}/summaries`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setPreviousSummaries(summariesResponse.data);
      
      toast.success("Document summarized successfully");
    } catch (error) {
      console.error("Summarization error:", error);
      toast.error(error.response?.data?.detail || "Failed to summarize document");
    } finally {
      setSummaryLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(documentSummary);
      toast.success("Summary copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy summary");
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const resetModal = () => {
    setSummaryModalOpen(false);
    setTimeout(() => {
      setSelectedDocument(null);
      setDocumentSummary("");
      setSummaryMetadata(null);
      setDocumentAnalysis(null);
      setPreviousSummaries([]);
      setSummarizationMethod("extractive");
      setMaxLength(500);
      setTemperature(0.3);
      setCustomInstructions("");
    }, 300);
  };

  // Real PDF export with jsPDF
const exportToPDF = async () => {
  if (!documentSummary || !selectedDocument) return;
  
  try {
    toast.info("Generating PDF...");
    
    // Create PDF document
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let yPosition = 20;
    
    // Add header
    pdf.setFontSize(18);
    pdf.setTextColor(33, 37, 41);
    pdf.text("DOCUMENT SUMMARY REPORT", pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 15;
    
    // Document info
    pdf.setFontSize(11);
    pdf.text(`Document: ${selectedDocument.title}`, margin, yPosition);
    yPosition += 7;
    pdf.text(`ID: ${selectedDocument.id}`, margin, yPosition);
    yPosition += 7;
    pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 7;
    pdf.text(`Method: ${summarizationMethod}`, margin, yPosition);
    yPosition += 7;
    pdf.text(`Model: ${summaryMetadata?.model_used || 'Cohere AI'}`, margin, yPosition);
    
    yPosition += 15;
    
    // Summary section
    pdf.setFontSize(14);
    pdf.setTextColor(0, 102, 204);
    pdf.text("SUMMARY", margin, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    
    // Split summary into lines
    const summaryLines = pdf.splitTextToSize(documentSummary, pageWidth - (margin * 2));
    
    for (let line of summaryLines) {
      if (yPosition > 270) { // Near bottom of page
        pdf.addPage();
        yPosition = 20;
      }
      pdf.text(line, margin, yPosition);
      yPosition += 7;
    }
    
    yPosition += 10;
    
    // Analysis section
    if (documentAnalysis && documentAnalysis.document_type) {
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = 20;
      }
      
      pdf.setFontSize(14);
      pdf.setTextColor(0, 102, 204);
      pdf.text("ANALYSIS", margin, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      
      const analysisLines = [
        `Type: ${documentAnalysis.document_type}`,
        `Sentiment: ${documentAnalysis.sentiment || 'Neutral'}`,
        `Word Count: ${documentAnalysis.word_count || 'N/A'}`,
        `Reading Time: ${documentAnalysis.estimated_reading_time?.toFixed(1) || 'N/A'} minutes`,
      ];
      
      for (let line of analysisLines) {
        pdf.text(line, margin, yPosition);
        yPosition += 7;
      }
      
      // Topics
      if (documentAnalysis.topics && documentAnalysis.topics.length > 0) {
        yPosition += 7;
        pdf.text("Topics:", margin, yPosition);
        yPosition += 7;
        const topicsText = `• ${documentAnalysis.topics.slice(0, 5).join('\n• ')}`;
        const topicLines = pdf.splitTextToSize(topicsText, pageWidth - (margin * 2));
        for (let line of topicLines) {
          pdf.text(line, margin + 5, yPosition);
          yPosition += 7;
        }
      }
      
      // Key Entities
      if (documentAnalysis.key_entities && documentAnalysis.key_entities.length > 0) {
        yPosition += 7;
        pdf.text("Key Entities:", margin, yPosition);
        yPosition += 7;
        const entitiesText = `• ${documentAnalysis.key_entities.slice(0, 5).join('\n• ')}`;
        const entityLines = pdf.splitTextToSize(entitiesText, pageWidth - (margin * 2));
        for (let line of entityLines) {
          pdf.text(line, margin + 5, yPosition);
          yPosition += 7;
        }
      }
    }
    
    // Metadata section
    if (summaryMetadata) {
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = 20;
      }
      
      yPosition += 10;
      pdf.setFontSize(14);
      pdf.setTextColor(0, 102, 204);
      pdf.text("METADATA", margin, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      
      const metadataLines = [
        `Summary Words: ${summaryMetadata.word_count}`,
        `Original Words: ${summaryMetadata.original_word_count || 'N/A'}`,
        `Compression: ${(summaryMetadata.compression_ratio * 100).toFixed(1)}%`,
        `Reading Time: ${summaryMetadata.reading_time_minutes.toFixed(1)} minutes`,
      ];
      
      for (let line of metadataLines) {
        pdf.text(line, margin, yPosition);
        yPosition += 7;
      }
    }
    
    // Save PDF
    const fileName = `summary_${selectedDocument.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
    pdf.save(fileName);
    
    toast.success("PDF exported successfully!");
    
  } catch (error) {
    console.error("PDF export error:", error);
    toast.error("Failed to export PDF");
  }
};

// Real Word export with docx
const exportToWord = async () => {
  if (!documentSummary || !selectedDocument) return;
  
  try {
    toast.info("Generating Word document...");
    
    // Create Word document
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: "DOCUMENT SUMMARY REPORT",
                bold: true,
                size: 32,
                color: "000000",
              }),
            ],
            alignment: "center",
            spacing: { after: 400 },
          }),
          
          // Document info
          new Paragraph({
            children: [
              new TextRun({
                text: `Document: ${selectedDocument.title}`,
                size: 24,
              }),
            ],
            spacing: { after: 200 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `ID: ${selectedDocument.id}`,
                size: 20,
              }),
            ],
            spacing: { after: 200 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated: ${new Date().toLocaleString()}`,
                size: 20,
              }),
            ],
            spacing: { after: 200 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Method: ${summarizationMethod}`,
                size: 20,
              }),
            ],
            spacing: { after: 200 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Model: ${summaryMetadata?.model_used || 'Cohere AI'}`,
                size: 20,
              }),
            ],
            spacing: { after: 400 },
          }),
          
          // Summary title
          new Paragraph({
            children: [
              new TextRun({
                text: "SUMMARY",
                bold: true,
                size: 28,
                color: "0066CC",
              }),
            ],
            spacing: { after: 200 },
          }),
          
          // Summary content
          new Paragraph({
            children: [
              new TextRun({
                text: documentSummary,
                size: 22,
              }),
            ],
            spacing: { after: 400 },
          }),
        ],
      }],
    });
    
    // Add analysis section if available
    if (documentAnalysis && documentAnalysis.document_type) {
      doc.addSection({
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "ANALYSIS",
                bold: true,
                size: 28,
                color: "0066CC",
              }),
            ],
            spacing: { after: 200 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Type: ${documentAnalysis.document_type}`,
                size: 22,
              }),
            ],
            spacing: { after: 100 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Sentiment: ${documentAnalysis.sentiment || 'Neutral'}`,
                size: 22,
              }),
            ],
            spacing: { after: 100 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Word Count: ${documentAnalysis.word_count || 'N/A'}`,
                size: 22,
              }),
            ],
            spacing: { after: 100 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Reading Time: ${documentAnalysis.estimated_reading_time?.toFixed(1) || 'N/A'} minutes`,
                size: 22,
              }),
            ],
            spacing: { after: 200 },
          }),
        ],
      });
      
      // Add topics if available
      if (documentAnalysis.topics && documentAnalysis.topics.length > 0) {
        doc.addSection({
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Topics:",
                  bold: true,
                  size: 24,
                }),
              ],
              spacing: { after: 100 },
            }),
            
            ...documentAnalysis.topics.slice(0, 5).map(topic => 
              new Paragraph({
                children: [
                  new TextRun({
                    text: `• ${topic}`,
                    size: 22,
                  }),
                ],
                spacing: { after: 50 },
              })
            ),
          ],
        });
      }
      
      // Add key entities if available
      if (documentAnalysis.key_entities && documentAnalysis.key_entities.length > 0) {
        doc.addSection({
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Key Entities:",
                  bold: true,
                  size: 24,
                }),
              ],
              spacing: { after: 100 },
            }),
            
            ...documentAnalysis.key_entities.slice(0, 5).map(entity => 
              new Paragraph({
                children: [
                  new TextRun({
                    text: `• ${entity}`,
                    size: 22,
                  }),
                ],
                spacing: { after: 50 },
              })
            ),
          ],
        });
      }
    }
    
    // Add metadata section
    if (summaryMetadata) {
      doc.addSection({
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "METADATA",
                bold: true,
                size: 28,
                color: "0066CC",
              }),
            ],
            spacing: { after: 200 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Summary Words: ${summaryMetadata.word_count}`,
                size: 22,
              }),
            ],
            spacing: { after: 100 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Original Words: ${summaryMetadata.original_word_count || 'N/A'}`,
                size: 22,
              }),
            ],
            spacing: { after: 100 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Compression: ${(summaryMetadata.compression_ratio * 100).toFixed(1)}%`,
                size: 22,
              }),
            ],
            spacing: { after: 100 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Reading Time: ${summaryMetadata.reading_time_minutes.toFixed(1)} minutes`,
                size: 22,
              }),
            ],
            spacing: { after: 100 },
          }),
        ],
      });
    }
    
    // Generate and save Word document
    const blob = await Packer.toBlob(doc);
    const fileName = `summary_${selectedDocument.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.docx`;
    saveAs(blob, fileName);
    
    toast.success("Word document exported successfully!");
    
  } catch (error) {
    console.error("Word export error:", error);
    toast.error("Failed to export Word document");
  }
};

// Simple text export (kept as is)
const exportToText = async () => {
  if (!documentSummary || !selectedDocument) return;
  
  try {
    const content = `
Document: ${selectedDocument.title}
ID: ${selectedDocument.id}
Generated: ${new Date().toLocaleString()}
Method: ${summarizationMethod}
Model: ${summaryMetadata?.model_used || 'Cohere AI'}

SUMMARY:
${documentSummary}

${documentAnalysis ? `
ANALYSIS:
Type: ${documentAnalysis.document_type || 'N/A'}
Sentiment: ${documentAnalysis.sentiment || 'Neutral'}
Word Count: ${documentAnalysis.word_count || 'N/A'}
Reading Time: ${documentAnalysis.estimated_reading_time?.toFixed(1) || 'N/A'} minutes
Topics: ${documentAnalysis.topics?.join(', ') || 'N/A'}
Key Entities: ${documentAnalysis.key_entities?.join(', ') || 'N/A'}
` : ''}

${summaryMetadata ? `
METADATA:
Summary Words: ${summaryMetadata.word_count}
Original Words: ${summaryMetadata.original_word_count || 'N/A'}
Compression: ${(summaryMetadata.compression_ratio * 100).toFixed(1)}%
Reading Time: ${summaryMetadata.reading_time_minutes.toFixed(1)} minutes
` : ''}
    `.trim();
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `summary_${selectedDocument.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.txt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    toast.success("Summary exported as text file");
    
  } catch (error) {
    console.error("Text export error:", error);
    toast.error("Failed to export text");
  }
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
                            <DropdownMenuItem onClick={() => handleSummarizeDocument(doc)}>
                              <FileText className="w-4 h-4 mr-2" />
                              Summarize Document
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

      {/* Summarize Document Modal */}
      <Dialog open={summaryModalOpen} onOpenChange={setSummaryModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Summarize Document
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={resetModal}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogDescription>
              {selectedDocument ? `Generate a summary of "${selectedDocument.title}"` : "Select a document to summarize"}
            </DialogDescription>
          </DialogHeader>

          {selectedDocument && (
            <div className="space-y-4">
              {/* Document Info */}
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Document ID</p>
                    <p className="text-sm mono">{selectedDocument.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Version</p>
                    <p className="text-sm">v{selectedDocument.current_version}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm">{new Date(selectedDocument.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Visibility</p>
                    <p className="text-sm">{selectedDocument.visibility}</p>
                  </div>
                </div>
              </div>

              {/* Summarization Options */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Summarization Method</Label>
                  <Select value={summarizationMethod} onValueChange={setSummarizationMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {summarizationMethods.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          <div className="flex flex-col">
                            <span>{method.label}</span>
                            <span className="text-xs text-muted-foreground">{method.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxLength">Max Length (words)</Label>
                    <Input
                      id="maxLength"
                      type="number"
                      min="50"
                      max="2000"
                      value={maxLength}
                      onChange={(e) => setMaxLength(parseInt(e.target.value) || 500)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="temperature">Temperature (0.1-1.0)</Label>
                    <Input
                      id="temperature"
                      type="number"
                      min="0.1"
                      max="1.0"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.3)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instructions">Custom Instructions (Optional)</Label>
                  <Textarea
                    id="instructions"
                    placeholder="Add any specific instructions for the summary..."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              {/* Summary Display */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Summary</Label>
                  {documentSummary && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyToClipboard}
                        className="h-7 gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </Button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  {summaryLoading ? (
                    <div className="flex flex-col items-center justify-center h-48 border rounded-lg">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                      <span>Generating summary...</span>
                      <span className="text-sm text-muted-foreground mt-1">
                        This may take a few moments
                      </span>
                    </div>
                  ) : documentSummary ? (
                    <>
                      <div className="border rounded-lg p-4 min-h-[200px] max-h-[400px] overflow-y-auto bg-muted/5">
                        <pre className="whitespace-pre-wrap font-sans">{documentSummary}</pre>
                      </div>

                      {/* Document Analysis Section */}
                      {documentAnalysis && documentAnalysis.document_type && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <h4 className="font-semibold text-blue-800 mb-2">Document Analysis</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-600">Type:</span>
                              <span className="ml-2 font-medium">{documentAnalysis.document_type}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Sentiment:</span>
                              <span className="ml-2 font-medium">{documentAnalysis.sentiment || 'Neutral'}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Reading Time:</span>
                              <span className="ml-2 font-medium">
                                {documentAnalysis.estimated_reading_time?.toFixed(1) || 'N/A'} min
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Word Count:</span>
                              <span className="ml-2 font-medium">{documentAnalysis.word_count || 0}</span>
                            </div>
                          </div>
                          
                          {Array.isArray(documentAnalysis.topics) && documentAnalysis.topics.length > 0 && (
                            <div className="mt-2">
                              <span className="text-gray-600">Topics:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {documentAnalysis.topics.slice(0, 5).map((topic, index) => (
                                  <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {Array.isArray(documentAnalysis.key_entities) && documentAnalysis.key_entities.length > 0 && (
                            <div className="mt-2">
                              <span className="text-gray-600">Key Entities:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {documentAnalysis.key_entities.slice(0, 5).map((entity, index) => (
                                  <span key={index} className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                    {entity}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Summary Metadata */}
                      {summaryMetadata && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <span className="text-gray-600">Words:</span>
                              <span className="ml-1 font-medium">{summaryMetadata.word_count}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Reading Time:</span>
                              <span className="ml-1 font-medium">{summaryMetadata.reading_time_minutes.toFixed(1)} min</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Compression:</span>
                              <span className="ml-1 font-medium">{(summaryMetadata.compression_ratio * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            Method: {summaryMetadata.summary_type} • Model: {summaryMetadata.model_used}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="border rounded-lg p-8 text-center min-h-[200px] flex items-center justify-center">
                      <div className="space-y-2">
                        <FileText className="w-12 h-12 mx-auto text-muted-foreground/50" />
                        <p className="text-muted-foreground">No summary generated yet</p>
                        <p className="text-sm text-muted-foreground">
                          Configure options and click "Generate Summary"
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Previous Summaries Section */}
              {previousSummaries.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-gray-700 mb-2">Previous Summaries</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {previousSummaries.map((summary) => (
                      <div key={summary.id} className="p-2 border rounded hover:bg-gray-50">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium capitalize">{summary.summary_type}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(summary.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {summary.content.substring(0, 100)}...
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={resetModal}
            >
              Close
            </Button>
            
            {/* Before summary: Generate Summary button */}
            {!documentSummary && (
              <Button
                onClick={generateSummary}
                disabled={summaryLoading}
              >
                {summaryLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Summary"
                )}
              </Button>
            )}
            
            {/* After summary: Generate Again + Export buttons */}
            {documentSummary && (
              <>
                <Button
                  variant="outline"
                  onClick={generateSummary}
                  disabled={summaryLoading}
                >
                  {summaryLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    "Generate Again"
                  )}
                </Button>
                
                {/* Export Dropdown Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button>
                      <FileDown className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={exportToPDF}>
                      Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportToWord}>
                      Export as Word (.docx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportToText}>
                      Export as Text (.txt)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}