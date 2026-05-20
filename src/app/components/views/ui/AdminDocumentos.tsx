"use client";

import React, { useState, useEffect } from "react";
import { UploadCloud, CheckCircle2, FileText, Loader2, Users, Store, Eye, Download, History, Search, Trash2, AlertTriangle, X } from "lucide-react";
import { MeliIcon } from "@/components/icons/MeliIcon";
import { ShopeeIcon } from "@/components/icons/ShopeeIcon";

type UserData = {
  id: string;
  name: string;
  email: string;
  connectedAccounts: { provider: string; label: string }[];
};

type DocumentLog = {
  id: string;
  action: string;
  createdAt: string;
  user: { name: string; role: string };
};

type UserDocument = {
  id: string;
  originalName: string;
  category: string;
  subFolder: string | null;
  folderId: string | null;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  fileUrl: string;
  logs: DocumentLog[];
  folder?: { id: string; name: string; icon: string } | null;
};

type DocumentFolder = {
  id: string;
  name: string;
  icon: string;
};

import { DOCUMENT_CATEGORIES as CATEGORIES, DOCUMENT_MONTHS as MONTHS } from "@/lib/document-categories";

export default function AdminDocumentos() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [userFolders, setUserFolders] = useState<DocumentFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [isSavingFolder, setIsSavingFolder] = useState(false);

  const [expandedDocLogs, setExpandedDocLogs] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<DocumentFolder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchUserDocuments(selectedUser);
      fetchUserFolders(selectedUser);
      setUploadSuccess(null);
      setSelectedStores([]);
    } else {
      setUserDocuments([]);
      setUserFolders([]);
      setSelectedFolderId("");
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) { setUsers(await res.json()); }
      else { setError("Erro ao carregar lista de clientes."); }
    } catch { setError("Erro de conexão."); }
    finally { setLoading(false); }
  };

  const fetchUserDocuments = async (userId: string) => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/documents`);
      if (res.ok) setUserDocuments(await res.json());
    } catch (err) { console.error("Erro ao carregar documentos:", err); }
    finally { setLoadingDocs(false); }
  };

  const fetchUserFolders = async (userId: string) => {
    setLoadingFolders(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/folders`);
      if (res.ok) {
        const folders = await res.json();
        setUserFolders(folders);
        if (folders.length > 0) setSelectedFolderId(folders[0].id);
      }
    } catch (err) { console.error("Erro ao carregar pastas:", err); }
    finally { setLoadingFolders(false); }
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderNameInput.trim() || !selectedUser) return;
    setIsSavingFolder(true);
    try {
      const url = editingFolder 
        ? `/api/admin/users/${selectedUser}/folders/${editingFolder.id}`
        : `/api/admin/users/${selectedUser}/folders`;
      const method = editingFolder ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderNameInput.trim() })
      });
      if (res.ok) {
        await fetchUserFolders(selectedUser);
        setShowFolderModal(false);
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao salvar pasta.");
      }
    } catch {
      alert("Erro de conexão ao salvar pasta.");
    } finally {
      setIsSavingFolder(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!confirmDeleteFolder || !selectedUser) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser}/folders/${confirmDeleteFolder.id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchUserFolders(selectedUser);
        setConfirmDeleteFolder(null);
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao excluir pasta.");
      }
    } catch {
      alert("Erro de conexão ao excluir pasta.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleStore = (storeLabel: string) => {
    setSelectedStores(prev => 
      prev.includes(storeLabel) ? prev.filter(s => s !== storeLabel) : [...prev, storeLabel]
    );
  };

  const handleDeleteDocument = async () => {
    if (!confirmDelete || !selectedUser) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser}/documents/${confirmDelete.id}`, { method: "DELETE" });
      if (res.ok) {
        setUserDocuments(prev => prev.filter(d => d.id !== confirmDelete.id));
        setConfirmDelete(null);
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao excluir documento.");
      }
    } catch {
      alert("Erro de conexão ao excluir documento.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !selectedUser) return;
    setIsUploading(true);
    setUploadSuccess(null);
    
    const formData = new FormData();
    formData.append("file", uploadFile);
    // category will be CUSTOM, folderId will be selectedFolderId
    formData.append("category", "CUSTOM");
    if (selectedFolderId) formData.append("folderId", selectedFolderId);
    formData.append("userId", selectedUser);
    
    let subFolder = "";
    const storesStr = selectedStores.length > 0 ? selectedStores.join(",") : "";
    
    // We try to guess if it's IMPOSTOS based on folder name for legacy logic, or just always allow it if user selects it.
    const folderObj = userFolders.find(f => f.id === selectedFolderId);
    const isImpostos = folderObj?.name.toUpperCase().includes("IMPOSTO");

    if (isImpostos) {
      subFolder = `${selectedYear}/${selectedMonth}`;
      if (storesStr) subFolder += `/${storesStr}`;
    } else if (storesStr) {
      subFolder = storesStr;
    }
    if (subFolder) formData.append("subFolder", subFolder);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/documents", true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadSuccess("Documento enviado com sucesso!");
          setUploadFile(null);
          const fileInput = document.getElementById("file-upload") as HTMLInputElement;
          if (fileInput) fileInput.value = "";
          fetchUserDocuments(selectedUser);
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            alert(err.error || "Erro ao fazer upload.");
          } catch {
            alert("Erro ao fazer upload.");
          }
        }
        setIsUploading(false);
        setTimeout(() => setUploadProgress(0), 2000);
      };

      xhr.onerror = () => {
        alert("Erro ao fazer upload. Verifique as permissões da pasta /app/uploads.");
        setIsUploading(false);
        setUploadProgress(0);
      };

      xhr.send(formData);
    } catch {
      alert("Erro ao iniciar upload.");
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  if (error) return <div className="p-8 text-center text-red-600 font-medium">{error}</div>;

  const activeUser = users.find(u => u.id === selectedUser);
  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()));

  // Helper to extract store labels from subFolder
  const getStoreBadges = (doc: UserDocument) => {
    if (!doc.subFolder) return null;
    const parts = doc.subFolder.split("/");
    const storesStr = doc.category === "02_IMPOSTOS" ? (parts.length > 2 ? parts[2] : null) : (parts.length > 0 ? parts[0] : null);
    if (!storesStr) return null;
    return storesStr.split(",");
  };

  return (
    <>
      <div className="flex h-[calc(100vh-64px)] bg-[#F8FAFC] overflow-hidden">
      
      {/* ═══ COL 1 — CLIENT LIST ═══ */}
      <aside className="w-72 xl:w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <Users className="w-4 h-4 mr-2 text-orange-500" /> Clientes
            </h2>
            <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">{users.length}</span>
          </div>
          <div className="mt-3 relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" placeholder="Buscar cliente..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">Nenhum cliente encontrado.</div>
          ) : (
            filteredUsers.map(u => (
              <button key={u.id} onClick={() => setSelectedUser(u.id)}
                className={`w-full text-left px-5 py-3.5 flex items-center gap-3 transition-all border-l-[3px] ${
                  selectedUser === u.id 
                    ? 'bg-orange-50/70 border-orange-500' 
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  selectedUser === u.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {u.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${selectedUser === u.id ? 'text-orange-900' : 'text-gray-800'}`}>{u.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                </div>
                {u.connectedAccounts.length > 0 && (
                  <div className="flex flex-col gap-1 shrink-0 items-end">
                    {u.connectedAccounts.filter(a => a.provider === 'mercadolivre').length > 0 && (
                      <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 text-yellow-700 px-1.5 py-0.5 rounded text-[9px] font-bold shadow-sm">
                        <MeliIcon className="w-2.5 h-2.5" />
                        {u.connectedAccounts.filter(a => a.provider === 'mercadolivre').length}
                      </div>
                    )}
                    {u.connectedAccounts.filter(a => a.provider === 'shopee').length > 0 && (
                      <div className="flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-700 px-1.5 py-0.5 rounded text-[9px] font-bold shadow-sm">
                        <ShopeeIcon className="w-2.5 h-2.5" />
                        {u.connectedAccounts.filter(a => a.provider === 'shopee').length}
                      </div>
                    )}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ═══ COL 2 — DOCUMENTS ═══ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="px-8 py-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                {activeUser ? `Documentos de ${activeUser.name.split(' ')[0]}` : "Centro de Documentos"}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {activeUser ? "Gerencie arquivos, envie relatórios e acompanhe acessos." : "Selecione um cliente à esquerda."}
              </p>
            </div>
            {loadingDocs && <Loader2 className="w-5 h-5 animate-spin text-orange-500" />}
          </div>
          {activeUser && userDocuments.length > 0 && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="font-semibold text-gray-700">{userDocuments.length}</span> documento{userDocuments.length !== 1 && 's'}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="font-semibold text-gray-700">{(userDocuments.reduce((a, d) => a + d.sizeBytes, 0) / 1024 / 1024).toFixed(1)} MB</span> total
              </div>
              {activeUser.connectedAccounts.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="font-semibold text-gray-700">{activeUser.connectedAccounts.length}</span> loja{activeUser.connectedAccounts.length !== 1 && 's'}
                </div>
              )}
            </div>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 xl:p-8">
          {!activeUser ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xs mx-auto">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-base font-semibold text-gray-600 mb-1">Nenhum cliente selecionado</h3>
              <p className="text-sm text-gray-400">Escolha um cliente na barra lateral.</p>
            </div>
          ) : userDocuments.length === 0 && !loadingDocs ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xs mx-auto">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-base font-semibold text-gray-600 mb-1">Pasta vazia</h3>
              <p className="text-sm text-gray-400">Este cliente ainda não possui documentos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
              {userDocuments.map(doc => {
                const isPdf = doc.mimeType?.includes("pdf");
                const fileExt = isPdf ? "PDF" : doc.originalName.split('.').pop()?.toUpperCase().substring(0, 4) || "DOC";
                const stores = getStoreBadges(doc);
                
                return (
                  <div key={doc.id} className="bg-white rounded-xl border border-gray-200 hover:shadow-lg hover:border-orange-200 transition-all flex flex-col overflow-hidden group">
                    <div className={`h-1 w-full ${isPdf ? 'bg-gradient-to-r from-red-400 to-red-500' : 'bg-gradient-to-r from-blue-400 to-blue-500'}`} />
                    <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isPdf ? 'bg-red-50' : 'bg-blue-50'} group-hover:scale-110 transition-transform`}>
                        <FileText className={`w-5 h-5 ${isPdf ? 'text-red-500' : 'text-blue-500'}`} />
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${isPdf ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>{fileExt}</span>
                    </div>
                    
                    <h4 className="text-sm font-semibold text-gray-900 truncate mb-1" title={doc.originalName}>{doc.originalName}</h4>
                    <p className="text-[11px] text-gray-400 mb-3">{new Date(doc.createdAt).toLocaleDateString('pt-BR')} • {(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                    
                    <div className="flex flex-wrap gap-1.5 mb-auto">
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {doc.folder?.name || CATEGORIES.find(c => c.id === doc.category)?.name.replace(/^\d+\.\s*/, '') || "Geral"}
                      </span>
                      {stores?.map((s, i) => (
                        <span key={i} className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 font-medium">
                          <Store className="w-2.5 h-2.5 mr-1" />{s}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-100">
                      <div className="flex gap-1">
                        <button onClick={() => window.open(`${doc.fileUrl}?action=view`, '_blank')} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Ver"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => window.open(`${doc.fileUrl}?action=download`, '_blank')} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors" title="Baixar"><Download className="w-4 h-4" /></button>
                        <button onClick={() => setConfirmDelete({ id: doc.id, name: doc.originalName })} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <button onClick={() => setExpandedDocLogs(expandedDocLogs === doc.id ? null : doc.id)}
                        className={`text-[11px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1 transition-colors ${expandedDocLogs === doc.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      ><History className="w-3 h-3" /> Logs</button>
                    </div>

                    {expandedDocLogs === doc.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100 bg-gray-50 -mx-5 -mb-5 px-5 pb-4 rounded-b-xl">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Histórico</p>
                        {doc.logs?.length > 0 ? (
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {doc.logs.map((log, i) => (
                              <div key={i} className="flex justify-between items-center text-[10px] bg-white p-1.5 rounded border border-gray-100">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${log.action === 'CREATED' ? 'bg-green-500' : log.action === 'VIEWED' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                                  <span className="text-gray-700 font-medium">{log.user.name}</span>
                                </div>
                                <span className="text-gray-400">{new Date(log.createdAt).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-[10px] text-gray-400 italic">Nenhum log.</p>}
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ═══ COL 3 — UPLOAD PANEL ═══ */}
      {activeUser && (
        <aside className="w-72 xl:w-80 bg-white border-l border-gray-200 flex flex-col shrink-0">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <UploadCloud className="w-4 h-4 mr-2 text-orange-500" /> Novo Upload
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Envie arquivos para {activeUser.name.split(' ')[0]}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <form id="upload-form" onSubmit={handleUploadDocument} className="space-y-5">
              
              {/* Stores */}
              {activeUser.connectedAccounts.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Vincular Lojas</label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeUser.connectedAccounts.map((acc, i) => {
                      const sel = selectedStores.includes(acc.label);
                      return (
                        <button key={i} type="button" onClick={() => handleToggleStore(acc.label)}
                          className={`flex items-center text-[11px] px-2.5 py-1.5 rounded-full border transition-all font-medium ${
                            sel ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {acc.provider === 'shopee' 
                            ? <ShopeeIcon className={`w-3.5 h-3.5 mr-1 ${!sel && 'opacity-50 grayscale'}`} /> 
                            : <MeliIcon className={`w-3.5 h-3.5 mr-1 ${!sel && 'opacity-50 grayscale'}`} />}
                          {acc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Folders */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pasta do Cliente</label>
                  <button type="button" onClick={() => { setEditingFolder(null); setFolderNameInput(""); setShowFolderModal(true); }} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded transition-colors">+ Nova</button>
                </div>
                <div className="space-y-1.5">
                  {loadingFolders ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                  ) : userFolders.length === 0 ? (
                    <div className="text-[11px] text-gray-400 text-center py-2 bg-gray-50 rounded-lg border border-gray-100">Nenhuma pasta criada.</div>
                  ) : (
                    userFolders.map(f => (
                      <div key={f.id} className={`w-full flex items-center justify-between text-left text-[11px] px-3 py-2.5 rounded-lg border transition-all group ${
                        selectedFolderId === f.id 
                          ? 'bg-blue-50 border-blue-300 shadow-sm ring-1 ring-blue-300/50' 
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}>
                        <button type="button" onClick={() => setSelectedFolderId(f.id)} className="flex items-center flex-1 min-w-0">
                          <div className={`w-4 h-4 mr-2 shrink-0 flex items-center justify-center ${selectedFolderId === f.id ? 'text-blue-500' : 'text-gray-400'}`}>
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <span className={`truncate ${selectedFolderId === f.id ? 'text-blue-900 font-semibold' : 'text-gray-600'}`}>{f.name}</span>
                        </button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={() => { setEditingFolder(f); setFolderNameInput(f.name); setShowFolderModal(true); }} className="p-1 text-gray-400 hover:text-blue-600 rounded" title="Renomear">
                            <History className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteFolder(f)} className="p-1 text-gray-400 hover:text-red-600 rounded" title="Excluir">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Month/Year for Impostos (Legacy logic fallback based on folder name) */}
              {userFolders.find(f => f.id === selectedFolderId)?.name.toUpperCase().includes("IMPOSTO") && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Mês</label>
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full border-gray-200 rounded text-[11px] px-2 py-1.5 border focus:border-orange-400 focus:ring-orange-400 bg-white">
                      {MONTHS.map(m => <option key={m} value={m}>{m.split(' - ')[0]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Ano</label>
                    <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-full border-gray-200 rounded text-[11px] px-2 py-1.5 border focus:border-orange-400 focus:ring-orange-400 bg-white">
                      {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* File */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Arquivo</label>
                <div className="relative border-2 border-dashed border-gray-300 rounded-xl px-4 py-6 text-center hover:bg-orange-50/50 hover:border-orange-300 transition-colors cursor-pointer group">
                  <input id="file-upload" type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" required onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                  <UploadCloud className="mx-auto w-7 h-7 text-gray-300 group-hover:text-orange-400 transition-colors mb-2" />
                  <p className="text-xs font-medium text-orange-600">Anexar arquivo</p>
                  <p className="text-[10px] text-gray-400">PDF, Imagem, Zip</p>
                </div>
                {uploadFile && (
                  <div className="mt-2 p-2.5 bg-orange-50 text-orange-800 rounded-lg text-[11px] font-semibold border border-orange-200 flex items-center justify-between">
                    <span className="truncate">{uploadFile.name}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0 ml-2" />
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* Submit footer */}
          <div className="p-4 border-t border-gray-100 relative">
            {isUploading && uploadProgress > 0 && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100">
                <div className="h-full bg-orange-500 transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
            
            {uploadSuccess && (
              <div className="mb-2.5 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-[11px] font-medium flex items-center border border-green-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 shrink-0" /> {uploadSuccess}
              </div>
            )}
            
            <button type="submit" form="upload-form" disabled={!uploadFile || isUploading}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md shadow-orange-500/20 active:scale-[0.98] relative overflow-hidden group"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin relative z-10" /> 
                  <span className="relative z-10">Enviando {uploadProgress}%...</span>
                  <div className="absolute inset-0 bg-black/10 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </>
              ) : (
                <><UploadCloud className="w-4 h-4 mr-2" /> Enviar Documento</>
              )}
            </button>
          </div>
        </aside>
      )}
    </div>

      {/* ═══ MODAL DE CONFIRMAÇÃO DE EXCLUSÃO ═══ */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isDeleting && setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Red accent bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-red-600" />
            
            <div className="p-6">
              {/* Icon */}
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-100">
                <AlertTriangle className="w-7 h-7 text-red-500" />
              </div>
              
              {/* Text */}
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Excluir Documento?</h3>
              <p className="text-sm text-gray-500 text-center mb-1">Tem certeza que deseja excluir o arquivo:</p>
              <p className="text-sm font-semibold text-gray-800 text-center bg-gray-50 px-4 py-2 rounded-lg border border-gray-100 truncate mb-4" title={confirmDelete.name}>
                {confirmDelete.name}
              </p>
              <p className="text-xs text-red-500 text-center font-medium">Esta ação não pode ser desfeita.</p>
            </div>
            
            {/* Buttons */}
            <div className="flex border-t border-gray-100">
              <button 
                onClick={() => setConfirmDelete(null)} 
                disabled={isDeleting}
                className="flex-1 px-6 py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 border-r border-gray-100"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeleteDocument} 
                disabled={isDeleting}
                className="flex-1 px-6 py-3.5 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Excluindo...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Sim, Excluir</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE PASTA ═══ */}
      {confirmDeleteFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isDeleting && setConfirmDeleteFolder(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-red-600" />
            <div className="p-6">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-100">
                <AlertTriangle className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Excluir Pasta?</h3>
              <p className="text-sm text-gray-500 text-center mb-4">Tem certeza que deseja excluir a pasta "{confirmDeleteFolder.name}"?</p>
              <p className="text-xs text-red-500 text-center font-medium bg-red-50 p-2 rounded border border-red-100">A pasta deve estar vazia para ser excluída.</p>
            </div>
            <div className="flex border-t border-gray-100">
              <button onClick={() => setConfirmDeleteFolder(null)} disabled={isDeleting} className="flex-1 px-6 py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors border-r border-gray-100">Cancelar</button>
              <button onClick={handleDeleteFolder} disabled={isDeleting} className="flex-1 px-6 py-3.5 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
                {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Excluindo...</> : <><Trash2 className="w-4 h-4" /> Sim, Excluir</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL DE NOVA/EDITAR PASTA ═══ */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isSavingFolder && setShowFolderModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{editingFolder ? "Renomear Pasta" : "Nova Pasta"}</h3>
              <button onClick={() => setShowFolderModal(false)} className="text-gray-400 hover:bg-gray-100 p-1 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nome da Pasta</label>
                <input type="text" autoFocus required value={folderNameInput} onChange={e => setFolderNameInput(e.target.value)} placeholder="Ex: Contratos 2026" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowFolderModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={isSavingFolder || !folderNameInput.trim()} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors flex items-center shadow-sm">
                  {isSavingFolder ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null} Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
