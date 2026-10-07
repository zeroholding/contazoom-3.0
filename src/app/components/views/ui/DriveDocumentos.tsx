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
  MapPin,
  Menu,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
type FileFilter = "all" | "pdf" | "image" | "other";

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

function matchesFileFilter(document: Document, filter: FileFilter) {
  if (filter === "pdf") return document.mimeType.includes("pdf");
  if (filter === "image") return document.mimeType.includes("image");
  if (filter === "other") {
    return !document.mimeType.includes("pdf") && !document.mimeType.includes("image");
  }
  return true;
}

function DocumentsSkeleton() {
  return (
    <div className="animate-pulse space-y-7" aria-label="Carregando documentos" role="status">
      <span className="sr-only">Carregando documentos</span>
      <div className="space-y-3">
        <div className="h-5 w-48 rounded bg-[var(--cz-hairline-forte)]" />
        <div className="overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className={`flex items-center gap-3 p-4 ${item ? "border-t border-[var(--cz-hairline)]" : ""}`}
            >
              <div className="size-11 rounded-xl bg-[var(--cz-hairline-forte)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-[var(--cz-hairline-forte)]" />
                <div className="h-3 w-1/3 rounded bg-[var(--cz-hairline)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-20 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]"
          />
        ))}
      </div>
    </div>
  );
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
  const [searchTerm, setSearchTerm] = useState("");
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [isFolderDrawerOpen, setIsFolderDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRootRef = useRef<HTMLDivElement | null>(null);

  const loadDocuments = useCallback(async (userId: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const response = await fetch(`/api/documents${query}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao buscar documentos");

      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setIsAdmin(Boolean(data.isAdmin));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Erro ao buscar documentos");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDocuments(selectedUserId, controller.signal);
    return () => controller.abort();
  }, [loadDocuments, selectedUserId]);

  useEffect(() => {
    if (!isAdmin || users.length > 0) return;

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
  }, [isAdmin, users.length]);

  useEffect(() => {
    if (!isFolderDrawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    const scrollContainer = contentRootRef.current?.closest("main") as HTMLElement | null;
    const previousScrollOverflow = scrollContainer?.style.overflow ?? "";
    const trigger = drawerTriggerRef.current;
    document.body.style.overflow = "hidden";
    if (scrollContainer) scrollContainer.style.overflow = "hidden";

    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleDrawerKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsFolderDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("hidden"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDrawerKeys);
    return () => {
      window.removeEventListener("keydown", handleDrawerKeys);
      document.body.style.overflow = previousOverflow;
      if (scrollContainer) scrollContainer.style.overflow = previousScrollOverflow;
      trigger?.focus();
    };
  }, [isFolderDrawerOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeDrawerOnDesktop = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setIsFolderDrawerOpen(false);
    };

    closeDrawerOnDesktop(desktop);
    desktop.addEventListener("change", closeDrawerOnDesktop);
    return () => desktop.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

  const foldersById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );

  const foldersByParent = useMemo(() => {
    const grouped = new Map<string | null, DocumentFolder[]>();
    for (const folder of folders) {
      const parentId = folder.parentId ?? null;
      grouped.set(parentId, [...(grouped.get(parentId) ?? []), folder]);
    }
    return grouped;
  }, [folders]);

  const topLevelFolders = foldersByParent.get(null) ?? [];

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

  const folderCounts = useMemo(() => {
    const counts = new Map(folders.map((folder) => [folder.id, 0]));
    for (const document of documents) {
      const documentFolderId = document.folderId ?? document.folder?.id ?? null;
      for (const ancestor of folderPath(documentFolderId)) {
        counts.set(ancestor.id, (counts.get(ancestor.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [documents, folderPath, folders]);

  const currentFolder = currentFolderId ? foldersById.get(currentFolderId) : undefined;
  const currentPath = useMemo(
    () => folderPath(currentFolderId),
    [currentFolderId, folderPath],
  );
  const parentFolder = currentPath.length > 1 ? currentPath[currentPath.length - 2] : undefined;
  const childFolders = currentFolderId ? foldersByParent.get(currentFolderId) ?? [] : [];
  const currentIsTaxes = currentFolder?.name.toUpperCase().includes("IMPOSTO") ?? false;

  const availableYears = useMemo(() => {
    if (!currentFolderId) return [];
    return Array.from(
      new Set(
        documents
          .filter(
            (document) =>
              (document.folderId ?? document.folder?.id) === currentFolderId &&
              document.subFolder,
          )
          .map((document) => document.subFolder?.split("/")[0])
          .filter((year): year is string => Boolean(year)),
      ),
    ).sort((a, b) => b.localeCompare(a));
  }, [currentFolderId, documents]);

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("pt-BR");
  const matchesActiveFilters = useCallback(
    (document: Document) =>
      (!normalizedSearch ||
        document.originalName.toLocaleLowerCase("pt-BR").includes(normalizedSearch)) &&
      matchesFileFilter(document, fileFilter),
    [fileFilter, normalizedSearch],
  );

  const sortedDocuments = useMemo(
    () =>
      [...documents].sort(
        (first, second) =>
          new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
      ),
    [documents],
  );

  const homeDocuments = useMemo(() => {
    const filtered = sortedDocuments.filter(matchesActiveFilters);
    return normalizedSearch || fileFilter !== "all" ? filtered : filtered.slice(0, 6);
  }, [fileFilter, matchesActiveFilters, normalizedSearch, sortedDocuments]);

  const visibleFiles = useMemo(() => {
    if (!currentFolderId) return [];
    return sortedDocuments.filter((document) => {
      if ((document.folderId ?? document.folder?.id) !== currentFolderId) return false;
      const [documentYear, documentMonth] = document.subFolder?.split("/") ?? [];
      if (currentYear && documentYear !== currentYear) return false;
      if (currentMonth && documentMonth !== currentMonth) return false;
      return matchesActiveFilters(document);
    });
  }, [currentFolderId, currentMonth, currentYear, matchesActiveFilters, sortedDocuments]);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedClientLabel = selectedUserId
    ? selectedUser?.name || selectedUser?.email || "Cliente selecionado"
    : "Minha conta";
  const hasActiveSearchFilters = Boolean(normalizedSearch) || fileFilter !== "all";
  const descendantFileCount = currentFolderId ? folderCounts.get(currentFolderId) ?? 0 : 0;

  const clearSearchFilters = () => {
    setSearchTerm("");
    setFileFilter("all");
  };

  const openHome = () => {
    setCurrentFolderId(null);
    setCurrentYear(null);
    setCurrentMonth(null);
    setIsFolderDrawerOpen(false);
  };

  const openFolder = (folderId: string, year?: string, month?: string) => {
    setCurrentFolderId(folderId);
    setCurrentYear(year ?? null);
    setCurrentMonth(month ?? null);
    setIsFolderDrawerOpen(false);
  };

  const goToParent = () => {
    if (parentFolder) openFolder(parentFolder.id);
    else openHome();
  };

  const openDocumentFolder = (document: Document) => {
    const folderId = document.folderId ?? document.folder?.id;
    if (!folderId) return;
    const folder = foldersById.get(folderId);
    const isTaxes = folder?.name.toUpperCase().includes("IMPOSTO") ?? false;
    const [year, month] = isTaxes ? document.subFolder?.split("/") ?? [] : [];
    openFolder(folderId, year, month);
  };

  const renderFolderTree = (
    folder: DocumentFolder,
    depth = 0,
    visited = new Set<string>(),
  ): ReactNode => {
    if (visited.has(folder.id)) return null;
    const nextVisited = new Set(visited).add(folder.id);
    const children = foldersByParent.get(folder.id) ?? [];
    const active = folder.id === currentFolderId;

    return (
      <div key={folder.id}>
        <button
          type="button"
          onClick={() => openFolder(folder.id)}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg border-l-2 pr-3 text-left text-sm transition-colors ${
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
        {children.map((child) => renderFolderTree(child, depth + 1, nextVisited))}
      </div>
    );
  };

  const folderNavigation = (
    <>
      <div className="border-b border-[var(--cz-hairline)] p-4">
        <button
          type="button"
          onClick={openHome}
          aria-current={!currentFolderId ? "page" : undefined}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg border-l-2 px-3 text-left text-sm font-semibold transition-colors ${
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
    </>
  );

  const searchControls = (
    <div className="flex w-full flex-col gap-2 sm:flex-row">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Buscar documentos por nome</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--cz-texto-fraco)]" />
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Buscar por nome do arquivo"
          className="h-11 w-full rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] pl-10 pr-10 text-sm max-md:pl-10! max-md:pr-10! text-[var(--cz-texto)] outline-none placeholder:text-[var(--cz-texto-fraco)] focus:border-[var(--cz-laranja)] focus:ring-2 focus:ring-[var(--cz-laranja-suave)]"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="absolute right-0 top-0 grid size-11 place-items-center text-[var(--cz-texto-fraco)] hover:text-[var(--cz-laranja-forte)]"
            aria-label="Limpar busca"
          >
            <X className="size-4" />
          </button>
        )}
      </label>
      <label>
        <span className="sr-only">Filtrar por tipo de arquivo</span>
        <select
          value={fileFilter}
          onChange={(event) => setFileFilter(event.target.value as FileFilter)}
          className="h-11 w-full rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-sm font-semibold text-[var(--cz-texto-suave)] outline-none focus:border-[var(--cz-laranja)] sm:w-40"
        >
          <option value="all">Todos os tipos</option>
          <option value="pdf">PDF</option>
          <option value="image">Imagens</option>
          <option value="other">Outros</option>
        </select>
      </label>
    </div>
  );

  return (
    <div
      ref={contentRootRef}
      className="flex min-h-full w-full overflow-hidden border-y border-[var(--cz-hairline)] bg-[var(--cz-superficie)] sm:rounded-[var(--cz-raio-cartao)] sm:border"
    >
      <aside className="hidden w-72 shrink-0 flex-col border-r border-[var(--cz-hairline)] bg-[var(--cz-fundo)] xl:flex">
        {folderNavigation}
      </aside>

      {isFolderDrawerOpen && (
        <div className="fixed inset-0 z-[70] xl:hidden" role="dialog" aria-modal="true" aria-label="Navegação de pastas">
          <button
            type="button"
            className="absolute inset-0 bg-black/25"
            onClick={() => setIsFolderDrawerOpen(false)}
            aria-label="Fechar navegação de pastas"
          />
          <aside
            ref={drawerRef}
            className="absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col pb-[env(safe-area-inset-bottom,0px)] border-r border-[var(--cz-hairline)] bg-[var(--cz-fundo)] shadow-[var(--cz-elev-1)]"
          >
            <div className="flex min-h-16 items-center justify-between border-b border-[var(--cz-hairline)] px-4">
              <div>
                <p className="text-xs font-semibold text-[var(--cz-texto-fraco)]">Navegação</p>
                <p className="font-extrabold text-[var(--cz-texto)]">Pastas de documentos</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFolderDrawerOpen(false)}
                className="grid size-11 place-items-center rounded-lg text-[var(--cz-texto-suave)] hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)]"
                aria-label="Fechar navegação de pastas"
                autoFocus
              >
                <X className="size-5" />
              </button>
            </div>
            {folderNavigation}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 bg-[var(--cz-fundo)]">
        <header className="sticky top-0 z-10 border-b border-[var(--cz-hairline)] bg-[var(--cz-superficie)] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <button
                ref={drawerTriggerRef}
                type="button"
                onClick={() => setIsFolderDrawerOpen(true)}
                className="grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--cz-hairline)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)] xl:hidden"
                aria-label="Abrir navegação de pastas"
              >
                <Menu className="size-5 max-md:hidden" />
                {/* No celular o hambúrguer já pertence ao cabeçalho do app (menu): aqui vai o ícone de pasta. */}
                <Folder className="hidden size-5 max-md:block" />
              </button>
              {currentFolderId && (
                <button
                  type="button"
                  onClick={goToParent}
                  className="grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--cz-hairline)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
                  aria-label={parentFolder ? `Voltar para ${parentFolder.name}` : "Voltar para documentos"}
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <nav aria-label="Caminho da pasta" className="flex max-w-full items-center overflow-x-auto text-xs font-medium text-[var(--cz-texto-fraco)]">
                  <button type="button" onClick={openHome} className="min-h-6 shrink-0 hover:text-[var(--cz-laranja-forte)]">
                    Documentos
                  </button>
                  {currentPath.map((folder) => (
                    <span key={folder.id} className="flex min-w-0 items-center max-md:shrink-0 max-md:whitespace-nowrap">
                      <ChevronRight className="mx-1 size-3 shrink-0" />
                      <button
                        type="button"
                        onClick={() => openFolder(folder.id)}
                        className={`max-w-44 truncate hover:text-[var(--cz-laranja-forte)] ${
                          folder.id === currentFolderId ? "font-bold text-[var(--cz-texto-suave)]" : ""
                        }`}
                        aria-current={folder.id === currentFolderId ? "page" : undefined}
                      >
                        {folder.name}
                      </button>
                    </span>
                  ))}
                </nav>
                <h1 className="truncate text-xl font-extrabold text-[var(--cz-texto)] sm:text-2xl">
                  {currentFolder?.name ?? "Seus documentos"}
                </h1>
              </div>
            </div>

            {isAdmin && users.length > 0 && (
              <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] px-3 text-xs font-semibold text-[var(--cz-laranja-forte)] max-md:mb-0! max-md:flex! sm:w-auto">
                <UserRound className="size-4 shrink-0" />
                <span className="shrink-0">Cliente</span>
                <select
                  value={selectedUserId}
                  onChange={(event) => {
                    setSelectedUserId(event.target.value);
                    clearSearchFilters();
                    openHome();
                  }}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--cz-texto)] outline-none sm:max-w-56"
                  aria-label="Cliente cujos documentos estão sendo exibidos"
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

        <div className="p-4 sm:p-6">
          {loading ? (
            <DocumentsSkeleton />
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
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--cz-laranja)] px-4 text-sm font-bold text-white hover:bg-[var(--cz-laranja-forte)]"
                >
                  <RefreshCw className="size-4" />
                  Tentar novamente
                </button>
              </div>
            </div>
          ) : !currentFolderId ? (
            <div className="space-y-7">
              <section className="rounded-[var(--cz-raio-cartao)] border border-[var(--cz-laranja-borda)] bg-[var(--cz-superficie)] p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                      <UserRound className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--cz-laranja-forte)]">
                        {isAdmin ? "Área do cliente" : "Sua central de documentos"}
                      </p>
                      <h2 className="truncate text-lg font-extrabold text-[var(--cz-texto)]">
                        {isAdmin ? selectedClientLabel : "Tudo organizado em um só lugar"}
                      </h2>
                      {isAdmin && selectedUser?.email && selectedUser.email !== selectedClientLabel && (
                        <p className="truncate text-sm text-[var(--cz-texto-suave)]">{selectedUser.email}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-[var(--cz-texto-suave)]">
                    {documents.length} {documents.length === 1 ? "documento disponível" : "documentos disponíveis"}
                  </p>
                </div>
                <div className="mt-4">{searchControls}</div>
              </section>

              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-[var(--cz-texto)]">
                      {hasActiveSearchFilters ? "Resultados" : "Adicionados recentemente"}
                    </h2>
                    <p className="text-sm text-[var(--cz-texto-suave)]">
                      {hasActiveSearchFilters
                        ? `${homeDocuments.length} ${homeDocuments.length === 1 ? "arquivo encontrado" : "arquivos encontrados"}.`
                        : "Os arquivos mais novos aparecem primeiro."}
                    </p>
                  </div>
                  {hasActiveSearchFilters && (
                    <button
                      type="button"
                      onClick={clearSearchFilters}
                      className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold text-[var(--cz-laranja-forte)] hover:bg-[var(--cz-laranja-suave)]"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>

                {homeDocuments.length === 0 ? (
                  <div className="rounded-[var(--cz-raio-cartao)] border border-dashed border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] p-8 text-center text-sm text-[var(--cz-texto-suave)]">
                    {hasActiveSearchFilters
                      ? "Nenhum documento corresponde à busca e aos filtros selecionados."
                      : "Nenhum documento foi adicionado ainda."}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
                    {homeDocuments.map((document, index) => (
                      <div
                        key={document.id}
                        className={`relative flex items-start gap-3 p-3 sm:items-center sm:p-4 ${
                          index > 0 ? "border-t border-[var(--cz-hairline)]" : ""
                        }`}
                      >
                        <div className="relative z-[1] grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--cz-fundo)]">
                          {fileIcon(document.mimeType, "size-5")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => window.open(`${document.fileUrl}?action=view`, "_blank")}
                            className="flex min-h-11 max-w-full items-center truncate text-left text-sm font-bold text-[var(--cz-texto)] hover:text-[var(--cz-laranja-forte)]"
                            title={document.originalName}
                          >
                            {/* Celular: nome em até 2 linhas (antes virava 1 linha cortada em "Guia DAS Simples Nacional - C…"). */}
                            <span className="truncate max-md:line-clamp-2 max-md:whitespace-normal max-md:break-words">{document.originalName}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDocumentFolder(document)}
                            className="flex min-h-11 max-w-full items-center gap-1 text-left text-xs text-[var(--cz-texto-suave)] hover:text-[var(--cz-laranja-forte)] max-md:min-h-9 sm:-mt-2 sm:min-h-8"
                          >
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{documentLocation(document)}</span>
                          </button>
                          {/* Celular: tamanho e data (a coluna da direita só existe a partir de sm). */}
                          <p className="pb-1 text-xs text-[var(--cz-texto-suave)] sm:hidden">
                            {formatSize(document.sizeBytes)} · {new Date(document.createdAt).toLocaleDateString("pt-BR")}
                          </p>
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
                          className="grid size-11 shrink-0 place-items-center rounded-lg text-[var(--cz-texto-fraco)] hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)]"
                          title="Baixar arquivo"
                          aria-label={`Baixar ${document.originalName}`}
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
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {topLevelFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => openFolder(folder.id)}
                      className="group flex min-h-20 items-center gap-3 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 text-left transition-all hover:border-[var(--cz-laranja-borda)] hover:shadow-[var(--cz-elev-1)]"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                        <Folder className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--cz-texto)]">{folder.name}</span>
                        <span className="text-xs text-[var(--cz-texto-suave)]">
                          {folderCounts.get(folder.id) ?? 0} arquivos na pasta e subpastas
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
              <section>{searchControls}</section>

              {childFolders.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-extrabold text-[var(--cz-texto)]">Subpastas</h2>
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {childFolders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => openFolder(folder.id)}
                        className="group flex min-h-20 items-center gap-3 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 text-left transition-all hover:border-[var(--cz-laranja-borda)] hover:shadow-[var(--cz-elev-1)]"
                      >
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                          <Folder className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[var(--cz-texto)]">{folder.name}</span>
                          <span className="text-xs text-[var(--cz-texto-suave)]">
                            {folderCounts.get(folder.id) ?? 0} arquivos na pasta e subpastas
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-[var(--cz-texto-fraco)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--cz-laranja-forte)]" />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {currentIsTaxes && availableYears.length > 0 && (
                <div className="flex flex-wrap gap-2 max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:pb-1 max-md:[scrollbar-width:none] max-md:[&>button]:shrink-0" aria-label="Filtros por período">
                  <button
                    type="button"
                    onClick={() => openFolder(currentFolderId)}
                    className={`min-h-11 rounded-full border px-4 text-xs font-bold ${
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
                      className={`min-h-11 rounded-full border px-4 text-xs font-bold ${
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
                        className={`min-h-11 rounded-full border px-4 text-xs font-bold ${
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

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--cz-texto-suave)]">
                  {visibleFiles.length} {visibleFiles.length === 1 ? "arquivo exibido" : "arquivos exibidos"}
                  {descendantFileCount > visibleFiles.length && !hasActiveSearchFilters && !currentYear
                    ? ` · ${descendantFileCount} incluindo subpastas`
                    : ""}
                </p>
                {hasActiveSearchFilters && (
                  <button
                    type="button"
                    onClick={clearSearchFilters}
                    className="min-h-11 rounded-lg px-3 text-xs font-bold text-[var(--cz-laranja-forte)] hover:bg-[var(--cz-laranja-suave)]"
                  >
                    Limpar busca e tipo
                  </button>
                )}
              </div>

              {visibleFiles.length === 0 ? (
                <div className="grid min-h-72 place-items-center rounded-[var(--cz-raio-cartao)] border border-dashed border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-center">
                  <div className="p-6">
                    <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja)]">
                      {hasActiveSearchFilters ? <Search className="size-7" /> : <Folder className="size-7" />}
                    </div>
                    <h2 className="font-bold text-[var(--cz-texto)]">
                      {hasActiveSearchFilters
                        ? "Nenhum arquivo encontrado"
                        : childFolders.length > 0 || descendantFileCount > 0
                          ? "Nenhum arquivo diretamente nesta pasta"
                          : currentYear || currentMonth
                            ? "Nenhum arquivo neste período"
                            : "Esta pasta está vazia"}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--cz-texto-suave)]">
                      {hasActiveSearchFilters
                        ? "Tente outro nome ou tipo de arquivo."
                        : childFolders.length > 0 || descendantFileCount > 0
                          ? "Continue por uma das subpastas acima para acessar os documentos."
                          : currentYear || currentMonth
                            ? "Selecione outro período para consultar os documentos."
                            : "Os próximos documentos enviados para este local aparecerão aqui."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
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
                          className="min-h-11 flex-1 rounded-lg bg-[var(--cz-laranja-suave)] text-xs font-bold text-[var(--cz-laranja-forte)] hover:bg-[var(--cz-laranja)] hover:text-white"
                        >
                          Visualizar
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(`${document.fileUrl}?action=download`, "_self")}
                          className="grid size-11 place-items-center rounded-lg border border-[var(--cz-hairline-forte)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
                          title="Baixar arquivo"
                          aria-label={`Baixar ${document.originalName}`}
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
