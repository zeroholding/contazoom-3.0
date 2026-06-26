"use client";

import React, { useState, useEffect } from "react";
import { Folder, FileText, Upload, Trash2, Download, ChevronRight, ChevronDown, Loader2, File, Image as ImageIcon, Store, ArrowLeft } from "lucide-react";

type Document = {
  id: string;
  userId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  subFolder: string | null;
  createdAt: string;
  fileUrl: string;
  folder?: { id: string; name: string; icon: string } | null;
  folderId: string | null;
};

type DocumentFolder = {
  id: string;
  name: string;
  icon: string;
  parentId?: string | null;
};

import { DOCUMENT_CATEGORIES as CATEGORIES, DOCUMENT_MONTHS as MONTHS } from "@/lib/document-categories";

export default function DriveDocumentos() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{id: string, name: string}[]>([]);
  
  const [userFolders, setUserFolders] = useState<DocumentFolder[]>([]);
  
  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string>("");
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  
  // Expanded state for the left sidebar tree
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});

  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear().toString());
  const [uploadMonth, setUploadMonth] = useState(MONTHS[new Date().getMonth()]);
  const [uploadTargetUser, setUploadTargetUser] = useState("");

  useEffect(() => {
    fetchDocuments(selectedUserId);
  }, [selectedUserId]);

  const fetchDocuments = async (userId: string) => {
    setLoading(true);
    try {
      const url = userId ? `/api/documents?userId=${userId}` : "/api/documents";
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.isAdmin) {
        setIsAdmin(true);
        fetchUsers();
      }
      setDocuments(data.documents || []);
      setUserFolders(data.folders || []);
      if (data.folders?.length > 0 && !currentFolderId) {
        setCurrentFolderId(data.folders[0].id);
        setUploadCategory(data.folders[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    if (isAdmin && !uploadTargetUser) {
      alert("Selecione um cliente para vincular o documento.");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("category", "CUSTOM");
    formData.append("folderId", uploadCategory); // Using uploadCategory state for folderId
    
    let subFolder = "";
    const folderObj = userFolders.find(f => f.id === uploadCategory);
    if (folderObj?.name.toUpperCase().includes("IMPOSTO")) {
      subFolder = `${uploadYear}/${uploadMonth}`;
    }
    if (subFolder) formData.append("subFolder", subFolder);
    
    if (isAdmin) formData.append("userId", uploadTargetUser);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setUploadModalOpen(false);
        setUploadFile(null);
        fetchDocuments(selectedUserId);
      } else {
        const error = await res.json();
        alert(error.error || "Erro ao fazer upload");
      }
    } catch (err) {
      alert("Erro ao fazer upload");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!confirm("Tem certeza que deseja excluir este arquivo?")) return;
    
    try {
      const res = await fetch(`/api/documents/download/${fileName}`, { method: "DELETE" });
      if (res.ok) {
        setDocuments(documents.filter(d => d.fileName !== fileName));
      } else {
        alert("Erro ao excluir o arquivo.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes("pdf")) return <FileText className="w-8 h-8 text-red-500" />;
    if (mimeType.includes("image")) return <ImageIcon className="w-8 h-8 text-blue-500" />;
    return <File className="w-8 h-8 text-gray-500" />;
  };

  const getAvailableYears = (folderId: string) => {
    const years = Array.from(new Set(documents
      .filter(d => d.folderId === folderId && d.subFolder)
      .map(d => d.subFolder?.split("/")[0])
      .filter(Boolean)
    )).sort().reverse() as string[];
    if (years.length === 0) return [new Date().getFullYear().toString()];
    return years;
  };

  const visibleFiles = documents.filter(doc => {
    // If no folderId in doc, fallback to match category. But normally doc.folderId === currentFolderId
    if (doc.folderId !== currentFolderId && doc.category !== currentFolderId) return false;
    
    const folderObj = userFolders.find(f => f.id === currentFolderId);
    const isImpostos = folderObj?.name.toUpperCase().includes("IMPOSTO");

    if (isImpostos) {
      if (currentYear && currentMonth) {
        return doc.subFolder?.startsWith(`${currentYear}/${currentMonth}`);
      } else if (currentYear) {
        return doc.subFolder?.startsWith(currentYear);
      }
    }
    return true;
  });

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };
  const toggleYear = (year: string) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const selectFolder = (catId: string, year?: string, month?: string) => {
    setCurrentFolderId(catId);
    setCurrentYear(year || null);
    setCurrentMonth(month || null);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-white">
      
      {/* SIDEBAR ESQUERDA - Árvore de Pastas */}
      <div className={`w-full lg:w-72 border-r bg-gray-50/50 flex flex-col shrink-0 lg:h-full overflow-y-auto ${currentFolderId && (currentYear || currentMonth || visibleFiles.length > 0) ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-white flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <h2 className="font-bold text-gray-800">Pastas</h2>
        </div>
        
        <div className="p-3 space-y-1">
          {(() => {
            const topLevel = userFolders.filter(f => !f.parentId);

            const renderFolder = (folder: DocumentFolder, depth = 0): React.ReactNode => {
              const children = userFolders.filter(f => f.parentId === folder.id);
              const hasChildren = children.length > 0;
              const isImpostos = folder.name.toUpperCase().includes("IMPOSTO");
              const isCatActive = currentFolderId === folder.id && !currentYear;
              const isExpanded = expandedFolders[folder.id] !== false; // default expanded
              const availYears = getAvailableYears(folder.id);

              return (
                <div key={folder.id}>
                  <div
                    className={`flex items-center w-full rounded-lg cursor-pointer transition-colors ${
                      isCatActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200 text-gray-700'
                    }`}
                    style={{ paddingLeft: depth > 0 ? `${depth * 12}px` : undefined }}
                  >
                    <button
                      className="p-2 flex-shrink-0"
                      onClick={() => {
                        if (hasChildren || isImpostos) toggleFolder(folder.id);
                        else selectFolder(folder.id);
                      }}
                    >
                      {hasChildren || isImpostos ? (
                        isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                      ) : (
                        <div className="w-4" />
                      )}
                    </button>
                    <div
                      className="flex items-center flex-1 py-2 pr-2"
                      onClick={() => selectFolder(folder.id)}
                    >
                      <Folder className={`w-4 h-4 mr-2 flex-shrink-0 ${
                        isCatActive ? 'text-blue-600 fill-blue-600/20' : depth > 0 ? 'text-gray-300' : 'text-gray-400'
                      }`} />
                      <span className="text-sm font-medium truncate" title={folder.name}>{folder.name}</span>
                    </div>
                  </div>

                  {/* Subpastas reais (parentId) */}
                  {hasChildren && isExpanded && (
                    <div className="ml-2 mt-1 space-y-1 border-l-2 border-gray-200 pl-1">
                      {children.map(child => renderFolder(child, depth + 1))}
                    </div>
                  )}

                  {/* Subpastas de Impostos (Anos/Meses) */}
                  {isImpostos && isExpanded && !hasChildren && (
                    <div className="ml-6 mt-1 space-y-1 border-l-2 border-gray-200 pl-2">
                      {availYears.map(year => {
                        const isYearActive = currentFolderId === folder.id && currentYear === year && !currentMonth;
                        const isYearExpanded = expandedYears[year];

                        return (
                          <div key={year}>
                            <div className={`flex items-center w-full rounded-lg cursor-pointer transition-colors ${
                              isYearActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200 text-gray-600'
                            }`}>
                              <button className="p-2" onClick={() => toggleYear(year)}>
                                {isYearExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                              <div className="flex items-center flex-1 py-1.5 pr-2" onClick={() => selectFolder(folder.id, year)}>
                                <Folder className={`w-4 h-4 mr-2 ${
                                  isYearActive ? 'text-blue-600 fill-blue-600/20' : 'text-gray-400'
                                }`} />
                                <span className="text-sm font-medium">{year}</span>
                              </div>
                            </div>

                            {isYearExpanded && (
                              <div className="ml-5 mt-1 space-y-1 border-l-2 border-gray-100 pl-2">
                                {MONTHS.map(month => {
                                  const isMonthActive = currentFolderId === folder.id && currentYear === year && currentMonth === month;
                                  return (
                                    <div
                                      key={month}
                                      className={`flex items-center py-1.5 px-3 rounded-lg cursor-pointer transition-colors ${
                                        isMonthActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-500'
                                      }`}
                                      onClick={() => selectFolder(folder.id, year, month)}
                                    >
                                      <Folder className={`w-3.5 h-3.5 mr-2 ${
                                        isMonthActive ? 'text-blue-600 fill-blue-600/20' : 'text-gray-300'
                                      }`} />
                                      <span className="text-xs font-medium">{month.split(" - ")[1]}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            };

            return topLevel.map(f => renderFolder(f));
          })()}
        </div>
      </div>

      {/* ÁREA PRINCIPAL - Lista de Arquivos */}
      <div className={`flex-1 flex flex-col bg-white overflow-hidden ${!currentFolderId || (!currentYear && !currentMonth && visibleFiles.length === 0) ? 'hidden lg:flex' : 'flex'}`}>
        {/* Header da Área Principal */}
        <div className="p-4 sm:p-6 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
          <div className="flex items-center gap-3">
            {currentFolderId && (
              <button
                onClick={() => {
                  setCurrentFolderId("");
                  setCurrentYear(null);
                  setCurrentMonth(null);
                }}
                className="lg:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center text-xs sm:text-sm text-gray-500 mb-1 space-x-2">
                <span className="font-medium text-gray-700">{userFolders.find(c => c.id === currentFolderId)?.name || "Documentos"}</span>
                {currentYear && <><ChevronRight className="w-4 h-4" /><span>{currentYear}</span></>}
                {currentMonth && <><ChevronRight className="w-4 h-4" /><span>{currentMonth}</span></>}
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">
                {userFolders.find(c => c.id === currentFolderId)?.name || "Todos os Documentos"}
              </h1>
            </div>
          </div>
        </div>

        {/* Corpo da Área Principal */}
        <div className="flex-1 p-6 overflow-y-auto bg-gray-50/30">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : visibleFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="p-6 bg-gray-100 rounded-full mb-4">
                <Folder className="w-12 h-12 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-700">Esta pasta está vazia</h3>
              <p className="text-sm mt-1">Nenhum documento foi enviado para cá ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleFiles.map(doc => {
                const isPdf = doc.mimeType.includes("pdf");
                const isImage = doc.mimeType.includes("image");
                const fileExt = isPdf ? "PDF" : isImage ? "IMG" : doc.originalName.split('.').pop()?.toUpperCase().substring(0, 4) || "DOC";
                const parts = doc.subFolder?.split("/") || [];
                const storeLabel = doc.category === "02_IMPOSTOS" ? (parts.length > 2 ? parts[2] : null) : (parts.length > 0 ? parts[0] : null);
                
                return (
                  <div 
                    key={doc.id} 
                    className="flex flex-col p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md hover:border-blue-400 transition-all group cursor-pointer"
                    onClick={() => window.open(`${doc.fileUrl}?action=view`, '_blank')}
                  >
                    <div className="flex items-start">
                      <div className="relative mt-1">
                        {getFileIcon(doc.mimeType)}
                        <span className="absolute -top-2 -right-2 bg-gray-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase">
                          {fileExt}
                        </span>
                      </div>
                      <div className="ml-4 flex-1 overflow-hidden">
                        <p className="font-semibold text-gray-800 text-sm truncate" title={doc.originalName}>{doc.originalName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatSize(doc.sizeBytes)} • {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                        {storeLabel && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {storeLabel.split(",").map((s, idx) => (
                              <div key={idx} className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border bg-gray-50 border-gray-200 text-gray-600 font-medium">
                                <Store className="w-3 h-3 mr-1" />
                                <span className="truncate max-w-[120px]">{s}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col space-y-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); window.open(`${doc.fileUrl}?action=download`, '_self'); }}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Baixar Arquivo"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
