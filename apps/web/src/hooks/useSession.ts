/**
 * SOS Sales V3 — useSession Hook (MCT OS v2.0)
 * Session & tenant management with AbortController, synchronous state flush,
 * session generation tracking, and sequence verification against race conditions.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  apiClient,
  type MeUser,
  type WorkspaceSummary,
  type WorkspaceDetailsResponse,
  AuthError,
  ForbiddenError,
  NetworkError,
  ApiError,
} from "../services/api-client";

export interface SessionError {
  status?: number;
  title: string;
  detail: string;
  correlationId?: string;
  type: "auth" | "forbidden" | "network" | "membership" | "not_found" | "generic";
}

export interface UseSessionReturn {
  token: string | null;
  user: MeUser | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceSummary | null;
  activeWorkspaceDetails: WorkspaceDetailsResponse | null;
  isLoadingMe: boolean;
  isLoadingWorkspace: boolean;
  error: SessionError | null;
  selectWorkspace: (workspaceId: string, options?:{preserveView?:boolean;throwOnError?:boolean}) => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshWorkspace: (options?:{preserveView?:boolean}) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export function useSession(token: string | null): UseSessionReturn {
  const [user, setUser] = useState<MeUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeWorkspaceDetails, setActiveWorkspaceDetails] =
    useState<WorkspaceDetailsResponse | null>(null);

  const [isLoadingMe, setIsLoadingMe] = useState<boolean>(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState<boolean>(false);
  const [error, setError] = useState<SessionError | null>(null);

  // Concurrency & generation refs
  const sessionGenerationRef = useRef<number>(0);
  const meAbortControllerRef = useRef<AbortController | null>(null);
  const workspaceAbortControllerRef = useRef<AbortController | null>(null);
  const workspaceRequestIdRef = useRef<number>(0);
  const activeWorkspaceIdRef = useRef<string | null>(null);
  const detailsRef=useRef(activeWorkspaceDetails);detailsRef.current=activeWorkspaceDetails;

  // Keep ref updated synchronously
  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Synchronous total logout / identity wipe:
   * Aborts all in-flight requests, increments generation counter, flushes state.
   */
  const logout = useCallback(() => {
    ++sessionGenerationRef.current;
    if (meAbortControllerRef.current) {
      meAbortControllerRef.current.abort();
      meAbortControllerRef.current = null;
    }
    if (workspaceAbortControllerRef.current) {
      workspaceAbortControllerRef.current.abort();
      workspaceAbortControllerRef.current = null;
    }
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    activeWorkspaceIdRef.current = null;
    if (typeof window !== "undefined") {
      try { localStorage.removeItem("sos_sales_active_workspace_id"); } catch { /* Continue wiping in-memory identity even when browser storage is blocked. */ }
    }
    setActiveWorkspaceDetails(null);
    setError(null);
    setIsLoadingMe(false);
    setIsLoadingWorkspace(false);
  }, []);

  /**
   * Loads or switches the active workspace with strict concurrency guarantees:
   * 1. Synchronous state clear of previous workspace details
   * 2. Abort previous pending workspace requests
   * 3. Sequence and session generation tracking
   * 4. Multi-condition verification before applying return:
   *    (sessionGen === currentSessionGen && reqId === workspaceRequestId && targetId === activeWorkspaceIdRef)
   */
  const selectWorkspace = useCallback(
    async (targetWorkspaceId: string,options?:{preserveView?:boolean;throwOnError?:boolean}) => {
      if (!token) return;

      const currentSessionGen = sessionGenerationRef.current;

      // Preserve only a confirmed view of the same workspace. Switching still clears synchronously.
      const preserveView=options?.preserveView===true&&targetWorkspaceId===activeWorkspaceIdRef.current&&detailsRef.current?.workspace.id===targetWorkspaceId;
      if(!preserveView){detailsRef.current=null;setActiveWorkspaceDetails(null);setIsLoadingWorkspace(true);setError(null);}
      setActiveWorkspaceId(targetWorkspaceId);
      activeWorkspaceIdRef.current = targetWorkspaceId;
      if (typeof window !== "undefined") {
        localStorage.setItem("sos_sales_active_workspace_id", targetWorkspaceId);
      }

      // 2. Abort prior pending request
      if (workspaceAbortControllerRef.current) {
        workspaceAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      workspaceAbortControllerRef.current = controller;

      // 3. Increment sequence counter
      const currentRequestId = ++workspaceRequestIdRef.current;

      try {
        const details = await apiClient.getWorkspace(targetWorkspaceId, {
          token,
          signal: controller.signal,
        });

        // 4. Multi-condition verification before applying result
        if (
          currentSessionGen !== sessionGenerationRef.current ||
          currentRequestId !== workspaceRequestIdRef.current ||
          targetWorkspaceId !== activeWorkspaceIdRef.current
        ) {
          return; // Stale response discarded
        }

        detailsRef.current=details;setActiveWorkspaceDetails(details);
        if(typeof details.userRole==='string')setWorkspaces(items=>items.map(workspace=>workspace.id===targetWorkspaceId?{...workspace,role:details.userRole}:workspace));
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // Request was aborted, ignore silently
        }

        if (
          currentSessionGen !== sessionGenerationRef.current ||
          currentRequestId !== workspaceRequestIdRef.current ||
          targetWorkspaceId !== activeWorkspaceIdRef.current
        ) {
          return; // Stale error discarded
        }

        if(preserveView&&!(err instanceof ApiError&&[401,403,404].includes(err.status)))throw err;
        if(preserveView){detailsRef.current=null;setActiveWorkspaceDetails(null);}
        if (err instanceof ForbiddenError) {
          setError({
            status: 403,
            title: "Acesso Negado",
            detail: err.detail,
            correlationId: err.correlationId,
            type: "forbidden",
          });
        } else if (err instanceof AuthError) {
          setError({
            status: 401,
            title: "Sessão Expirada",
            detail: err.detail,
            correlationId: err.correlationId,
            type: "auth",
          });
        } else if (err instanceof NetworkError) {
          setError({
            title: "Conexão Indisponível",
            detail: err.message,
            type: "network",
          });
        } else if (err instanceof ApiError) {
          setError({
            status: err.status,
            title: err.title,
            detail: err.detail,
            correlationId: err.correlationId,
            type: "generic",
          });
        } else {
          setError({
            title: "Erro Inesperado",
            detail: err instanceof Error ? err.message : "Falha ao carregar workspace",
            type: "generic",
          });
        }
        if(options?.throwOnError)throw err;
      } finally {
        if (
          currentSessionGen === sessionGenerationRef.current &&
          currentRequestId === workspaceRequestIdRef.current
        ) {
          setIsLoadingWorkspace(false);
        }
      }
    },
    [token]
  );

  /**
   * Fetches /v1/me to discover user identity and authorized workspaces.
   * Guarded by session generation tracking against stale responses on token change.
   */
  const refreshSession = useCallback(async () => {
    const currentSessionGen = ++sessionGenerationRef.current;

    // Abort inflight requests
    if (meAbortControllerRef.current) {
      meAbortControllerRef.current.abort();
      meAbortControllerRef.current = null;
    }
    if (workspaceAbortControllerRef.current) {
      workspaceAbortControllerRef.current.abort();
      workspaceAbortControllerRef.current = null;
    }

    if (!token) {
      setUser(null);
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      activeWorkspaceIdRef.current = null;
      setActiveWorkspaceDetails(null);
      setIsLoadingMe(false);
      setIsLoadingWorkspace(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    meAbortControllerRef.current = controller;

    setIsLoadingMe(true);
    setError(null);

    try {
      const meData = await apiClient.getMe({
        token,
        signal: controller.signal,
      });

      // Verification: If token changed while /v1/me was inflight, discard!
      if (currentSessionGen !== sessionGenerationRef.current) {
        return;
      }

      setUser(meData.user);
      setWorkspaces(meData.workspaces);

      if (meData.workspaces.length === 0) {
        // Honest Empty Membership state
        setActiveWorkspaceId(null);
        activeWorkspaceIdRef.current = null;
        setActiveWorkspaceDetails(null);
        setError({
          title: "Nenhum Workspace Autorizado",
          detail:
            "Sua identidade foi autenticada com sucesso, mas este usuário não possui acesso a nenhum workspace ativo.",
          type: "membership",
        });
      } else {
        // Auto-select preferred workspace from localStorage, active ref, or first
        const storedWorkspaceId =
          typeof window !== "undefined"
            ? localStorage.getItem("sos_sales_active_workspace_id")
            : null;
        const validWorkspaceId =
          activeWorkspaceIdRef.current &&
          meData.workspaces.some((w) => w.id === activeWorkspaceIdRef.current)
            ? activeWorkspaceIdRef.current
            : storedWorkspaceId && meData.workspaces.some((w) => w.id === storedWorkspaceId)
            ? storedWorkspaceId
            : meData.workspaces[0]!.id;

        await selectWorkspace(validWorkspaceId);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      if (currentSessionGen !== sessionGenerationRef.current) {
        return;
      }

      setUser(null);
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      activeWorkspaceIdRef.current = null;
      setActiveWorkspaceDetails(null);

      if (err instanceof AuthError) {
        setError({
          status: 401,
          title: "Não Autorizado",
          detail: err.detail,
          correlationId: err.correlationId,
          type: "auth",
        });
      } else if (err instanceof ForbiddenError) {
        setError({
          status: 403,
          title: "Acesso Proibido",
          detail: err.detail,
          correlationId: err.correlationId,
          type: "forbidden",
        });
      } else if (err instanceof NetworkError) {
        setError({
          title: "Serviço Indisponível",
          detail: err.message,
          type: "network",
        });
      } else if (err instanceof ApiError) {
        setError({
          status: err.status,
          title: err.title,
          detail: err.detail,
          correlationId: err.correlationId,
          type: "generic",
        });
      } else {
        setError({
          title: "Erro de Autenticação",
          detail: err instanceof Error ? err.message : "Falha ao obter credenciais",
          type: "generic",
        });
      }
    } finally {
      if (currentSessionGen === sessionGenerationRef.current) {
        setIsLoadingMe(false);
      }
    }
  }, [token, selectWorkspace]);

  // Initial load or token change triggers refreshSession with new generation
  useEffect(() => {
    refreshSession();

    return () => {
      if (meAbortControllerRef.current) meAbortControllerRef.current.abort();
      if (workspaceAbortControllerRef.current) workspaceAbortControllerRef.current.abort();
    };
  }, [token]);

  const refreshWorkspace = useCallback(async (options?:{preserveView?:boolean}) => {
    if (activeWorkspaceId) {
      await selectWorkspace(activeWorkspaceId,options);
    }
  }, [activeWorkspaceId, selectWorkspace]);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) || null;

  return {
    token,
    user,
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    activeWorkspaceDetails,
    isLoadingMe,
    isLoadingWorkspace,
    error,
    selectWorkspace,
    refreshSession,
    refreshWorkspace,
    logout,
    clearError,
  };
}
