"use client";

import {
  ArrowLeft,
  ChevronRight,
  Download,
  File,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Image as ImageIcon,
  Loader2,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { DOCUMENT_MONTHS as MONTHS } from "@/lib/document-categories";

type Document = {
  id: string;
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

type UserOption = { id: string; name?: string | null; email?: string | null };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string, className = "size-6"): ReactNode {
  if (mimeType.includes("pdf")) return <FileText className={`${className} text-rose-500`} />;
  if (mimeType.includes("image")) {
    return <ImageIcon className={`${className} text-[var(--cz-laranja)]`} />;
  }
  return <File className={`${className} text-[var(--cz-texto-fraco)]`} />;
}

function fileType(document: Document) {
  if (document.mimeType.includes("pdf")) return "PDF";
  if (document.mimeType.includes("image")) return "IMG";
  return document.originalName.split(".").pop()?.slice(0, 4).toUpperCase() || "DOC";
}

export default function DriveDocumentos() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);

  const loadDocuments = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);

    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const response = await fetch(`/api/documents${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao buscar documentos");

      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setIsAdmin(Boolean(data.isAdmin));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao buscar documentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments(selectedUserId);
  }, [loadDocuments, selectedUserId]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadUsers = async () => {
      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        const data = await response.json();
        if (response.ok && Array.isArray(data)) setUsers(data);
      } catch {
        // O seletor administrativo é auxiliar; a área do próprio usuário segue útil.
      }
    };

    void loadUsers();
  }, [isAdmin]);

  const foldersById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );

  const topLevelFolders = useMemo(
    () => folders.filter((folder) => !folder.parentId),
    [folders],
  );

  const folderPath = useCallback(
    (folderId: string | null) => {
      const path: DocumentFolder[] = [];
      const visited = new Set<string>();
      let folder = folderId ? foldersById.get(folderId) : undefined;

      while (folder && !visited.has(folder.id)) {
        visited.add(folder.id);
        path.unshift(folder);
        folder = folder.parentId ? foldersById.get(folder.parentId) : undefined;
      }

      return path;
    },
    [foldersById],
  );

  const documentLocation = useCallback(
    (document: Document) => {
      const path = folderPath(document.folderId ?? document.folder?.id ?? null).map(
        (folder) => folder.name,
      );
      if (document.subFolder) path.push(...document.subFolder.split("/").filter(Boolean));
      return path.length > 0 ? path.join(" / ") : "Documentos";
    },
    [folderPath],
  );

  const isInFolderTree = useCallback(
    (documentFolderId: string | null, targetFolderId: string) =>
      folderPath(documentFolderId).some((folder) => folder.id === targetFolderId),
    [folderPath],
  );

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of folders) {
      counts.set(
        folder.id,
        documents.filter((document) => isInFolderTree(document.folderId, folder.id)).length,
      );
    }
    return counts;
  }, [documents, folders, isInFolderTree]);

  const childFolders = useMemo(
    () =>
      currentFolderId
        ? folders.filter((folder) => folder.parentId === currentFolderId)
        : [],
    [currentFolderId, folders],
  );

  const availableYears = useMemo(() => {
    if (!currentFolderId) return [];
    return Array.from(
      new Set(
        documents
          .filter((document) => document.folderId === currentFolderId && document.subFolder)
          .map((document) => document.subFolder?.split("/")[0])
          .filter((year): year is string => Boolean(year)),
      ),
    ).sort((a, b) => b.localeCompare(a));
  }, [currentFolderId, documents]);

  const visibleFiles = useMemo(() => {
    if (!currentFolderId) return [];
    return documents.filter((document) => {
      if (document.folderId !== currentFolderId && document.folder?.id !== currentFolderId) {
        return false;
      }
      if (currentYear && !document.subFolder?.startsWith(currentYear)) return false;
      if (currentMonth && !document.subFolder?.startsWith(`${currentYear}/${currentMonth}`)) {
        return false;
      }
      return true;
    });
  }, [currentFolderId, currentMonth, currentYear, documents]);

  const recentDocuments = useMemo(() => documents.slice(0, 6), [documents]);
  const currentFolder = currentFolderId ? foldersById.get(currentFolderId) : undefined;
  const currentIsTaxes = currentFolder?.name.toUpperCase().includes("IMPOSTO") ?? false;

  const openHome = () => {
    setCurrentFolderId(null);
    setCurrentYear(null);
    setCurrentMonth(null);
  };

  const openFolder = (folderId: string, year?: string, month?: string) => {
    setCurrentFolderId(folderId);
    setCurrentYear(year ?? null);
    setCurrentMonth(month ?? null);
  };

  const openDocumentFolder = (document: Document) => {
    const folderId = document.folderId ?? document.folder?.id;
    if (!folderId) return;
    const [year, month] = document.subFolder?.split("/") ?? [];
    openFolder(folderId, year, month);
  };

  const renderFolderTree = (folder: DocumentFolder, depth = 0): ReactNode => {
    const children = folders.filter((candidate) => candidate.parentId === folder.id);
    const active = folder.id === currentFolderId;

    return (
      <div key={folder.id}>
        <button
          type="button"
          onClick={() => openFolder(folder.id)}
          className={`flex w-full items-center gap-2 rounded-lg border-l-2 py-2.5 pr-3 text-left text-sm transition-colors ${
            active
              ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] font-semibold text-[var(--cz-laranja-forte)]"
              : "border-transparent text-[var(--cz-texto-suave)] hover:bg-[var(--cz-superficie)] hover:text-[var(--cz-texto)]"
          }`}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
        >
          {active ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className="text-[11px] tabular-nums text-[var(--cz-texto-fraco)]">
            {folderCounts.get(folder.id) ?? 0}
          </span>
        </button>
        {children.map((child) => renderFolderTree(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex min-h-[calc(100vh-7rem)] w-full overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-[var(--cz-hairline)] bg-[var(--cz-fundo)] lg:flex">
        <div className="border-b border-[var(--cz-hairline)] p-4">
          <button
            type="button"
            onClick={openHome}
            className={`flex w-full items-center gap-2 rounded-lg border-l-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
              !currentFolderId
                ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
                : "border-transparent text-[var(--cz-texto)] hover:bg-[var(--cz-superficie)]"
            }`}
          >
            <Home className="size-4" />
            Seus documentos
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cz-texto-fraco)]">
            Pastas
          </p>
          {topLevelFolders.map((folder) => renderFolderTree(folder))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-[var(--cz-fundo)]">
        <header className="sticky top-0 z-10 border-b border-[var(--cz-hairline)] bg-[var(--cz-superficie)] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {currentFolderId && (
                <button
                  type="button"
                  onClick={openHome}
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--cz-hairline)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
                  aria-label="Voltar para documentos"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-xs font-medium text-[var(--cz-texto-fraco)]">
                  <span>Documentos</span>
                  {currentFolder && (
                    <>
                      <ChevronRight className="size-3" />
                      <span className="truncate">{currentFolder.name}</span>
                    </>
                  )}
                </p>
                <h1 className="truncate text-xl font-extrabold text-[var(--cz-texto)] sm:text-2xl">
                  {currentFolder?.name ?? "Seus documentos"}
                </h1>
              </div>
            </div>

            {isAdmin && users.length > 0 && (
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--cz-texto-suave)]">
                Cliente
                <select
                  value={selectedUserId}
                  onChange={(event) => {
                    setSelectedUserId(event.target.value);
                    openHome();
                  }}
                  className="h-9 max-w-56 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-sm text-[var(--cz-texto)] outline-none focus:border-[var(--cz-laranja)]"
                >
                  <option value="">Minha conta</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email || user.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>

        <div className="h-[calc(100%-5rem)] overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="grid min-h-80 place-items-center">
              <Loader2 className="size-8 animate-spin text-[var(--cz-laranja)]" />
            </div>
          ) : error ? (
            <div className="mx-auto grid min-h-80 max-w-md place-items-center text-center">
              <div>
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-rose-50 text-rose-500">
                  <FileText className="size-7" />
                </div>
                <h2 className="font-bold text-[var(--cz-texto)]">Não foi possível carregar</h2>
                <p className="mt-1 text-sm text-[var(--cz-texto-suave)]">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadDocuments(selectedUserId)}
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--cz-laranja)] px-4 text-sm font-bold text-white hover:bg-[var(--cz-laranja-forte)]"
                >
                  <RefreshCw className="size-4" />
                  Tentar novamente
                </button>
              </div>
            </div>
          ) : !currentFolderId ? (
            <div className="space-y-7">
              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-[var(--cz-texto)]">Adicionados recentemente</h2>
                    <p className="text-sm text-[var(--cz-texto-suave)]">Acesse o arquivo ou vá direto ao local onde ele foi organizado.</p>
                  </div>
                  <span className="hidden text-xs font-semibold text-[var(--cz-texto-fraco)] sm:block">
                    {documents.length} {documents.length === 1 ? "documento" : "documentos"}
                  </span>
                </div>

                {recentDocuments.length === 0 ? (
                  <div className="rounded-[var(--cz-raio-cartao)] border border-dashed border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] p-8 text-center text-sm text-[var(--cz-texto-suave)]">
                    Nenhum documento foi adicionado ainda.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
                    {recentDocuments.map((document, index) => (
                      <div
                        key={document.id}
                        className={`relative flex items-start gap-3 p-4 sm:items-center ${
                          index > 0 ? "border-t border-[var(--cz-hairline)]" : ""
                        }`}
                      >
                        <div className="relative z-[1] grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--cz-fundo)]">
                          {fileIcon(document.mimeType, "size-5")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => window.open(`${document.fileUrl}?action=view`, "_blank")}
                            className="block max-w-full truncate text-left text-sm font-bold text-[var(--cz-texto)] hover:text-[var(--cz-laranja-forte)]"
                            title={document.originalName}
                          >
                            {document.originalName}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDocumentFolder(document)}
                            className="mt-1 flex max-w-full items-center gap-1 text-left text-xs text-[var(--cz-texto-suave)] hover:text-[var(--cz-laranja-forte)]"
                          >
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{documentLocation(document)}</span>
                          </button>
                        </div>
                        <div className="hidden shrink-0 text-right sm:block">
                          <p className="text-xs font-semibold text-[var(--cz-texto-suave)]">
                            {new Date(document.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                          <p className="text-[11px] text-[var(--cz-texto-fraco)]">{formatSize(document.sizeBytes)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.open(`${document.fileUrl}?action=download`, "_self")}
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--cz-texto-fraco)] hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)]"
                          title="Baixar arquivo"
                        >
                          <Download className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-base font-extrabold text-[var(--cz-texto)]">Pastas</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {topLevelFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => openFolder(folder.id)}
                      className="group flex items-center gap-3 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 text-left transition-all hover:border-[var(--cz-laranja-borda)] hover:shadow-[var(--cz-elev-1)]"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                        <Folder className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--cz-texto)]">{folder.name}</span>
                        <span className="text-xs text-[var(--cz-texto-suave)]">
                          {folderCounts.get(folder.id) ?? 0} arquivos
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-[var(--cz-texto-fraco)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--cz-laranja-forte)]" />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-5">
              {childFolders.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-extrabold text-[var(--cz-texto)]">
                    Subpastas
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {childFolders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => openFolder(folder.id)}
                        className="group flex items-center gap-3 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 text-left transition-all hover:border-[var(--cz-laranja-borda)] hover:shadow-[var(--cz-elev-1)]"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                          <Folder className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[var(--cz-texto)]">
                            {folder.name}
                          </span>
                          <span className="text-xs text-[var(--cz-texto-suave)]">
                            {folderCounts.get(folder.id) ?? 0} arquivos
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-[var(--cz-texto-fraco)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--cz-laranja-forte)]" />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {currentIsTaxes && availableYears.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openFolder(currentFolderId)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                      !currentYear
                        ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
                        : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)]"
                    }`}
                  >
                    Todos
                  </button>
                  {availableYears.map((year) => (
                    <button
                      key={year}
                      type="button"
                      onClick={() => openFolder(currentFolderId, year)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                        currentYear === year && !currentMonth
                          ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
                          : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)]"
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                  {currentYear &&
                    MONTHS.map((month) => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => openFolder(currentFolderId, currentYear, month)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                          currentMonth === month
                            ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
                            : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)]"
                        }`}
                      >
                        {month.split(" - ")[1] ?? month}
                      </button>
                    ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--cz-texto-suave)]">
                  {visibleFiles.length} {visibleFiles.length === 1 ? "arquivo" : "arquivos"}
                </p>
              </div>

              {visibleFiles.length === 0 ? (
                <div className="grid min-h-72 place-items-center rounded-[var(--cz-raio-cartao)] border border-dashed border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-center">
                  <div className="p-6">
                    <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja)]">
                      <Folder className="size-7" />
                    </div>
                    <h2 className="font-bold text-[var(--cz-texto)]">Esta pasta está vazia</h2>
                    <p className="mt-1 text-sm text-[var(--cz-texto-suave)]">Os próximos documentos enviados para este local aparecerão aqui.</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {visibleFiles.map((document) => (
                    <article
                      key={document.id}
                      className="group flex min-w-0 flex-col rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 transition-all hover:border-[var(--cz-laranja-borda)] hover:shadow-[var(--cz-elev-1)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--cz-fundo)]">
                          {fileIcon(document.mimeType)}
                          <span className="absolute -right-1 -top-1 rounded bg-[var(--cz-laranja)] px-1 py-0.5 text-[8px] font-extrabold text-white">
                            {fileType(document)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[var(--cz-texto)]" title={document.originalName}>
                            {document.originalName}
                          </h3>
                          <p className="mt-1 text-xs text-[var(--cz-texto-suave)]">
                            {formatSize(document.sizeBytes)} · {new Date(document.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2 border-t border-[var(--cz-hairline)] pt-3">
                        <button
                          type="button"
                          onClick={() => window.open(`${document.fileUrl}?action=view`, "_blank")}
                          className="h-8 flex-1 rounded-lg bg-[var(--cz-laranja-suave)] text-xs font-bold text-[var(--cz-laranja-forte)] hover:bg-[var(--cz-laranja)] hover:text-white"
                        >
                          Visualizar
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(`${document.fileUrl}?action=download`, "_self")}
                          className="grid size-8 place-items-center rounded-lg border border-[var(--cz-hairline-forte)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
                          title="Baixar arquivo"
                        >
                          <Download className="size-4" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
