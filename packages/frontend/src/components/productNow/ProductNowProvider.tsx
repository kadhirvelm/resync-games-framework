"use client";

import { isServiceError } from "@resync-game-framework/api";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";

/** Shared ProductNow connection for every game and the workshop. */
export interface ProductNowConnectionState {
  /** `null` while the first status check is in flight */
  connected: boolean | null;
  /** Sends the browser through ProductNow OAuth and back to this page */
  connect: () => void;
  /** Drops the browser's ProductNow credentials */
  disconnect: () => Promise<void>;
  errorMessage: string | null;
  /** Re-reads whether this browser is connected */
  refresh: () => Promise<void>;
}

const ProductNowConnectionContext =
  createContext<ProductNowConnectionState | null>(null);

/**
 * Builds the backend URL that starts ProductNow OAuth.
 * @param returnTo - Frontend path to open after ProductNow redirects back
 * @returns Absolute connect URL on the API origin
 */
export function productNowConnectUrl(returnTo: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_CLIENT_URL ?? "";
  const params = new URLSearchParams({ returnTo });
  return `${apiUrl}/productnow-mcp/oauth/connect?${params.toString()}`;
}

/**
 * Holds one ProductNow connection check for the whole app.
 * @param children - Routes and games that read or write lore
 * @returns The connection provider
 */
export const ProductNowProvider = ({ children }: { children: ReactNode }) => {
  const { clientServiceCallers } = useClientServiceCallers();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await clientServiceCallers.productNowMcp.getStatus();
      if (isServiceError(result)) {
        setErrorMessage(result.message);
        setConnected(false);
        return;
      }
      setErrorMessage(null);
      setConnected(result.connected);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "ProductNow status check failed",
      );
      setConnected(false);
    }
  }, [clientServiceCallers]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("productNow");
    if (outcome === "error") {
      const reason = params.get("reason");
      setErrorMessage(
        reason
          ? `ProductNow connection failed: ${reason}`
          : "ProductNow connection failed",
      );
    }
    if (outcome !== null) {
      params.delete("productNow");
      params.delete("reason");
      const query = params.toString();
      const next = query
        ? `${window.location.pathname}?${query}`
        : window.location.pathname;
      window.history.replaceState(null, "", next);
    }
    void refresh();
  }, [refresh]);

  const connect = useCallback(() => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(productNowConnectUrl(returnTo));
  }, []);

  const disconnect = useCallback(async () => {
    const result = await clientServiceCallers.productNowMcp.disconnect();
    if (isServiceError(result)) {
      setErrorMessage(result.message);
      return;
    }
    setErrorMessage(null);
    setConnected(result.connected);
  }, [clientServiceCallers]);

  const value = useMemo(
    () => ({ connect, connected, disconnect, errorMessage, refresh }),
    [connect, connected, disconnect, errorMessage, refresh],
  );

  return (
    <ProductNowConnectionContext.Provider value={value}>
      {children}
    </ProductNowConnectionContext.Provider>
  );
};

/**
 * Reads the app-wide ProductNow connection.
 * @returns Connection state and connect/disconnect actions
 * @throws Error when called outside {@link ProductNowProvider}
 */
export function useProductNowConnection(): ProductNowConnectionState {
  const value = useContext(ProductNowConnectionContext);
  if (value === null) {
    throw new Error("useProductNowConnection requires ProductNowProvider");
  }
  return value;
}
