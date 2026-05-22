"use client";

import React, { useState, useEffect } from "react";
import { Search, Loader2, FileText, Download, Eye, UploadCloud, Users, Filter, Calendar } from "lucide-react";

type UserBasic = {
  id: string;
  name: string;
  email: string;
};

type DocumentLog = {
  id: string;
  documentId: string;
  action: string;
  createdAt: string;
  user: UserBasic & { role: string };
  document: {
    originalName: string;
    fileUrl: string;
    user: UserBasic;
  };
};

export default function AuditoriaDocumentos() {
  const [logs, setLogs] = useState<DocumentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLogs();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, selectedAction, startDate, endDate, page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
      });

      if (searchTerm) params.append("documentName", searchTerm);
      if (selectedAction) params.append("action", selectedAction);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await fetch(`/api/admin/auditoria-documentos?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.total);
      } else {
        setError("Erro ao carregar auditoria.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "CREATED": return <UploadCloud className="w-4 h-4 text-green-500" />;
      case "DOWNLOADED": return <Download className="w-4 h-4 text-orange-500" />;
      case "VIEWED": return <Eye className="w-4 h-4 text-blue-500" />;
      default: return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "CREATED": return <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">Upload</span>;
      case "DOWNLOADED": return <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-xs font-semibold">Download</span>;
      case "VIEWED": return <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">Visualização</span>;
      default: return <span className="bg-gray-50 text-gray-700 px-2 py-0.5 rounded text-xs font-semibold">{action}</span>;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 bg-white shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center">
              <FileText className="w-5 h-5 mr-2 text-orange-500" /> Auditoria de Documentos
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Rastreamento completo de envios, downloads e visualizações.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
             <div className="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg text-sm font-bold border border-orange-100 flex items-center">
               <Filter className="w-4 h-4 mr-2" /> {totalItems} Registros
             </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar por nome do arquivo..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
            />
          </div>

          <select 
            value={selectedAction}
            onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
          >
            <option value="">Todas as Ações</option>
            <option value="CREATED">Uploads</option>
            <option value="DOWNLOADED">Downloads</option>
            <option value="VIEWED">Visualizações</option>
          </select>

          <div className="relative">
            <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
              title="Data Inicial"
            />
          </div>

          <div className="relative">
            <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
              title="Data Final"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500 font-medium">
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
              <Filter className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700">Nenhum registro encontrado</h3>
            <p className="text-sm text-gray-400 mt-1">Tente ajustar os filtros de busca.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                  <th className="px-5 py-3">Data / Hora</th>
                  <th className="px-5 py-3">Ação</th>
                  <th className="px-5 py-3">Autor da Ação</th>
                  <th className="px-5 py-3">Documento</th>
                  <th className="px-5 py-3">Cliente Dono</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-800">
                        {new Date(log.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getActionIcon(log.action)}
                        {getActionLabel(log.action)}
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold">
                          {log.user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">{log.user.name}</div>
                          <div className="text-[10px] text-gray-400 bg-gray-100 inline-block px-1.5 rounded uppercase tracking-wider font-bold">
                            {log.user.role === 'ADMIN' || log.user.role === 'MASTER' ? 'Equipe' : 'Cliente'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 max-w-[250px] lg:max-w-xs xl:max-w-md">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 truncate font-medium" title={log.document.originalName}>
                          {log.document.originalName}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-700 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {log.document.user.name.split(' ')[0]}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-100 bg-white shrink-0 flex items-center justify-between">
          <div className="text-sm text-gray-500 font-medium">
            Página <span className="text-gray-900 font-bold">{page}</span> de <span className="text-gray-900 font-bold">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
