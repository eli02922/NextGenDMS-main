import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Upload, FileText, X, CheckCircle, Files, FolderOpen, Folder, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Helper function to extract text from file for analysis
const extractTextForAnalysis = async (file) => {
  return new Promise((resolve, reject) => {
    // For PDF files
    if (file.type === 'application/pdf') {
      // Note: In a real implementation, you would use a PDF parser like pdf-parse
      // For now, we'll extract from filename and limited content
      const reader = new FileReader();
      reader.onload = (e) => {
        // This is a simplified version - in production you'd use a proper PDF parser
        resolve({
          filename: file.name.toLowerCase(),
          content: e.target.result ? e.target.result.toString().substring(0, 5000) : ''
        });
      };
      reader.readAsArrayBuffer(file);
    } 
    // For text files
    else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          filename: file.name.toLowerCase(),
          content: e.target.result ? e.target.result.toString().substring(0, 5000) : ''
        });
      };
      reader.readAsText(file);
    }
    // For DOCX files
    else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const reader = new FileReader();
      reader.onload = (e) => {
        // Note: In production, use mammoth.js or similar to extract text from DOCX
        resolve({
          filename: file.name.toLowerCase(),
          content: file.name // Fallback to filename for DOCX
        });
      };
      reader.readAsArrayBuffer(file);
    }
    // For images (OCR would be needed in production)
    else if (file.type.startsWith('image/')) {
      resolve({
        filename: file.name.toLowerCase(),
        content: file.name // Fallback to filename
      });
    }
    else {
      resolve({
        filename: file.name.toLowerCase(),
        content: ''
      });
    }
  });
};

// AI-powered document type detection
const detectDocumentType = (filename, content = '') => {
  const financeKeywords = [
    'invoice', 'receipt', 'financial', 'statement', 'balance', 'sheet',
    'income', 'expense', 'budget', 'tax', 'payment', 'bank', 'transaction',
    'quarterly', 'annual', 'report', 'earnings', 'revenue', 'profit', 'loss',
    'audit', 'accounting', 'ledger', 'payroll'
  ];

  const complianceKeywords = [
    'compliance', 'policy', 'regulation', 'legal', 'contract', 'agreement',
    'terms', 'conditions', 'gdpr', 'hipaa', 'sarbanes-oxley', 'sox',
    'regulatory', 'requirement', 'standard', 'procedure', 'guideline',
    'framework', 'certification', 'audit', 'checklist', 'risk', 'assessment'
  ];

  const meetingKeywords = [
    'meeting', 'minutes', 'agenda', 'memo', 'notes', 'discussion',
    'action items', 'follow-up', 'summary', 'recap', 'attendees',
    'presentation', 'slides', 'deck', 'workshop', 'conference', 'call'
  ];

  // Combine filename and content for analysis
  const textToAnalyze = (filename + ' ' + content).toLowerCase();
  
  let financeScore = 0;
  let complianceScore = 0;
  let meetingScore = 0;

  // Score based on keywords
  financeKeywords.forEach(keyword => {
    if (textToAnalyze.includes(keyword)) financeScore++;
  });

  complianceKeywords.forEach(keyword => {
    if (textToAnalyze.includes(keyword)) complianceScore++;
  });

  meetingKeywords.forEach(keyword => {
    if (textToAnalyze.includes(keyword)) meetingScore++;
  });

  // Additional heuristics based on filename patterns
  if (filename.includes('minutes') || filename.includes('agenda')) {
    meetingScore += 3;
  }
  if (filename.includes('invoice') || filename.includes('receipt')) {
    financeScore += 3;
  }
  if (filename.includes('contract') || filename.includes('agreement')) {
    complianceScore += 3;
  }

  // Determine the highest score
  const scores = [
    { type: 'finance', score: financeScore },
    { type: 'compliance', score: complianceScore },
    { type: 'meeting', score: meetingScore }
  ];

  scores.sort((a, b) => b.score - a.score);

  // Only return a type if there's a clear winner (score > 0)
  if (scores[0].score > 0) {
    return scores[0].type;
  }

  return null;
};

// Function to update tags with detected document type
const updateTagsWithDocumentType = (currentTags, documentType) => {
  if (!documentType) return currentTags;
  
  // Remove existing document type tags
  const tagList = currentTags.split(',').map(tag => tag.trim()).filter(tag => tag);
  const filteredTags = tagList.filter(tag => 
    !['finance', 'compliance', 'meeting'].includes(tag.toLowerCase())
  );
  
  // Add new document type tag
  filteredTags.push(documentType);
  
  return filteredTags.join(', ');
};

export default function UploadPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [groups, setGroups] = useState([]);
  const [file, setFile] = useState(null);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [folderFiles, setFolderFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [detectingType, setDetectingType] = useState(false);
  const folderInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    visibility: "PRIVATE",
    group_id: "",
    tags: ""
  });
  
  const [bulkFormData, setBulkFormData] = useState({
    visibility: "PRIVATE",
    group_id: "",
    tags: ""
  });
  
  const [folderFormData, setFolderFormData] = useState({
    visibility: "PRIVATE",
    group_id: "",
    tags: "",
    preservePath: true
  });

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await axios.get(`${API}/groups`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setGroups(response.data);
      } catch (error) {
        console.error("Failed to load groups");
      }
    };
    fetchGroups();
  }, [token]);

  // Detect document type when file is selected
  useEffect(() => {
    const detectAndUpdateTags = async () => {
      if (!file) return;
      
      setDetectingType(true);
      try {
        const { filename, content } = await extractTextForAnalysis(file);
        const documentType = detectDocumentType(filename, content);
        
        if (documentType) {
          setFormData(prev => ({
            ...prev,
            tags: updateTagsWithDocumentType(prev.tags, documentType)
          }));
          
          // Show notification about detected type
          toast.info(`Detected as ${documentType} document`);
        }
      } catch (error) {
        console.error("Error detecting document type:", error);
      } finally {
        setDetectingType(false);
      }
    };
    
    detectAndUpdateTags();
  }, [file]);

  // Detect document types for bulk files
  useEffect(() => {
    const detectBulkDocumentTypes = async () => {
      if (bulkFiles.length === 0) return;
      
      // For bulk uploads, we'll detect the most common type among files
      let financeCount = 0;
      let complianceCount = 0;
      let meetingCount = 0;
      
      // Sample a few files for detection
      const sampleFiles = bulkFiles.slice(0, 5); // Limit to 5 files for performance
      
      for (const sampleFile of sampleFiles) {
        try {
          const { filename, content } = await extractTextForAnalysis(sampleFile);
          const documentType = detectDocumentType(filename, content);
          
          if (documentType === 'finance') financeCount++;
          else if (documentType === 'compliance') complianceCount++;
          else if (documentType === 'meeting') meetingCount++;
        } catch (error) {
          console.error("Error detecting document type:", error);
        }
      }
      
      // Determine the most common type
      if (financeCount > 0 || complianceCount > 0 || meetingCount > 0) {
        let detectedType = null;
        if (financeCount >= complianceCount && financeCount >= meetingCount) detectedType = 'finance';
        else if (complianceCount >= financeCount && complianceCount >= meetingCount) detectedType = 'compliance';
        else detectedType = 'meeting';
        
        // Update bulk tags
        setBulkFormData(prev => ({
          ...prev,
          tags: updateTagsWithDocumentType(prev.tags, detectedType)
        }));
        
        if (detectedType) {
          toast.info(`Most files appear to be ${detectedType} documents`);
        }
      }
    };
    
    detectBulkDocumentTypes();
  }, [bulkFiles]);

  const handleDrop = (e, type = "single") => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    
    if (type === "bulk") {
      setBulkFiles(prev => [...prev, ...droppedFiles]);
    } else if (type === "folder") {
      // Handle folder drop - extract files with paths
      const items = e.dataTransfer.items;
      if (items) {
        const filePromises = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i].webkitGetAsEntry();
          if (item) {
            filePromises.push(traverseFileTree(item));
          }
        }
        Promise.all(filePromises).then(results => {
          const allFiles = results.flat();
          setFolderFiles(prev => [...prev, ...allFiles]);
        });
      } else {
        setFolderFiles(prev => [...prev, ...droppedFiles.map(f => ({ file: f, path: f.name }))]);
      }
    } else {
      const droppedFile = droppedFiles[0];
      if (droppedFile) {
        setFile(droppedFile);
        if (!formData.title) {
          setFormData(prev => ({ ...prev, title: droppedFile.name.replace(/\.[^/.]+$/, "") }));
        }
      }
    }
  };

  // Recursively traverse folder structure
  const traverseFileTree = (item, path = "") => {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file((file) => {
          resolve([{ file, path: path + file.name }]);
        });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        dirReader.readEntries((entries) => {
          const promises = entries.map(entry => 
            traverseFileTree(entry, path + item.name + "/")
          );
          Promise.all(promises).then(results => {
            resolve(results.flat());
          });
        });
      }
    });
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!formData.title) {
        setFormData(prev => ({ ...prev, title: selectedFile.name.replace(/\.[^/.]+$/, "") }));
      }
    }
  };

  const handleBulkFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setBulkFiles(prev => [...prev, ...selectedFiles]);
  };

  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const filesWithPaths = files.map(file => ({
      file,
      path: file.webkitRelativePath || file.name
    }));
    setFolderFiles(prev => [...prev, ...filesWithPaths]);
  };

  const removeBulkFile = (index) => {
    setBulkFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeFolderFile = (index) => {
    setFolderFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Manually trigger document type detection
  const detectDocumentTypeManually = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }
    
    setDetectingType(true);
    try {
      const { filename, content } = await extractTextForAnalysis(file);
      const documentType = detectDocumentType(filename, content);
      
      if (documentType) {
        setFormData(prev => ({
          ...prev,
          tags: updateTagsWithDocumentType(prev.tags, documentType)
        }));
        toast.success(`Detected as ${documentType} document`);
      } else {
        toast.info("Could not determine document type");
      }
    } catch (error) {
      toast.error("Error detecting document type");
      console.error(error);
    } finally {
      setDetectingType(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file");
      return;
    }
    if (!formData.title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("title", formData.title);
      data.append("description", formData.description);
      data.append("visibility", formData.visibility);
      if (formData.group_id) data.append("group_id", formData.group_id);
      data.append("tags", formData.tags);

      const response = await axios.post(`${API}/documents`, data, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      toast.success("Document uploaded successfully");
      navigate(`/documents/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (bulkFiles.length === 0) {
      toast.error("Please select files to upload");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const data = new FormData();
      bulkFiles.forEach(file => {
        data.append("files", file);
      });
      data.append("visibility", bulkFormData.visibility);
      if (bulkFormData.group_id) data.append("group_id", bulkFormData.group_id);
      data.append("tags", bulkFormData.tags);

      const response = await axios.post(`${API}/documents/bulk`, data, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      const { successful, failed, errors } = response.data;
      
      if (successful > 0) {
        toast.success(`${successful} document(s) uploaded successfully`);
      }
      if (failed > 0) {
        toast.error(`${failed} document(s) failed to upload`);
        errors.forEach(err => {
          console.error(`Failed: ${err.filename} - ${err.error}`);
        });
      }
      
      setBulkFiles([]);
      if (successful > 0) {
        navigate("/documents");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Bulk upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFolderSubmit = async (e) => {
    e.preventDefault();
    if (folderFiles.length === 0) {
      toast.error("Please select a folder to upload");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const data = new FormData();
      folderFiles.forEach(({ file, path }) => {
        data.append("files", file);
        // If preserving path, add path info as tag
        if (folderFormData.preservePath && path.includes("/")) {
          const folderPath = path.substring(0, path.lastIndexOf("/"));
          data.append("paths", folderPath);
        }
      });
      data.append("visibility", folderFormData.visibility);
      if (folderFormData.group_id) data.append("group_id", folderFormData.group_id);
      
      // Add folder path as tag if preserving structure
      let tags = folderFormData.tags;
      if (folderFormData.preservePath && folderFiles.length > 0) {
        const rootFolder = folderFiles[0].path.split("/")[0];
        tags = tags ? `${tags},folder:${rootFolder}` : `folder:${rootFolder}`;
      }
      data.append("tags", tags);

      const response = await axios.post(`${API}/documents/bulk`, data, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      const { successful, failed, errors } = response.data;
      
      if (successful > 0) {
        toast.success(`${successful} file(s) from folder uploaded successfully`);
      }
      if (failed > 0) {
        toast.error(`${failed} file(s) failed to upload`);
        errors.forEach(err => {
          console.error(`Failed: ${err.filename} - ${err.error}`);
        });
      }
      
      setFolderFiles([]);
      if (successful > 0) {
        navigate("/documents");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Folder upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-heading font-bold">Upload Documents</h1>
        <p className="text-muted-foreground mt-1">Add documents to your library with AI-powered tagging</p>
      </div>

      <Tabs defaultValue="single">
        <TabsList className="mb-6">
          <TabsTrigger value="single" data-testid="single-upload-tab">
            <Upload className="w-4 h-4 mr-2" />
            Single
          </TabsTrigger>
          <TabsTrigger value="bulk" data-testid="bulk-upload-tab">
            <Files className="w-4 h-4 mr-2" />
            Multiple Files
          </TabsTrigger>
          <TabsTrigger value="folder" data-testid="folder-upload-tab">
            <FolderOpen className="w-4 h-4 mr-2" />
            Folder
          </TabsTrigger>
        </TabsList>

        {/* Single Upload */}
        <TabsContent value="single">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Upload Area */}
            <Card className="border">
              <CardContent className="p-6">
                <div
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragOver ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => handleDrop(e, false)}
                  data-testid="drop-zone"
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-4">
                      <div className="w-12 h-12 rounded bg-primary/5 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                        {detectingType && (
                          <p className="text-xs text-primary flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Analyzing document type...
                          </p>
                        )}
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setFile(null)}
                        data-testid="remove-file"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                      <p className="text-lg font-medium mb-1">Drop your file here</p>
                      <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                      <Input
                        type="file"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleFileSelect}
                        data-testid="file-input"
                      />
                      <p className="text-xs text-muted-foreground">
                        Supported: PDF, DOCX, TXT, Images (AI-powered tagging)
                      </p>
                    </>
                  )}
                </div>
                
                {/* Detect Type Button */}
                {file && !detectingType && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={detectDocumentTypeManually}
                      className="text-xs"
                    >
                      <Loader2 className="w-3 h-3 mr-1" />
                      Re-detect Document Type
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Metadata */}
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-lg font-heading">Document Details</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <span>AI will automatically detect document type and add tags</span>
                  {detectingType && <Loader2 className="w-3 h-3 animate-spin" />}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="Enter document title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    required
                    data-testid="title-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    data-testid="description-input"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Visibility</Label>
                    <Select 
                      value={formData.visibility} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, visibility: value }))}
                    >
                      <SelectTrigger data-testid="visibility-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRIVATE">Private - Only you</SelectItem>
                        <SelectItem value="GROUP">Group - Shared with group</SelectItem>
                        <SelectItem value="ORG">Organization - Everyone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.visibility === "GROUP" && (
                    <div className="space-y-2">
                      <Label>Group</Label>
                      <Select 
                        value={formData.group_id} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, group_id: value }))}
                      >
                        <SelectTrigger data-testid="group-select">
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map(group => (
                            <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <div className="relative">
                    <Input
                      id="tags"
                      placeholder="AI will auto-detect document type and add tags..."
                      value={formData.tags}
                      onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                      data-testid="tags-input"
                      disabled
                    />
                    {detectingType && (
                      <div className="absolute right-2 top-2">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progress & Submit */}
            {uploading && (
              <Progress value={uploadProgress} className="h-2" />
            )}

            <div className="flex gap-3 justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => navigate(-1)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={uploading || !file}
                className="btn-hover"
                data-testid="submit-upload"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                    Uploading... {uploadProgress}%
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Upload Document
                  </>
                )}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Bulk Upload */}
        <TabsContent value="bulk">
          <form onSubmit={handleBulkSubmit} className="space-y-6">
            {/* Bulk File Upload Area */}
            <Card className="border">
              <CardContent className="p-6">
                <div
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragOver ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => handleDrop(e, "bulk")}
                  data-testid="bulk-drop-zone"
                >
                  <Files className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-1">Drop multiple files here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                  <Input
                    type="file"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleBulkFileSelect}
                    data-testid="bulk-file-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    Select multiple files at once. AI will detect document types and suggest tags.
                  </p>
                </div>

                {/* File List */}
                {bulkFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{bulkFiles.length} file(s) selected</p>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setBulkFiles([])}
                      >
                        Clear all
                      </Button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {bulkFiles.map((file, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-2 rounded bg-muted"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                            <span className="text-sm truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatFileSize(file.size)}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeBulkFile(index)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bulk Settings */}
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-lg font-heading">Bulk Upload Settings</CardTitle>
                <CardDescription>These settings apply to all uploaded files</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Visibility</Label>
                    <Select 
                      value={bulkFormData.visibility} 
                      onValueChange={(value) => setBulkFormData(prev => ({ ...prev, visibility: value }))}
                    >
                      <SelectTrigger data-testid="bulk-visibility-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRIVATE">Private - Only you</SelectItem>
                        <SelectItem value="GROUP">Group - Shared with group</SelectItem>
                        <SelectItem value="ORG">Organization - Everyone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {bulkFormData.visibility === "GROUP" && (
                    <div className="space-y-2">
                      <Label>Group</Label>
                      <Select 
                        value={bulkFormData.group_id} 
                        onValueChange={(value) => setBulkFormData(prev => ({ ...prev, group_id: value }))}
                      >
                        <SelectTrigger data-testid="bulk-group-select">
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map(group => (
                            <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bulk-tags">Tags (applied to all files)</Label>
                  <Input
                    id="bulk-tags"
                    placeholder="AI will auto-detect common document types..."
                    value={bulkFormData.tags}
                    onChange={(e) => setBulkFormData(prev => ({ ...prev, tags: e.target.value }))}
                    data-testid="bulk-tags-input"
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentTags = bulkFormData.tags.split(',').map(t => t.trim()).filter(t => t);
                        if (!currentTags.includes('finance')) {
                          const newTags = [...currentTags, 'finance'].join(', ');
                          setBulkFormData(prev => ({ ...prev, tags: newTags }));
                        }
                      }}
                      className={`text-xs ${bulkFormData.tags.toLowerCase().includes('finance') ? 'bg-green-50 border-green-200 text-green-700' : ''}`}
                    >
                      Finance
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentTags = bulkFormData.tags.split(',').map(t => t.trim()).filter(t => t);
                        if (!currentTags.includes('compliance')) {
                          const newTags = [...currentTags, 'compliance'].join(', ');
                          setBulkFormData(prev => ({ ...prev, tags: newTags }));
                        }
                      }}
                      className={`text-xs ${bulkFormData.tags.toLowerCase().includes('compliance') ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}
                    >
                      Compliance
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentTags = bulkFormData.tags.split(',').map(t => t.trim()).filter(t => t);
                        if (!currentTags.includes('meeting')) {
                          const newTags = [...currentTags, 'meeting'].join(', ');
                          setBulkFormData(prev => ({ ...prev, tags: newTags }));
                        }
                      }}
                      className={`text-xs ${bulkFormData.tags.toLowerCase().includes('meeting') ? 'bg-purple-50 border-purple-200 text-purple-700' : ''}`}
                    >
                      Meeting
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progress & Submit */}
            {uploading && (
              <Progress value={uploadProgress} className="h-2" />
            )}

            <div className="flex gap-3 justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => navigate(-1)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={uploading || bulkFiles.length === 0}
                className="btn-hover"
                data-testid="submit-bulk-upload"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                    Uploading... {uploadProgress}%
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Upload {bulkFiles.length} File(s)
                  </>
                )}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Folder Upload */}
        <TabsContent value="folder">
          <form onSubmit={handleFolderSubmit} className="space-y-6">
            {/* Folder Upload Area */}
            <Card className="border">
              <CardContent className="p-6">
                <div
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragOver ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => handleDrop(e, "folder")}
                  data-testid="folder-drop-zone"
                >
                  <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-1">Drop a folder here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to select a folder</p>
                  <input
                    ref={folderInputRef}
                    type="file"
                    webkitdirectory=""
                    directory=""
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFolderSelect}
                    data-testid="folder-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    All files in the folder will be uploaded. AI will detect document types.
                  </p>
                </div>

                {/* Folder Files List */}
                {folderFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        <Folder className="w-4 h-4 inline mr-2" />
                        {folderFiles.length} file(s) from folder
                      </p>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setFolderFiles([])}
                      >
                        Clear all
                      </Button>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1 border rounded p-2">
                      {folderFiles.map(({ file, path }, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-2 rounded bg-muted text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{file.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{path}</span>
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatFileSize(file.size)}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => removeFolderFile(index)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Folder Settings */}
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-lg font-heading">Folder Upload Settings</CardTitle>
                <CardDescription>Configure how folder contents are uploaded</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="preserve-path"
                    checked={folderFormData.preservePath}
                    onChange={(e) => setFolderFormData(prev => ({ ...prev, preservePath: e.target.checked }))}
                    className="rounded"
                    data-testid="preserve-path-checkbox"
                  />
                  <Label htmlFor="preserve-path" className="cursor-pointer">
                    Preserve folder structure as tags
                  </Label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Visibility</Label>
                    <Select 
                      value={folderFormData.visibility} 
                      onValueChange={(value) => setFolderFormData(prev => ({ ...prev, visibility: value }))}
                    >
                      <SelectTrigger data-testid="folder-visibility-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRIVATE">Private - Only you</SelectItem>
                        <SelectItem value="GROUP">Group - Shared with group</SelectItem>
                        <SelectItem value="ORG">Organization - Everyone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {folderFormData.visibility === "GROUP" && (
                    <div className="space-y-2">
                      <Label>Group</Label>
                      <Select 
                        value={folderFormData.group_id} 
                        onValueChange={(value) => setFolderFormData(prev => ({ ...prev, group_id: value }))}
                      >
                        <SelectTrigger data-testid="folder-group-select">
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map(group => (
                            <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="folder-tags">Additional Tags</Label>
                  <Input
                    id="folder-tags"
                    placeholder="AI will detect document types from folder contents"
                    value={folderFormData.tags}
                    onChange={(e) => setFolderFormData(prev => ({ ...prev, tags: e.target.value }))}
                    data-testid="folder-tags-input"
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentTags = folderFormData.tags.split(',').map(t => t.trim()).filter(t => t);
                        if (!currentTags.includes('finance')) {
                          const newTags = [...currentTags, 'finance'].join(', ');
                          setFolderFormData(prev => ({ ...prev, tags: newTags }));
                        }
                      }}
                      className={`text-xs ${folderFormData.tags.toLowerCase().includes('finance') ? 'bg-green-50 border-green-200 text-green-700' : ''}`}
                    >
                      Finance
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentTags = folderFormData.tags.split(',').map(t => t.trim()).filter(t => t);
                        if (!currentTags.includes('compliance')) {
                          const newTags = [...currentTags, 'compliance'].join(', ');
                          setFolderFormData(prev => ({ ...prev, tags: newTags }));
                        }
                      }}
                      className={`text-xs ${folderFormData.tags.toLowerCase().includes('compliance') ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}
                    >
                      Compliance
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentTags = folderFormData.tags.split(',').map(t => t.trim()).filter(t => t);
                        if (!currentTags.includes('meeting')) {
                          const newTags = [...currentTags, 'meeting'].join(', ');
                          setFolderFormData(prev => ({ ...prev, tags: newTags }));
                        }
                      }}
                      className={`text-xs ${folderFormData.tags.toLowerCase().includes('meeting') ? 'bg-purple-50 border-purple-200 text-purple-700' : ''}`}
                    >
                      Meeting
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progress & Submit */}
            {uploading && (
              <Progress value={uploadProgress} className="h-2" />
            )}

            <div className="flex gap-3 justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => navigate(-1)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={uploading || folderFiles.length === 0}
                className="btn-hover"
                data-testid="submit-folder-upload"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                    Uploading... {uploadProgress}%
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Upload Folder ({folderFiles.length} files)
                  </>
                )}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}