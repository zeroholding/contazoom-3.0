// Vendas cache stub for frontend
export function getCachedVendas() {
  return null;
}

export function setCachedVendas(vendas: any[]) {
  // No-op for frontend only
}

export function clearVendasCache() {
  // No-op for frontend only
}

export function loadVendasFromCache(platform: string): { vendas: any[] } | null {
  return null;
}

export function saveVendasToCache(platform: string, vendas: any[]) {
  // No-op for frontend only
}

export function clearAllVendasCache() {
  // No-op for frontend only
}

export function getCacheInfo() {
  return {
    size: 0,
    count: 0,
    lastUpdated: null,
  };
}

export function getLocalStorageUsage() {
  return {
    used: 0,
    total: 0,
    percentage: 0,
  };
}
