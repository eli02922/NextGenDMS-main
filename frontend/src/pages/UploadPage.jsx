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
import { 
  Upload, FileText, X, CheckCircle, Files, FolderOpen, Folder, Loader2,
  Image, File, FileSpreadsheet, FileCode, Archive, Music, Video, Database
} from "lucide-react";
import { toast } from "sonner";

// File type icons mapping
const getFileIcon = (mimeType, category) => {
  if (category === "image") return <Image className="w-4 h-4 text-blue-500" />;
  if (category === "spreadsheet") return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
  if (category === "pdf") return <FileText className="w-4 h-4 text-red-500" />;
  if (category === "word_processing") return <FileText className="w-4 h-4 text-blue-600" />;
  if (category === "presentation") return <FileText className="w-4 h-4 text-orange-500" />;
  if (category === "archive") return <Archive className="w-4 h-4 text-yellow-600" />;
  if (category === "text") return <FileCode className="w-4 h-4 text-gray-500" />;
  if (category === "audio") return <Music className="w-4 h-4 text-purple-500" />;
  if (category === "video") return <Video className="w-4 h-4 text-pink-500" />;
  if (category === "database") return <Database className="w-4 h-4 text-indigo-500" />;
  return <File className="w-4 h-4 text-gray-400" />;
};

// Extended document types based on backend categories
const DOCUMENT_CATEGORIES = {
  word_processing: { label: "Document", color: "text-blue-600", bg: "bg-blue-50" },
  spreadsheet: { label: "Spreadsheet", color: "text-green-600", bg: "bg-green-50" },
  presentation: { label: "Presentation", color: "text-orange-600", bg: "bg-orange-50" },
  pdf: { label: "PDF", color: "text-red-600", bg: "bg-red-50" },
  image: { label: "Image", color: "text-blue-500", bg: "bg-blue-50" },
  text: { label: "Text", color: "text-gray-600", bg: "bg-gray-50" },
  archive: { label: "Archive", color: "text-yellow-600", bg: "bg-yellow-50" },
  email: { label: "Email", color: "text-indigo-600", bg: "bg-indigo-50" },
  database: { label: "Database", color: "text-purple-600", bg: "bg-purple-50" },
  cad: { label: "CAD", color: "text-cyan-600", bg: "bg-cyan-50" },
  ebook: { label: "eBook", color: "text-pink-600", bg: "bg-pink-50" },
  audio: { label: "Audio", color: "text-purple-600", bg: "bg-purple-50" },
  video: { label: "Video", color: "text-pink-600", bg: "bg-pink-50" },
  unknown: { label: "Unknown", color: "text-gray-400", bg: "bg-gray-100" }
};

// Enhanced file analysis with backend-like detection
const analyzeFileContent = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const arrayBuffer = e.target.result;
      const bytes = new Uint8Array(arrayBuffer);
      
      // Detect mime type from magic bytes (simplified client-side detection)
      let mimeType = file.type;
      let category = "unknown";
      
      // PDF detection
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        mimeType = "application/pdf";
        category = "pdf";
      }
      // PNG
      else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        mimeType = "image/png";
        category = "image";
      }
      // JPEG
      else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
        mimeType = "image/jpeg";
        category = "image";
      }
      // ZIP/DOCX/XLSX/PPTX
      else if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
        if (file.name.endsWith('.docx')) {
          category = "word_processing";
        } else if (file.name.endsWith('.xlsx')) {
          category = "spreadsheet";
        } else if (file.name.endsWith('.pptx')) {
          category = "presentation";
        } else {
          category = "archive";
        }
      }
      // Text files
      else if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        category = "text";
      }
      // Audio
      else if (file.type.startsWith('audio/')) {
        category = "audio";
      }
      // Video
      else if (file.type.startsWith('video/')) {
        category = "video";
      }
      // JSON
      else if (file.name.endsWith('.json')) {
        category = "text";
        mimeType = "application/json";
      }
      // XML
      else if (file.name.endsWith('.xml')) {
        category = "text";
        mimeType = "application/xml";
      }
      // CSV
      else if (file.name.endsWith('.csv')) {
        category = "spreadsheet";
        mimeType = "text/csv";
      }
      
      // Extract text content for analysis (for text-based files)
      let textContent = "";
      if (category === "text" || file.type.startsWith('text/')) {
        try {
          const decoder = new TextDecoder('utf-8');
          textContent = decoder.decode(arrayBuffer).substring(0, 5000);
        } catch (error) {
          console.error("Error decoding text:", error);
        }
      } else {
        // For binary files, use filename only
        textContent = file.name;
      }
      
      resolve({
        filename: file.name.toLowerCase(),
        content: textContent,
        mimeType,
        category
      });
    };
    
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Enhanced document type detection with more categories
const detectDocumentType = (filename, content = '', category = '') => {
  const textToAnalyze = (filename + ' ' + content).toLowerCase();
  
  const keywordGroups = {
    finance: {
      keywords: [
        'invoice', 'receipt', 'financial', 'statement', 'balance', 'sheet',
        'income', 'expense', 'budget', 'tax', 'payment', 'bank', 'transaction',
        'quarterly', 'annual', 'report', 'earnings', 'revenue', 'profit', 'loss',
        'audit', 'accounting', 'ledger', 'payroll', '10-k', '10-q', 'sec filing'
      ],
      score: 0
    },
    compliance: {
      keywords: [
        'compliance', 'policy', 'regulation', 'legal', 'contract', 'agreement',
        'terms', 'conditions', 'gdpr', 'hipaa', 'sarbanes-oxley', 'sox',
        'regulatory', 'requirement', 'standard', 'procedure', 'guideline',
        'framework', 'certification', 'risk', 'assessment', 'non-disclosure', 'nda'
      ],
      score: 0
    },
    meeting: {
      keywords: [
        'meeting', 'minutes', 'agenda', 'memo', 'notes', 'discussion',
        'action items', 'follow-up', 'summary', 'recap', 'attendees',
        'presentation', 'slides', 'deck', 'workshop', 'conference', 'call',
        'board meeting', 'steering committee', 'team sync'
      ],
      score: 0
    },
    technical: {
      keywords: [
        'specification', 'technical', 'api', 'documentation', 'guide',
        'manual', 'installation', 'configuration', 'developer', 'code',
        'architecture', 'design', 'protocol', 'standard', 'reference'
      ],
      score: 0
    },
    hr: {
      keywords: [
        'resume', 'cv', 'job description', 'interview', 'employee',
        'onboarding', 'performance review', 'evaluation', 'hiring',
        'recruitment', 'offer letter', 'contractor', 'timesheet'
      ],
      score: 0
    },
    marketing: {
      keywords: [
        'marketing', 'campaign', 'advertising', 'brand', 'social media',
        'content', 'newsletter', 'press release', 'blog', 'seo',
        'analytics', 'market research', 'customer feedback'
      ],
      score: 0
    }
  };
  
  // Score based on keywords
  for (const [type, group] of Object.entries(keywordGroups)) {
    for (const keyword of group.keywords) {
      if (textToAnalyze.includes(keyword)) {
        group.score += 1;
        // Bonus for exact matches
        if (textToAnalyze.includes(` ${keyword} `)) {
          group.score += 1;
        }
      }
    }
  }
  
  // Bonus based on file category
  if (category === 'spreadsheet') {
    keywordGroups.finance.score += 2;
  }
  if (category === 'presentation') {
    keywordGroups.meeting.score += 2;
  }
  if (category === 'text') {
    keywordGroups.technical.score += 1;
  }
  
  // Bonus based on filename patterns
  const filenameLower = filename.toLowerCase();
  if (filenameLower.includes('minutes') || filenameLower.includes('agenda')) {
    keywordGroups.meeting.score += 3;
  }
  if (filenameLower.includes('invoice') || filenameLower.includes('receipt')) {
    keywordGroups.finance.score += 3;
  }
  if (filenameLower.includes('contract') || filenameLower.includes('agreement')) {
    keywordGroups.compliance.score += 3;
  }
  if (filenameLower.includes('spec') || filenameLower.includes('api')) {
    keywordGroups.technical.score += 3;
  }
  if (filenameLower.includes('resume') || filenameLower.includes('cv')) {
    keywordGroups.hr.score += 3;
  }
  if (filenameLower.includes('campaign') || filenameLower.includes('marketing')) {
    keywordGroups.marketing.score += 3;
  }
  
  // Find highest score
  let bestType = null;
  let bestScore = 2; // Minimum threshold
  
  for (const [type, group] of Object.entries(keywordGroups)) {
    if (group.score > bestScore) {
      bestScore = group.score;
      bestType = type;
    }
  }
  
  return bestType;
};

// Update tags with detected document type
const updateTagsWithDocumentType = (currentTags, documentType) => {
  if (!documentType) return currentTags;
  
  const tagList = currentTags.split(',').map(tag => tag.trim()).filter(tag => tag);
  const filteredTags = tagList.filter(tag => 
    !['finance', 'compliance', 'meeting', 'technical', 'hr', 'marketing'].includes(tag.toLowerCase())
  );
  
  if (!filteredTags.includes(documentType)) {
    filteredTags.push(documentType);
  }
  
  return filteredTags.join(', ');
};

// Get category display info
const getCategoryDisplay = (category) => {
  return DOCUMENT_CATEGORIES[category] || DOCUMENT_CATEGORIES.unknown;
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
  const [analyzingFiles, setAnalyzingFiles] = useState(false);
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

  // Analyze single file when selected
  useEffect(() => {
    const analyzeSingleFile = async () => {
      if (!file) return;
      
      setDetectingType(true);
      try {
        const analysis = await analyzeFileContent(file.file);
        const documentType = detectDocumentType(analysis.filename, analysis.content, analysis.category);
        
        setFile(prev => prev ? {
          ...prev,
          analysis,
          documentType,
          category: analysis.category
        } : null);
        
        if (documentType) {
          setFormData(prev => ({
            ...prev,
            tags: updateTagsWithDocumentType(prev.tags, documentType)
          }));
          
          const categoryInfo = getCategoryDisplay(analysis.category);
          toast.info(`Detected as ${documentType} document (${categoryInfo.label})`);
        } else if (analysis.category !== 'unknown') {
          const categoryInfo = getCategoryDisplay(analysis.category);
          toast.info(`Detected as ${categoryInfo.label} file`);
        }
      } catch (error) {
        console.error("Error analyzing file:", error);
        toast.error("Error detecting document type");
      } finally {
        setDetectingType(false);
      }
    };
    
    analyzeSingleFile();
  }, [file]);

  // Analyze bulk files
  useEffect(() => {
    const analyzeBulkFiles = async () => {
      if (bulkFiles.length === 0 || analyzingFiles) return;
      
      setAnalyzingFiles(true);
      const analyzed = [];
      const typeCounts = {};
      
      // Analyze up to 10 files for performance
      const filesToAnalyze = bulkFiles.slice(0, 10);
      
      for (const uploadedFile of filesToAnalyze) {
        if (!uploadedFile.analysis) {
          try {
            const analysis = await analyzeFileContent(uploadedFile.file);
            const documentType = detectDocumentType(analysis.filename, analysis.content, analysis.category);
            
            analyzed.push({
              ...uploadedFile,
              analysis,
              documentType,
              category: analysis.category
            });
            
            if (documentType) {
              typeCounts[documentType] = (typeCounts[documentType] || 0) + 1;
            }
          } catch (error) {
            console.error("Error analyzing file:", error);
            analyzed.push(uploadedFile);
          }
        } else {
          analyzed.push(uploadedFile);
          if (uploadedFile.documentType) {
            typeCounts[uploadedFile.documentType] = (typeCounts[uploadedFile.documentType] || 0) + 1;
          }
        }
      }
      
      // Update bulk files with analyzed data
      const updatedFiles = bulkFiles.map(f => {
        const analyzedFile = analyzed.find(a => a.file === f.file);
        return analyzedFile || f;
      });
      setBulkFiles(updatedFiles);
      
      // Determine most common type
      let mostCommonType = null;
      let maxCount = 0;
      for (const [type, count] of Object.entries(typeCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostCommonType = type;
        }
      }
      
      if (mostCommonType && maxCount >= 2) {
        setBulkFormData(prev => ({
          ...prev,
          tags: updateTagsWithDocumentType(prev.tags, mostCommonType)
        }));
        toast.info(`Most files appear to be ${mostCommonType} documents`);
      }
      
      setAnalyzingFiles(false);
    };
    
    analyzeBulkFiles();
  }, [bulkFiles.length]);

  // Analyze folder files
  useEffect(() => {
    const analyzeFolderFiles = async () => {
      if (folderFiles.length === 0 || analyzingFiles) return;
      
      setAnalyzingFiles(true);
      const analyzed = [];
      const typeCounts = {};
      
      // Analyze up to 10 files for performance
      const filesToAnalyze = folderFiles.slice(0, 10);
      
      for (const uploadedFile of filesToAnalyze) {
        if (!uploadedFile.analysis) {
          try {
            const analysis = await analyzeFileContent(uploadedFile.file);
            const documentType = detectDocumentType(analysis.filename, analysis.content, analysis.category);
            
            analyzed.push({
              ...uploadedFile,
              analysis,
              documentType,
              category: analysis.category
            });
            
            if (documentType) {
              typeCounts[documentType] = (typeCounts[documentType] || 0) + 1;
            }
          } catch (error) {
            console.error("Error analyzing file:", error);
            analyzed.push(uploadedFile);
          }
        } else {
          analyzed.push(uploadedFile);
          if (uploadedFile.documentType) {
            typeCounts[uploadedFile.documentType] = (typeCounts[uploadedFile.documentType] || 0) + 1;
          }
        }
      }
      
      // Update folder files with analyzed data
      const updatedFiles = folderFiles.map(f => {
        const analyzedFile = analyzed.find(a => a.file === f.file);
        return analyzedFile || f;
      });
      setFolderFiles(updatedFiles);
      
      // Determine most common type
      let mostCommonType = null;
      let maxCount = 0;
      for (const [type, count] of Object.entries(typeCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostCommonType = type;
        }
      }
      
      if (mostCommonType && maxCount >= 2) {
        setFolderFormData(prev => ({
          ...prev,
          tags: updateTagsWithDocumentType(prev.tags, mostCommonType)
        }));
        toast.info(`Most files appear to be ${mostCommonType} documents`);
      }
      
      setAnalyzingFiles(false);
    };
    
    analyzeFolderFiles();
  }, [folderFiles.length]);

  const handleDrop = (e, type = "single") => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    
    if (type === "bulk") {
      const newFiles = droppedFiles.map(file => ({ file, path: file.name }));
      setBulkFiles(prev => [...prev, ...newFiles]);
    } else if (type === "folder") {
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
        const newFiles = droppedFiles.map(file => ({ file, path: file.name }));
        setFolderFiles(prev => [...prev, ...newFiles]);
      }
    } else {
      const droppedFile = droppedFiles[0];
      if (droppedFile) {
        setFile({ file: droppedFile, path: droppedFile.name });
        if (!formData.title) {
          setFormData(prev => ({ ...prev, title: droppedFile.name.replace(/\.[^/.]+$/, "") }));
        }
      }
    }
  };

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
      } else {
        resolve([]);
      }
    });
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile({ file: selectedFile, path: selectedFile.name });
      if (!formData.title) {
        setFormData(prev => ({ ...prev, title: selectedFile.name.replace(/\.[^/.]+$/, "") }));
      }
    }
  };

  const handleBulkFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles = selectedFiles.map(file => ({ file, path: file.name }));
    setBulkFiles(prev => [...prev, ...newFiles]);
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

  const detectDocumentTypeManually = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }
    
    setDetectingType(true);
    try {
      const analysis = await analyzeFileContent(file.file);
      const documentType = detectDocumentType(analysis.filename, analysis.content, analysis.category);
      
      if (documentType) {
        setFile(prev => prev ? { ...prev, analysis, documentType, category: analysis.category } : null);
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
      data.append("file", file.file);
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
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
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
      bulkFiles.forEach(({ file }) => {
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
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      });

      const { successful, failed, errors } = response.data;
      
      if (successful > 0) {
        toast.success(`${successful} document(s) uploaded successfully`);
      }
      if (failed > 0) {
        toast.error(`${failed} document(s) failed to upload`);
        errors.forEach((err) => {
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
        // If preserving path, add path info as metadata
        if (folderFormData.preservePath && path && path.includes("/")) {
          const folderPath = path.substring(0, path.lastIndexOf("/"));
          data.append("paths", folderPath);
        }
      });
      data.append("visibility", folderFormData.visibility);
      if (folderFormData.group_id) data.append("group_id", folderFormData.group_id);
      
      // Add folder path as tag if preserving structure
      let tags = folderFormData.tags;
      if (folderFormData.preservePath && folderFiles.length > 0) {
        const rootFolder = folderFiles[0].path?.split("/")[0] || "folder";
        tags = tags ? `${tags},folder:${rootFolder}` : `folder:${rootFolder}`;
      }
      data.append("tags", tags);

      const response = await axios.post(`${API}/documents/bulk`, data, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      });

      const { successful, failed, errors } = response.data;
      
      if (successful > 0) {
        toast.success(`${successful} file(s) from folder uploaded successfully`);
      }
      if (failed > 0) {
        toast.error(`${failed} file(s) failed to upload`);
        errors.forEach((err) => {
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

  const renderFilePreview = (uploadedFile, showPath = false) => {
    const categoryInfo = uploadedFile.category ? getCategoryDisplay(uploadedFile.category) : getCategoryDisplay("unknown");
    
    return (
      <div className="flex items-center justify-between p-2 rounded bg-muted">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {getFileIcon(uploadedFile.file.type, uploadedFile.category || "")}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{uploadedFile.file.name}</span>
              {uploadedFile.documentType && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${categoryInfo.bg} ${categoryInfo.color}`}>
                  {uploadedFile.documentType}
                </span>
              )}
              {uploadedFile.category && uploadedFile.category !== 'unknown' && !uploadedFile.documentType && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${categoryInfo.bg} ${categoryInfo.color}`}>
                  {categoryInfo.label}
                </span>
              )}
            </div>
            {showPath && uploadedFile.path && (
              <span className="text-xs text-muted-foreground block truncate">{uploadedFile.path}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatFileSize(uploadedFile.file.size)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-heading font-bold">Upload Documents</h1>
        <p className="text-muted-foreground mt-1">
          Add documents to your library with AI-powered detection for all file types
        </p>
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
                  onDrop={(e) => handleDrop(e, "single")}
                  data-testid="drop-zone"
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-4">
                      <div className="w-12 h-12 rounded bg-primary/5 flex items-center justify-center">
                        {getFileIcon(file.file.type, file.category || "")}
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium">{file.file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(file.file.size)}</p>
                        {file.documentType && (
                          <p className="text-xs text-primary">
                            Detected: {file.documentType}
                          </p>
                        )}
                        {file.category && file.category !== 'unknown' && !file.documentType && (
                          <p className="text-xs text-muted-foreground">
                            Type: {getCategoryDisplay(file.category).label}
                          </p>
                        )}
                        {detectingType && (
                          <p className="text-xs text-primary flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Analyzing document...
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
                        Supports all document types: PDF, Word, Excel, PowerPoint, Images, Text, Archives, and more
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
                      disabled={detectingType}
                    />
                    {detectingType && (
                      <div className="absolute right-2 top-2">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['finance', 'compliance', 'meeting', 'technical', 'hr', 'marketing'].map(type => (
                      <Button
                        key={type}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentTags = formData.tags.split(',').map(t => t.trim()).filter(t => t);
                          if (!currentTags.includes(type)) {
                            const newTags = [...currentTags, type].join(', ');
                            setFormData(prev => ({ ...prev, tags: newTags }));
                          } else {
                            const newTags = currentTags.filter(t => t !== type).join(', ');
                            setFormData(prev => ({ ...prev, tags: newTags }));
                          }
                        }}
                        className={`text-xs ${formData.tags.toLowerCase().includes(type) ? 'bg-primary/10 border-primary text-primary' : ''}`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Button>
                    ))}
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
                    Supports all document types. AI will detect document types and suggest tags.
                  </p>
                </div>

                {/* File List */}
                {bulkFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {bulkFiles.length} file(s) selected
                        {analyzingFiles && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                            Analyzing...
                          </span>
                        )}
                      </p>
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
                      {bulkFiles.map((uploadedFile, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded bg-muted">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {getFileIcon(uploadedFile.file.type, uploadedFile.category || "")}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm truncate">{uploadedFile.file.name}</span>
                                {uploadedFile.documentType && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                    {uploadedFile.documentType}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(uploadedFile.file.size)}
                              </span>
                            </div>
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
                    {['finance', 'compliance', 'meeting', 'technical', 'hr', 'marketing'].map(type => (
                      <Button
                        key={type}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentTags = bulkFormData.tags.split(',').map(t => t.trim()).filter(t => t);
                          if (!currentTags.includes(type)) {
                            const newTags = [...currentTags, type].join(', ');
                            setBulkFormData(prev => ({ ...prev, tags: newTags }));
                          } else {
                            const newTags = currentTags.filter(t => t !== type).join(', ');
                            setBulkFormData(prev => ({ ...prev, tags: newTags }));
                          }
                        }}
                        className={`text-xs ${bulkFormData.tags.toLowerCase().includes(type) ? 'bg-primary/10 border-primary text-primary' : ''}`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Button>
                    ))}
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
                        {analyzingFiles && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                            Analyzing...
                          </span>
                        )}
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
                      {folderFiles.map((uploadedFile, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded bg-muted text-sm">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {getFileIcon(uploadedFile.file.type, uploadedFile.category || "")}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="block truncate font-medium">{uploadedFile.file.name}</span>
                                {uploadedFile.documentType && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                    {uploadedFile.documentType}
                                  </span>
                                )}
                              </div>
                              <span className="block truncate text-xs text-muted-foreground">{uploadedFile.path}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(uploadedFile.file.size)}
                              </span>
                            </div>
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
                    {['finance', 'compliance', 'meeting', 'technical', 'hr', 'marketing'].map(type => (
                      <Button
                        key={type}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentTags = folderFormData.tags.split(',').map(t => t.trim()).filter(t => t);
                          if (!currentTags.includes(type)) {
                            const newTags = [...currentTags, type].join(', ');
                            setFolderFormData(prev => ({ ...prev, tags: newTags }));
                          } else {
                            const newTags = currentTags.filter(t => t !== type).join(', ');
                            setFolderFormData(prev => ({ ...prev, tags: newTags }));
                          }
                        }}
                        className={`text-xs ${folderFormData.tags.toLowerCase().includes(type) ? 'bg-primary/10 border-primary text-primary' : ''}`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Button>
                    ))}
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