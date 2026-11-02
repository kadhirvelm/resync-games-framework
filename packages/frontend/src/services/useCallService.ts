import { isServiceError, type ServiceError } from "@resync-game-framework/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { convertErrorToString } from "../lib/convertErrorToString";
import { handleServiceError } from "./handleServiceError";

/**
 * Use this hook to call on a service and handle errors and loading states when loading data for a view.
 */
export function useCallService<T>(
  callback: () => Promise<T | ServiceError>,
  reloadProps?: unknown[],
) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const queryingKeyRef = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: This is a utility hook that does not require exhaustive dependencies.
  const onLoad = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    const queryingKey = JSON.stringify(reloadProps);
    queryingKeyRef.current = queryingKey;

    try {
      const response = await callback();
      // This means that the query has changed since the last time we made the call, so we don't need to update the result.
      if (queryingKeyRef.current !== queryingKey) {
        return;
      }

      if (isServiceError(response)) {
        await handleServiceError(response);
        setError(convertErrorToString(response));
      } else {
        setResult(response);
      }
    } catch (err) {
      setError(convertErrorToString(err));
    } finally {
      setIsLoading(false);
    }
  }, [...(reloadProps ?? [])]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to explicitly reload the service call when the reloadKey changes.
  useEffect(() => {
    onLoad();
  }, [onLoad, reloadKey]);

  const onReload = useCallback(() => setReloadKey((prev) => prev + 1), []);

  return {
    error,
    isLoading,
    onReload,
    result,
    setResult,
  };
}
