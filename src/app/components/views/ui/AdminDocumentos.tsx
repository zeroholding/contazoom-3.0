"use client";

import React, { useState, useEffect } from "react";
import { UploadCloud, CheckCircle2, FileText, Loader2, Users, Store, ShoppingBag, Eye, Download, History } from "lucide-react";
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
  
  // Selection States
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState("01_INSTITUCIONAIS");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedStoreLabel, setSelectedStoreLabel] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Upload UI State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Documents State
  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [expandedDocLogs, setExpandedDocLogs] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchUserDocuments(selectedUser);
      setUploadSuccess(null);
    } else {
      setUserDocuments([]);
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        setError("Erro ao carregar lista de clientes.");
      }
    } catch (err) {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDocuments = async (userId: string) => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setUserDocuments(data);
      }
    } catch (err) {
      console.error("Erro ao carregar documentos:", err);
    } finally {
      setLoadingDocs(false);
    }
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
    if (selectedCategory === "02_IMPOSTOS") {
      subFolder = `${selectedYear}/${selectedMonth}`;
      if (selectedStoreLabel) subFolder += `/${selectedStoreLabel}`;
    } else if (selectedStoreLabel) {
      subFolder = selectedStoreLabel;
    }
    if (subFolder) formData.append("subFolder", subFolder);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setUploadSuccess(`Documento enviado com sucesso!`);
        setUploadFile(null);
        // Reset file input
        const fileInput = document.getElementById("file-upload") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        
        // Refresh docs
        fetchUserDocuments(selectedUser);
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao fazer upload. Você pode precisar corrigir as permissões do servidor.");
      }
    } catch (err) {
      alert("Erro ao fazer upload. Verifique as permissões da pasta /app/uploads.");
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  if (error) return <div className="p-8 text-center text-red-600 font-medium">{error}</div>;

  const activeUser = users.find(u => u.id === selectedUser);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <UploadCloud className="w-6 h-6 mr-2 text-orange-500" /> Envio e Histórico de Documentos
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie os documentos dos clientes, veja quem visualizou e quando.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Painel Esquerdo: Formulário de Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-fit">
          <div className="p-6">
            <form onSubmit={handleUploadDocument} className="space-y-8">
              
              {/* Step 1: User Selection */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 flex items-center">
                  <Users className="w-4 h-4 mr-2 text-gray-400" /> 1. Escolha o Cliente
                </h3>
                
                <div>
                  <select 
                    value={selectedUser} 
                    onChange={e => {
                      setSelectedUser(e.target.value);
                      setSelectedStoreLabel("");
                    }} 
                    className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2.5 border focus:border-orange-500 focus:ring-orange-500 text-gray-900"
                    required
                  >
                    <option value="" disabled>-- Clique para selecionar --</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                </div>

                {/* Info do Usuario Selecionado */}
                {activeUser && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Lojas conectadas:</p>
                    <div className="flex flex-wrap gap-2">
                      {activeUser.connectedAccounts.length === 0 ? (
                        <span className="text-sm text-gray-500 italic">Nenhuma loja.</span>
                      ) : (
                        activeUser.connectedAccounts.map((acc, i) => (
                          <div key={i} className="flex items-center text-xs px-2.5 py-1.5 rounded-md border bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors">
                            {acc.provider === 'shopee' ? (
                              <ShopeeIcon className="w-4 h-4 mr-2" />
                            ) : (
                              <MeliIcon className="w-4 h-4 mr-2" />
                            )}
                            <span className="font-semibold truncate max-w-[150px]">{acc.label}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Categorization */}
              <div className={`space-y-4 transition-opacity ${!selectedUser ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-gray-400" /> 2. Classificação
                </h3>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Pasta Principal:</label>
                    <select 
                      value={selectedCategory} 
                      onChange={e => setSelectedCategory(e.target.value)} 
                      className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-orange-500 focus:ring-orange-500 text-sm"
                    >
                      {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  
                  {activeUser && activeUser.connectedAccounts.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Loja Vinculada (Opcional):</label>
                      <select 
                        value={selectedStoreLabel} 
                        onChange={e => setSelectedStoreLabel(e.target.value)} 
                        className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-orange-500 focus:ring-orange-500 text-sm"
                      >
                        <option value="">Geral (Nenhuma Loja Específica)</option>
                        {activeUser.connectedAccounts.map((acc, i) => (
                          <option key={i} value={acc.label}>{acc.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedCategory === "02_IMPOSTOS" && (
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Ano:</label>
                        <select 
                          value={selectedYear} 
                          onChange={e => setSelectedYear(e.target.value)} 
                          className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-orange-500 focus:ring-orange-500 text-sm"
                        >
                          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Mês:</label>
                        <select 
                          value={selectedMonth} 
                          onChange={e => setSelectedMonth(e.target.value)} 
                          className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-orange-500 focus:ring-orange-500 text-sm"
                        >
                          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: File Upload */}
              <div className={`space-y-4 transition-opacity ${!selectedUser ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 flex items-center">
                  <UploadCloud className="w-4 h-4 mr-2 text-gray-400" /> 3. Arquivo
                </h3>
                
                <div>
                  <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl bg-gray-50 hover:bg-orange-50 transition-colors">
                    <div className="space-y-2 text-center">
                      <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                      <div className="flex text-sm text-gray-600 justify-center">
                        <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-orange-600 hover:text-orange-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-orange-500">
                          <span>Anexar arquivo</span>
                          <input id="file-upload" name="file-upload" type="file" className="sr-only" required onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">Sem limite rígido (depende do servidor)</p>
                      {uploadFile && (
                        <div className="mt-4 p-2 bg-orange-100 text-orange-800 rounded-md text-xs font-medium border border-orange-200 truncate max-w-xs">
                          {uploadFile.name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button & Status */}
              <div className="pt-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="w-full md:w-auto">
                  {uploadSuccess && (
                    <div className="flex items-center text-green-700 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4 mr-1" /> {uploadSuccess}
                    </div>
                  )}
                </div>
                
                <button 
                  type="submit" 
                  disabled={!selectedUser || !uploadFile || isUploading}
                  className="w-full md:w-auto px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md shadow-orange-500/20"
                >
                  {isUploading ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Enviando...</>
                  ) : (
                    <><UploadCloud className="w-5 h-5 mr-2" /> Enviar Arquivo</>
                  )}
                </button>
              </div>
              
            </form>
          </div>
        </div>

        {/* Painel Direito: Lista de Documentos e Logs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-gray-500" /> 
              {activeUser ? `Documentos de ${activeUser.name.split(' ')[0]}` : "Selecione um cliente ao lado"}
            </h3>
            {loadingDocs && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
          </div>

          <div className="flex-1 overflow-y-auto p-0 max-h-[700px]">
            {!activeUser ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                <Users className="w-12 h-12 mb-3 opacity-20" />
                <p>Nenhum cliente selecionado.</p>
              </div>
            ) : userDocuments.length === 0 && !loadingDocs ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                <FileText className="w-12 h-12 mb-3 opacity-20" />
                <p>Este cliente ainda não possui documentos.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {userDocuments.map(doc => (
                  <li key={doc.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 truncate max-w-xs md:max-w-sm" title={doc.originalName}>{doc.originalName}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {CATEGORIES.find(c => c.id === doc.category)?.name.replace(/^\d+\.\s*/, '')} {doc.subFolder ? `(${doc.subFolder})` : ''}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Enviado em: {new Date(doc.createdAt).toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => window.open(`${doc.fileUrl}?action=view`, '_blank')}
                          className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                          title="Visualizar no Navegador"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => window.open(`${doc.fileUrl}?action=download`, '_blank')}
                          className="p-1.5 text-orange-600 bg-orange-50 rounded hover:bg-orange-100 transition-colors"
                          title="Fazer Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setExpandedDocLogs(expandedDocLogs === doc.id ? null : doc.id)}
                          className={`p-1.5 rounded transition-colors ${expandedDocLogs === doc.id ? 'bg-gray-800 text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
                          title="Ver Logs de Acesso"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Painel de Logs Expandível */}
                    {expandedDocLogs === doc.id && (
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider flex items-center">
                          <History className="w-3 h-3 mr-1" /> Histórico de Acessos
                        </p>
                        {doc.logs && doc.logs.length > 0 ? (
                          <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                            {doc.logs.map((log, idx) => (
                              <div key={idx} className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded border border-gray-100">
                                <div>
                                  <span className={`font-medium ${log.action === 'CREATED' ? 'text-green-600' : log.action === 'VIEWED' ? 'text-blue-600' : 'text-orange-600'}`}>
                                    {log.action === 'CREATED' ? 'CRIADO' : log.action === 'VIEWED' ? 'VISUALIZADO' : 'BAIXADO'}
                                  </span>
                                  <span className="text-gray-500 mx-1">por</span>
                                  <span className="font-semibold text-gray-800">{log.user.name}</span>
                                </div>
                                <span className="text-gray-400 font-mono text-[10px]">{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic">Nenhum log registrado para este documento.</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
