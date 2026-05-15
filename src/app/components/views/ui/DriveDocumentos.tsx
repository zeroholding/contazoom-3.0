"use client";

import React, { useState, useEffect } from "react";
import { Folder, FileText, Upload, Trash2, Download, ChevronRight, ArrowLeft, Loader2, File, Image as ImageIcon } from "lucide-react";

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
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
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
    
    // Se for admin, usa o usuário selecionado no form. Se não for admin, a API vai bloquear de qualquer forma.
    if (isAdmin) formData.append("userId", uploadTargetUser);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setUploadModalOpen(false);
        setUploadFile(null);
        fetchDocuments(selectedUserId); // Refresh
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

  // Filtragem de documentos com base na navegação atual
  const getVisibleFiles = () => {
    return documents.filter(doc => {
      if (doc.category !== currentCategory) return false;
      if (currentCategory === "02_IMPOSTOS") {
        if (!doc.subFolder) return false;
        if (currentYear && !doc.subFolder.startsWith(currentYear)) return false;
        if (currentYear && currentMonth && doc.subFolder !== `${currentYear}/${currentMonth}`) return false;
      }
      return true;
    });
  };

  // Determinar o que renderizar no corpo principal
  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      );
    }

    // Nível 0: Categorias Principais
    if (!currentCategory) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCurrentCategory(cat.id)}
              className="flex items-center p-4 bg-white border rounded-xl hover:shadow-md transition-shadow text-left group"
            >
              <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors mr-4">
                <Folder className="w-8 h-8 text-blue-600 fill-blue-600/20" />
              </div>
              <div className="flex-1 font-semibold text-gray-800">{cat.name}</div>
            </button>
          ))}
        </div>
      );
    }

    const categoryDef = CATEGORIES.find(c => c.id === currentCategory);

    // Nível 1: Anos (Apenas para Impostos)
    if (currentCategory === "02_IMPOSTOS" && !currentYear) {
      // Extrair anos únicos dos documentos
      const years = Array.from(new Set(documents
        .filter(d => d.category === "02_IMPOSTOS" && d.subFolder)
        .map(d => d.subFolder?.split("/")[0])
        .filter(Boolean)
      )).sort().reverse() as string[];

      if (years.length === 0) years.push(new Date().getFullYear().toString());

      return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {years.map(year => (
            <button
              key={year}
              onClick={() => setCurrentYear(year)}
              className="flex flex-col items-center p-4 bg-white border rounded-xl hover:shadow-md transition-shadow"
            >
              <Folder className="w-12 h-12 text-blue-600 fill-blue-600/20 mb-2" />
              <span className="font-semibold text-gray-800">{year}</span>
            </button>
          ))}
        </div>
      );
    }

    // Nível 2: Meses (Apenas para Impostos)
    if (currentCategory === "02_IMPOSTOS" && currentYear && !currentMonth) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {MONTHS.map(month => {
            const hasFiles = documents.some(d => d.category === "02_IMPOSTOS" && d.subFolder === `${currentYear}/${month}`);
            return (
              <button
                key={month}
                onClick={() => setCurrentMonth(month)}
                className={`flex items-center p-4 bg-white border rounded-xl hover:shadow-md transition-shadow text-left ${!hasFiles ? 'opacity-60' : ''}`}
              >
                <Folder className={`w-8 h-8 mr-3 ${hasFiles ? 'text-blue-600 fill-blue-600/20' : 'text-gray-400'}`} />
                <span className="font-semibold text-gray-800">{month}</span>
              </button>
            )
          })}
        </div>
      );
    }

    // Nível 3: Arquivos
    const files = getVisibleFiles();

    if (files.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <Folder className="w-16 h-16 text-gray-300 mb-4" />
          <p>Nenhum arquivo encontrado nesta pasta.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {files.map(doc => (
          <div key={doc.id} className="flex items-center p-4 bg-white border rounded-xl hover:shadow-md transition-shadow group">
            {getFileIcon(doc.mimeType)}
            <div className="ml-4 flex-1 overflow-hidden">
              <p className="font-semibold text-gray-800 truncate" title={doc.originalName}>{doc.originalName}</p>
              <p className="text-xs text-gray-500">
                {formatSize(doc.sizeBytes)} • {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
              </p>
              {isAdmin && doc.user && (
                <p className="text-xs text-blue-600 truncate mt-1">👤 {doc.user.name}</p>
              )}
            </div>
            <div className="flex space-x-2 ml-2">
              <a 
                href={doc.fileUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Download className="w-5 h-5" />
              </a>
              {isAdmin && (
                <button 
                  onClick={() => handleDelete(doc.fileName)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-50/50 p-6">
      
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            Drive de Documentos
          </h1>
          
          <div className="flex items-center text-sm text-gray-500 mt-2 space-x-2">
            <button onClick={() => { setCurrentCategory(null); setCurrentYear(null); setCurrentMonth(null); }} className="hover:text-blue-600 font-medium">Início</button>
            
            {currentCategory && (
              <>
                <ChevronRight className="w-4 h-4" />
                <button onClick={() => { setCurrentYear(null); setCurrentMonth(null); }} className="hover:text-blue-600 font-medium">
                  {CATEGORIES.find(c => c.id === currentCategory)?.name.split(". ")[1]}
                </button>
              </>
            )}
            
            {currentYear && (
              <>
                <ChevronRight className="w-4 h-4" />
                <button onClick={() => { setCurrentMonth(null); }} className="hover:text-blue-600 font-medium">{currentYear}</button>
              </>
            )}
            
            {currentMonth && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="text-gray-800">{currentMonth}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-white border-gray-300 rounded-lg text-sm px-3 py-2 border shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Visualizando: Todos os Clientes</option>
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
              Novo Upload
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        {renderBody()}
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
                    className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">-- Selecione o Cliente --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria da Pasta</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
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
                      className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                    >
                      {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mês</label>
                    <select
                      value={uploadMonth}
                      onChange={(e) => setUploadMonth(e.target.value)}
                      className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
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
