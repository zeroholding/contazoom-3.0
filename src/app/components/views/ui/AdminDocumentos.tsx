"use client";

import React, { useState, useEffect } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, FileText, Loader2, Users, Store, ShoppingBag } from "lucide-react";

type UserData = {
  id: string;
  name: string;
  email: string;
  connectedAccounts: { provider: string; label: string }[];
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
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Upload UI State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

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
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao fazer upload");
      }
    } catch (err) {
      alert("Erro ao fazer upload");
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  if (error) return <div className="p-8 text-center text-red-600 font-medium">{error}</div>;

  const activeUser = users.find(u => u.id === selectedUser);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <UploadCloud className="w-6 h-6 mr-2 text-orange-500" /> Envio de Documentos
          </h1>
          <p className="text-sm text-gray-500 mt-1">Selecione o cliente, a pasta correspondente e envie o arquivo (PDF, Planilha, etc).</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <form onSubmit={handleUploadDocument} className="space-y-8">
            
            {/* Step 1: User Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 flex items-center">
                <Users className="w-4 h-4 mr-2 text-gray-400" /> 1. Escolha o Cliente
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selecione o usuário destinatário:</label>
                  <select 
                    value={selectedUser} 
                    onChange={e => setSelectedUser(e.target.value)} 
                    className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2.5 border focus:border-orange-500 focus:ring-orange-500 text-gray-900"
                    required
                  >
                    <option value="" disabled>-- Clique para selecionar --</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                </div>

                {/* Info do Usuario Selecionado */}
                {activeUser && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">Contas vinculadas a este cliente:</p>
                    <div className="flex flex-wrap gap-2">
                      {activeUser.connectedAccounts.length === 0 ? (
                        <span className="text-sm text-gray-500 italic">Nenhuma loja conectada ainda.</span>
                      ) : (
                        activeUser.connectedAccounts.map((acc, i) => (
                          <div key={i} className="flex items-center text-xs px-2.5 py-1.5 rounded-md border" style={{
                            backgroundColor: acc.provider === 'shopee' ? '#fff6ed' : '#fef9c3',
                            borderColor: acc.provider === 'shopee' ? '#fed7aa' : '#fef08a',
                            color: acc.provider === 'shopee' ? '#c2410c' : '#854d0e'
                          }}>
                            {acc.provider === 'shopee' ? <ShoppingBag className="w-3.5 h-3.5 mr-1.5" /> : <Store className="w-3.5 h-3.5 mr-1.5" />}
                            <span className="font-semibold">{acc.label}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Categorization */}
            <div className={`space-y-4 transition-opacity ${!selectedUser ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 flex items-center">
                <FileText className="w-4 h-4 mr-2 text-gray-400" /> 2. Classificação do Documento
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pasta Principal:</label>
                  <select 
                    value={selectedCategory} 
                    onChange={e => setSelectedCategory(e.target.value)} 
                    className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2.5 border focus:border-orange-500 focus:ring-orange-500"
                  >
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {selectedCategory === "02_IMPOSTOS" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ano de Referência:</label>
                      <select 
                        value={selectedYear} 
                        onChange={e => setSelectedYear(e.target.value)} 
                        className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2.5 border focus:border-orange-500 focus:ring-orange-500"
                      >
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mês de Referência:</label>
                      <select 
                        value={selectedMonth} 
                        onChange={e => setSelectedMonth(e.target.value)} 
                        className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2.5 border focus:border-orange-500 focus:ring-orange-500"
                      >
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </>
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
                    <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600 justify-center">
                      <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-orange-600 hover:text-orange-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-orange-500">
                        <span>Anexar um arquivo</span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" required onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                      </label>
                      <p className="pl-1">ou arraste e solte aqui</p>
                    </div>
                    <p className="text-xs text-gray-500">PDF, PNG, JPG, XLS até 10MB</p>
                    {uploadFile && (
                      <div className="mt-4 p-2 bg-orange-100 text-orange-800 rounded-md text-sm font-medium border border-orange-200">
                        Selecionado: {uploadFile.name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button & Status */}
            <div className="pt-6 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="w-full md:w-auto">
                {uploadSuccess && (
                  <div className="flex items-center text-green-700 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> {uploadSuccess}
                  </div>
                )}
              </div>
              
              <button 
                type="submit" 
                disabled={!selectedUser || !uploadFile || isUploading}
                className="w-full md:w-auto px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md shadow-orange-500/20"
              >
                {isUploading ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Enviando...</>
                ) : (
                  <><UploadCloud className="w-5 h-5 mr-2" /> Enviar Documento</>
                )}
              </button>
            </div>
            
          </form>
        </div>
      </div>
    </div>
  );
}
