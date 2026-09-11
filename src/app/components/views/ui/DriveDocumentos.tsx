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

  /**
   * Ícone por tipo de arquivo.
   *
   * O vermelho do PDF FICA: é convenção universal (Acrobat), e trocá-lo pelo
   * laranja da marca faria PDF e imagem virarem a mesma coisa num relance — o
   * ícone existe justamente para distingui-los antes da leitura. O azul da
   * imagem, esse sim saiu: não significava nada e brigava com a paleta.
   */
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes("pdf")) return <FileText className="w-8 h-8 text-rose-500" />;
    if (mimeType.includes("image"))
      return <ImageIcon className="w-8 h-8 text-[var(--cz-laranja)]" />;
    return <File className="w-8 h-8 text-[var(--cz-texto-fraco)]" />;
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
      <div className={`w-full lg:w-72 border-r border-[var(--cz-hairline)] bg-[var(--cz-fundo)] flex flex-col shrink-0 lg:h-full overflow-y-auto ${currentFolderId && (currentYear || currentMonth || visibleFiles.length > 0) ? 'hidden lg:flex' : 'flex'}`}>
        {/* Cabeçalho da árvore com o ícone em laranja e a contagem: antes era só a
            palavra "Pastas" em negrito, e a coluna inteira abria em cinza sobre
            cinza. O ícone dá o ponto de cor que ancora a lateral. */}
        <div className="p-4 border-b border-[var(--cz-hairline)] bg-[var(--cz-superficie)] flex justify-between items-center sticky top-0 z-10">
          <h2 className="flex items-center gap-2 font-bold text-[var(--cz-texto)]">
            <span className="grid size-7 place-items-center rounded-lg bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
              <Folder className="w-4 h-4" />
            </span>
            Pastas
          </h2>
          {userFolders.length > 0 && (
            <span className="rounded-full bg-[var(--cz-fundo)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--cz-texto-suave)]">
              {userFolders.length}
            </span>
          )}
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
                  {/* Pasta ativa em LARANJA, com barra na borda esquerda.
                      Era `bg-blue-100 text-blue-700`: azul não significa nada no
                      produto, e "onde eu estou" é a mesma informação que o item
                      ativo do menu lateral — que é laranja. A barra de 2px repete
                      o padrão do menu e é o que permite achar a pasta atual
                      descendo o olho pela margem, numa árvore de vinte pastas. */}
                  <div
                    className={`flex items-center w-full rounded-lg cursor-pointer border-l-2 transition-colors ${
                      isCatActive
                        ? 'border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] font-semibold text-[var(--cz-laranja-forte)]'
                        : 'border-transparent text-[var(--cz-texto)] hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-laranja-forte)]'
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
                        isCatActive
                          ? 'text-[var(--cz-laranja)] fill-[var(--cz-laranja)]/20'
                          : depth > 0 ? 'text-[var(--cz-texto-fraco)]/60' : 'text-[var(--cz-texto-fraco)]'
                      }`} />
                      <span className="text-sm font-medium truncate" title={folder.name}>{folder.name}</span>
                    </div>
                  </div>

                  {/* Subpastas reais (parentId) */}
                  {hasChildren && isExpanded && (
                    <div className="ml-2 mt-1 space-y-1 border-l-2 border-[var(--cz-hairline)] pl-1">
                      {children.map(child => renderFolder(child, depth + 1))}
                    </div>
                  )}

                  {/* Subpastas de Impostos (Anos/Meses) */}
                  {isImpostos && isExpanded && !hasChildren && (
                    <div className="ml-6 mt-1 space-y-1 border-l-2 border-[var(--cz-hairline)] pl-2">
                      {availYears.map(year => {
                        const isYearActive = currentFolderId === folder.id && currentYear === year && !currentMonth;
                        const isYearExpanded = expandedYears[year];

                        return (
                          <div key={year}>
                            <div className={`flex items-center w-full rounded-lg cursor-pointer border-l-2 transition-colors ${
                              isYearActive
                                ? 'border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] font-semibold text-[var(--cz-laranja-forte)]'
                                : 'border-transparent text-[var(--cz-texto-suave)] hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-laranja-forte)]'
                            }`}>
                              <button className="p-2" onClick={() => toggleYear(year)}>
                                {isYearExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                              <div className="flex items-center flex-1 py-1.5 pr-2" onClick={() => selectFolder(folder.id, year)}>
                                <Folder className={`w-4 h-4 mr-2 ${
                                  isYearActive
                                    ? 'text-[var(--cz-laranja)] fill-[var(--cz-laranja)]/20'
                                    : 'text-[var(--cz-texto-fraco)]'
                                }`} />
                                <span className="text-sm font-medium">{year}</span>
                              </div>
                            </div>

                            {isYearExpanded && (
                              <div className="ml-5 mt-1 space-y-1 border-l-2 border-[var(--cz-hairline)] pl-2">
                                {MONTHS.map(month => {
                                  const isMonthActive = currentFolderId === folder.id && currentYear === year && currentMonth === month;
                                  return (
                                    <div
                                      key={month}
                                      className={`flex items-center py-1.5 px-3 rounded-lg cursor-pointer border-l-2 transition-colors ${
                                        isMonthActive
                                          ? 'border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] font-semibold text-[var(--cz-laranja-forte)]'
                                          : 'border-transparent text-[var(--cz-texto-suave)] hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-laranja-forte)]'
                                      }`}
                                      onClick={() => selectFolder(folder.id, year, month)}
                                    >
                                      <Folder className={`w-3.5 h-3.5 mr-2 ${
                                        isMonthActive
                                          ? 'text-[var(--cz-laranja)] fill-[var(--cz-laranja)]/20'
                                          : 'text-[var(--cz-texto-fraco)]/60'
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
                className="lg:hidden rounded-lg p-2 -ml-2 text-[var(--cz-texto-suave)] transition-colors hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)]"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center text-xs sm:text-sm text-[var(--cz-texto-suave)] mb-1 space-x-2">
                <span className="font-semibold text-[var(--cz-laranja-forte)]">{userFolders.find(c => c.id === currentFolderId)?.name || "Documentos"}</span>
                {currentYear && <><ChevronRight className="w-4 h-4" /><span>{currentYear}</span></>}
                {currentMonth && <><ChevronRight className="w-4 h-4" /><span>{currentMonth}</span></>}
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-[var(--cz-texto)]">
                {userFolders.find(c => c.id === currentFolderId)?.name || "Todos os Documentos"}
              </h1>
            </div>
          </div>

          {/* Contagem de arquivos da pasta aberta.
              O cabeçalho repetia o nome da pasta duas vezes (no caminho e no
              título) e não dizia o que mais importa ao abrir uma pasta: se tem
              algo dentro. */}
          {!loading && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] px-3 py-1 text-[12px] font-bold text-[var(--cz-laranja-forte)]">
              <FileText className="w-3.5 h-3.5" />
              {visibleFiles.length}{" "}
              {visibleFiles.length === 1 ? "arquivo" : "arquivos"}
            </span>
          )}
        </div>

        {/* Corpo da Área Principal */}
        {/* O conteúdo assenta no fundo claro do produto, e os cartões brancos se
            destacam dele. Era `bg-gray-50/30`, um cinza fora dos tokens que ficava
            levemente diferente do fundo das outras telas. */}
        <div className="flex-1 p-6 overflow-y-auto bg-[var(--cz-fundo)]">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--cz-laranja)]" />
            </div>
          ) : visibleFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-[var(--cz-texto-suave)]">
              {/* O círculo da pasta vazia ganhou o laranja suave e o fio da marca.
                  Cinza sobre cinza fazia o vazio parecer erro de carregamento —
                  que é uma informação diferente de "esta pasta não tem nada". */}
              <div className="mb-4 grid size-20 place-items-center rounded-full border border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)]">
                <Folder className="w-9 h-9 text-[var(--cz-laranja)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--cz-texto)]">
                Esta pasta está vazia
              </h3>
              <p className="mt-1 max-w-sm text-sm leading-relaxed">
                Nenhum documento foi enviado para cá ainda. Quando o contador subir
                um arquivo nesta pasta, ele aparece aqui.
              </p>
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
                    className="flex flex-col p-4 bg-[var(--cz-superficie)] border border-[var(--cz-hairline)] rounded-xl transition-all group cursor-pointer hover:border-[var(--cz-laranja-borda)] hover:bg-[var(--cz-laranja-suave)]/40 hover:shadow-[var(--cz-elev-1)]"
                    onClick={() => window.open(`${doc.fileUrl}?action=view`, '_blank')}
                  >
                    <div className="flex items-start">
                      {/* O ícone ganhou um quadro claro atrás: solto sobre o cartão
                          branco ele flutuava, e o cartão inteiro ficava sem nenhum
                          ponto de ancoragem visual. */}
                      <div className="relative mt-0.5 grid size-12 shrink-0 place-items-center rounded-lg border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] transition-colors group-hover:border-[var(--cz-laranja-borda)]">
                        {getFileIcon(doc.mimeType)}
                        {/* A etiqueta do tipo era `bg-gray-800` — um retângulo preto
                            no canto de cada cartão, o elemento de maior contraste
                            de uma tela que não é sobre o formato do arquivo. */}
                        <span className="absolute -top-1.5 -right-1.5 rounded bg-[var(--cz-laranja)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow-sm">
                          {fileExt}
                        </span>
                      </div>
                      <div className="ml-3 flex-1 overflow-hidden">
                        {/* Duas linhas: nome de documento fiscal é longo por
                            natureza ("DAS-2026-03-EMPRESA-LTDA.pdf") e cortado numa
                            linha só, dois arquivos do mesmo mês ficam idênticos. */}
                        <p className="text-sm font-semibold leading-snug text-[var(--cz-texto)] line-clamp-2" title={doc.originalName}>
                          {doc.originalName}
                        </p>
                        <p className="text-xs text-[var(--cz-texto-suave)] mt-1">
                          {formatSize(doc.sizeBytes)} • {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                        {storeLabel && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {storeLabel.split(",").map((s, idx) => (
                              <div key={idx} className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border bg-[var(--cz-fundo)] border-[var(--cz-hairline-forte)] text-[var(--cz-texto-suave)] font-medium">
                                <Store className="w-3 h-3 mr-1" />
                                <span className="truncate max-w-[120px]">{s}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* O botão de baixar era `opacity-0` até o hover — invisível
                          em telas de toque, onde não existe hover, e ali o cartão
                          inteiro só abria o arquivo. Agora ele fica visível em tinta
                          fraca e ganha o laranja no hover: a ação existe sempre, e
                          o realce diz que é clicável. */}
                      <div className="ml-2 flex flex-col space-y-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); window.open(`${doc.fileUrl}?action=download`, '_self'); }}
                        className="rounded-lg p-1.5 text-[var(--cz-texto-fraco)] transition-colors hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)]"
                        title="Baixar arquivo"
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
