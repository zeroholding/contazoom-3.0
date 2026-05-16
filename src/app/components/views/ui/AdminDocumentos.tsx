"use client";

import React, { useState, useEffect } from "react";
import { UploadCloud, CheckCircle2, FileText, Loader2, Users, Store, Eye, Download, History, Search } from "lucide-react";
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
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  fileUrl: string;
  logs: DocumentLog[];
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

export default function AdminDocumentos() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("01_INSTITUCIONAIS");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [expandedDocLogs, setExpandedDocLogs] = useState<string | null>(null);

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchUserDocuments(selectedUser);
      setUploadSuccess(null);
      setSelectedStores([]);
    } else {
      setUserDocuments([]);
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

  const handleToggleStore = (storeLabel: string) => {
    setSelectedStores(prev => 
      prev.includes(storeLabel) ? prev.filter(s => s !== storeLabel) : [...prev, storeLabel]
    );
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !selectedUser) return;
    setIsUploading(true);
    setUploadSuccess(null);
    
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("category", selectedCategory);
    formData.append("userId", selectedUser);
    
    let subFolder = "";
    const storesStr = selectedStores.length > 0 ? selectedStores.join(",") : "";
    if (selectedCategory === "02_IMPOSTOS") {
      subFolder = `${selectedYear}/${selectedMonth}`;
      if (storesStr) subFolder += `/${storesStr}`;
    } else if (storesStr) {
      subFolder = storesStr;
    }
    if (subFolder) formData.append("subFolder", subFolder);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      if (res.ok) {
        setUploadSuccess("Documento enviado com sucesso!");
        setUploadFile(null);
        const fileInput = document.getElementById("file-upload") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        fetchUserDocuments(selectedUser);
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao fazer upload.");
      }
    } catch { alert("Erro ao fazer upload. Verifique as permissões da pasta /app/uploads."); }
    finally { setIsUploading(false); }
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
    <div className="flex h-[calc(100vh-64px)] bg-[#F8FAFC] overflow-hidden">
      
      {/* ═══ COL 1 — CLIENT LIST ═══ */}
      <aside className="w-72 xl:w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900 flex items-center">
            <Users className="w-4 h-4 mr-2 text-orange-500" /> Clientes
          </h2>
          <div className="mt-3 relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" placeholder="Buscar cliente..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
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
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${selectedUser === u.id ? 'text-orange-900' : 'text-gray-800'}`}>{u.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ═══ COL 2 — DOCUMENTS ═══ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="px-8 py-5 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              {activeUser ? `Documentos de ${activeUser.name.split(' ')[0]}` : "Centro de Documentos"}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeUser ? "Gerencie arquivos, envie relatórios e acompanhe acessos." : "Selecione um cliente à esquerda."}
            </p>
          </div>
          {loadingDocs && <Loader2 className="w-5 h-5 animate-spin text-orange-500" />}
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
                  <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-orange-200 transition-all flex flex-col">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isPdf ? 'bg-red-50' : 'bg-blue-50'}`}>
                        <FileText className={`w-5 h-5 ${isPdf ? 'text-red-500' : 'text-blue-500'}`} />
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded uppercase tracking-wider">{fileExt}</span>
                    </div>
                    
                    <h4 className="text-sm font-semibold text-gray-900 truncate mb-1" title={doc.originalName}>{doc.originalName}</h4>
                    <p className="text-[11px] text-gray-400 mb-3">{new Date(doc.createdAt).toLocaleDateString('pt-BR')} • {(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                    
                    <div className="flex flex-wrap gap-1.5 mb-auto">
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {CATEGORIES.find(c => c.id === doc.category)?.name.replace(/^\d+\.\s*/, '')}
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

              {/* Category */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Classificação</label>
                <div className="space-y-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c.id} type="button" onClick={() => setSelectedCategory(c.id)}
                      className={`w-full text-left text-[11px] px-3 py-2 rounded-lg border transition-all ${
                        selectedCategory === c.id 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold ring-1 ring-blue-300' 
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >{c.name.replace(/^\d+\.\s*/, '')}</button>
                  ))}
                </div>
              </div>

              {/* Month/Year for Impostos */}
              {selectedCategory === "02_IMPOSTOS" && (
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
          <div className="p-4 border-t border-gray-100">
            {uploadSuccess && (
              <div className="mb-2.5 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-[11px] font-medium flex items-center border border-green-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> {uploadSuccess}
              </div>
            )}
            <button type="submit" form="upload-form" disabled={!uploadFile || isUploading}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-md shadow-orange-500/20 active:scale-[0.98]"
            >
              {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : <><UploadCloud className="w-4 h-4 mr-2" /> Enviar Documento</>}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
