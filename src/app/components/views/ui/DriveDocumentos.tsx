"use client";

import React, { useState, useEffect } from "react";
import { Folder, FileText, Upload, Trash2, Download, ChevronRight, ChevronDown, Loader2, File, Image as ImageIcon } from "lucide-react";

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
  user?: { name: string; email: string };
};

const CATEGORIES = [
  { id: "01_INSTITUCIONAIS", name: "01. DOCUMENTOS INSTITUCIONAIS", hasYears: false },
  { id: "02_IMPOSTOS", name: "02. IMPOSTOS E OBRIGAÇÕES", hasYears: true },
  { id: "03_FATURAMENTO", name: "03. FATURAMENTO E RELATÓRIOS", hasYears: false },
  { id: "04_FOLHA", name: "04. FOLHA E FUNCIONÁRIOS", hasYears: false },
];

const MONTHS = [
  "01 - Janeiro", "02 - Fevereiro", "03 - Março", "04 - Abril", 
  "05 - Maio", "06 - Junho", "07 - Julho", "08 - Agosto", 
  "09 - Setembro", "10 - Outubro", "11 - Novembro", "12 - Dezembro"
];

export default function DriveDocumentos() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{id: string, name: string}[]>([]);
  
  // Navigation state
  const [currentCategory, setCurrentCategory] = useState<string>("01_INSTITUCIONAIS");
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  
  // Expanded state for the left sidebar tree
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ "02_IMPOSTOS": false });
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});

  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("01_INSTITUCIONAIS");
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
    formData.append("category", uploadCategory);
    
    let subFolder = "";
    if (uploadCategory === "02_IMPOSTOS") {
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

  // Obter anos disponíveis para a árvore
  const getAvailableYears = () => {
    const years = Array.from(new Set(documents
      .filter(d => d.category === "02_IMPOSTOS" && d.subFolder)
      .map(d => d.subFolder?.split("/")[0])
      .filter(Boolean)
    )).sort().reverse() as string[];
    if (years.length === 0) return [new Date().getFullYear().toString()];
    return years;
  };

  const visibleFiles = documents.filter(doc => {
    if (doc.category !== currentCategory) return false;
    if (currentCategory === "02_IMPOSTOS") {
      if (currentYear && currentMonth) {
        return doc.subFolder === `${currentYear}/${currentMonth}`;
      } else if (currentYear) {
        return doc.subFolder?.startsWith(currentYear);
      }
    }
    return true;
  });

  const toggleCat = (catId: string) => {
    setExpandedCats(prev => ({ ...prev, [catId]: !prev[catId] }));
  };
  const toggleYear = (year: string) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const selectFolder = (catId: string, year?: string, month?: string) => {
    setCurrentCategory(catId);
    setCurrentYear(year || null);
    setCurrentMonth(month || null);
  };

  return (
    <div className="flex h-full w-full bg-white">
      
      {/* SIDEBAR ESQUERDA - Árvore de Pastas */}
      <div className="w-72 border-r bg-gray-50/50 flex flex-col h-full overflow-y-auto">
        <div className="p-4 border-b bg-white flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <h2 className="font-bold text-gray-800">Pastas</h2>
        </div>
        
        <div className="p-3 space-y-1">
          {CATEGORIES.map(cat => {
            const isCatActive = currentCategory === cat.id && !currentYear;
            const isExpanded = expandedCats[cat.id];
            
            return (
              <div key={cat.id}>
                <div 
                  className={`flex items-center w-full rounded-lg cursor-pointer transition-colors ${isCatActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200 text-gray-700'}`}
                >
                  <button 
                    className="p-2"
                    onClick={() => cat.hasYears ? toggleCat(cat.id) : selectFolder(cat.id)}
                  >
                    {cat.hasYears ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <div className="w-4" />}
                  </button>
                  <div 
                    className="flex items-center flex-1 py-2 pr-2" 
                    onClick={() => selectFolder(cat.id)}
                  >
                    <Folder className={`w-4 h-4 mr-2 ${isCatActive ? 'text-blue-600 fill-blue-600/20' : 'text-gray-400'}`} />
                    <span className="text-sm font-medium truncate" title={cat.name}>{cat.name.substring(4)}</span>
                  </div>
                </div>

                {/* Subpastas (Anos e Meses) */}
                {cat.hasYears && isExpanded && (
                  <div className="ml-6 mt-1 space-y-1 border-l-2 border-gray-200 pl-2">
                    {getAvailableYears().map(year => {
                      const isYearActive = currentCategory === cat.id && currentYear === year && !currentMonth;
                      const isYearExpanded = expandedYears[year];
                      
                      return (
                        <div key={year}>
                          <div className={`flex items-center w-full rounded-lg cursor-pointer transition-colors ${isYearActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200 text-gray-600'}`}>
                            <button className="p-2" onClick={() => toggleYear(year)}>
                              {isYearExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                            <div className="flex items-center flex-1 py-1.5 pr-2" onClick={() => selectFolder(cat.id, year)}>
                              <Folder className={`w-4 h-4 mr-2 ${isYearActive ? 'text-blue-600 fill-blue-600/20' : 'text-gray-400'}`} />
                              <span className="text-sm font-medium">{year}</span>
                            </div>
                          </div>

                          {/* Meses */}
                          {isYearExpanded && (
                            <div className="ml-5 mt-1 space-y-1 border-l-2 border-gray-100 pl-2">
                              {MONTHS.map(month => {
                                const isMonthActive = currentCategory === cat.id && currentYear === year && currentMonth === month;
                                return (
                                  <div 
                                    key={month} 
                                    className={`flex items-center py-1.5 px-3 rounded-lg cursor-pointer transition-colors ${isMonthActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-500'}`}
                                    onClick={() => selectFolder(cat.id, year, month)}
                                  >
                                    <Folder className={`w-3.5 h-3.5 mr-2 ${isMonthActive ? 'text-blue-600 fill-blue-600/20' : 'text-gray-300'}`} />
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
          })}
        </div>
      </div>

      {/* ÁREA PRINCIPAL - Lista de Arquivos */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Header da Área Principal */}
        <div className="p-6 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white">
          <div>
            <div className="flex items-center text-sm text-gray-500 mb-1 space-x-2">
              <span className="font-medium text-gray-700">{CATEGORIES.find(c => c.id === currentCategory)?.name}</span>
              {currentYear && <><ChevronRight className="w-4 h-4" /><span>{currentYear}</span></>}
              {currentMonth && <><ChevronRight className="w-4 h-4" /><span>{currentMonth}</span></>}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {currentMonth || currentYear || CATEGORIES.find(c => c.id === currentCategory)?.name.substring(4)}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="bg-white border-gray-300 rounded-lg text-sm px-3 py-2 border shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Todos os Clientes</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}

            {isAdmin && (
              <button
                onClick={() => setUploadModalOpen(true)}
                className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </button>
            )}
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
              {visibleFiles.map(doc => (
                <div key={doc.id} className="flex items-center p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md hover:border-blue-200 transition-all group">
                  {getFileIcon(doc.mimeType)}
                  <div className="ml-4 flex-1 overflow-hidden">
                    <p className="font-semibold text-gray-800 text-sm truncate" title={doc.originalName}>{doc.originalName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatSize(doc.sizeBytes)} • {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                    {isAdmin && doc.user && (
                      <p className="text-xs text-blue-600 truncate mt-1 bg-blue-50 inline-block px-1.5 py-0.5 rounded">
                        {doc.user.name.split(' ')[0]}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col space-y-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={doc.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Baixar"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {isAdmin && (
                      <button 
                        onClick={() => handleDelete(doc.fileName)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Upload */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Enviar Documento</h3>
              <button onClick={() => setUploadModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleUpload} className="p-6 space-y-4">
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente Destino *</label>
                  <select
                    required
                    value={uploadTargetUser}
                    onChange={(e) => setUploadTargetUser(e.target.value)}
                    className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">-- Selecione o Cliente --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria da Pasta</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-blue-500 focus:ring-blue-500"
                >
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {uploadCategory === "02_IMPOSTOS" && (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
                    <select
                      value={uploadYear}
                      onChange={(e) => setUploadYear(e.target.value)}
                      className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-blue-500 focus:ring-blue-500"
                    >
                      {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mês</label>
                    <select
                      value={uploadMonth}
                      onChange={(e) => setUploadMonth(e.target.value)}
                      className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-blue-500 focus:ring-blue-500"
                    >
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div className="pt-4 border-t flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-70 flex items-center"
                >
                  {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {isUploading ? "Enviando..." : "Enviar Arquivo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
