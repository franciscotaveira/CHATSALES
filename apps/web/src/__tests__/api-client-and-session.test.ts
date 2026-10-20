// @vitest-environment happy-dom
/**
 * SOS Sales V3 — API Client & Session Concurrency Test Suite
 * Validates Fastify HTTP contract, correlation-id, tenant headers, AbortController,
 * and out-of-order race-condition prevention.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useSession, type UseSessionReturn } from "../hooks/useSession";
import {
  ApiClient,
  AuthError,
  ForbiddenError,
  NotFoundError,
  NetworkError,
  type WorkspaceDetailsResponse,
} from "../services/api-client";

// Set React act environment flag for clean test execution
// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("SOS Sales V3 — ApiClient & Concurrency Suite", () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient("http://localhost:4400");
    vi.restoreAllMocks();
  });

  describe("1. Headers, Injeção de Tenant e Correlation ID", () => {
    it("should inject x-correlation-id, Bearer token and X-Workspace-Id header", async () => {
      let capturedUrl = "";
      let capturedHeaders: HeadersInit = {};

      const mockFetch = vi.fn().mockImplementation((url, init) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: "u1", email: "op@mct.br", activeRole: "owner", activeWorkspaceId: "ws-1" },
              workspaces: [{ id: "ws-1", name: "Alpha", role: "owner" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch;

      const res = await client.getMe({
        token: "jwt-test-token",
        correlationId: "custom-corr-123",
      });

      expect(res.user.email).toBe("op@mct.br");
      expect(capturedUrl).toBe("http://localhost:4400/v1/me");
      expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe("Bearer jwt-test-token");
      expect((capturedHeaders as Record<string, string>)["x-correlation-id"]).toBe("custom-corr-123");
    });

    it("should inject X-Workspace-Id when querying /v1/workspaces/:id", async () => {
      let capturedHeaders: HeadersInit = {};

      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              workspace: {
                id: "ws-target-1",
                name: "Workspace Target",
                slug: "target",
                timezone: "America/Sao_Paulo",
                currency: "BRL",
                isActive: true,
                createdAt: "2026-09-18",
                updatedAt: "2026-09-18",
              },
              userRole: "admin",
              permissions: ["workspace:view"],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });

      await client.getWorkspace("ws-target-1", {
        token: "admin-token",
      });

      expect((capturedHeaders as Record<string, string>)["X-Workspace-Id"]).toBe("ws-target-1");
      expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe("Bearer admin-token");
    });
  });

  describe("2. Mapeamento Estrito de Erros HTTP (RFC 7807)", () => {
    it("should throw AuthError on 401 Unauthorized", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Unauthorized",
            detail: "Token expired or signature invalid",
            correlationId: "corr-401",
          }),
          { status: 401, headers: { "Content-Type": "application/json", "x-correlation-id": "corr-401" } }
        )
      );

      await expect(client.getMe({ token: "expired-jwt" })).rejects.toThrowError(AuthError);
    });

    it("should throw ForbiddenError on 403 Forbidden", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Forbidden",
            detail: "User is not a member of this workspace",
            correlationId: "corr-403",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      );

      await expect(client.getWorkspace("forbidden-ws", { token: "agent-token" })).rejects.toThrowError(
        ForbiddenError
      );
    });

    it("should throw NotFoundError on 404", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Not Found",
            detail: "Workspace does not exist",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );

      await expect(client.getWorkspace("missing-ws", { token: "agent-token" })).rejects.toThrowError(
        NotFoundError
      );
    });

    it("should wrap fetch failure as NetworkError", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(client.getReady()).rejects.toThrowError(NetworkError);
    });
  });

  describe("3. Concorrência e Cancelamento com AbortController", () => {
    it("should pass AbortSignal to fetch and abort when requested", async () => {
      const controller = new AbortController();

      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          if (init.signal) {
            init.signal.addEventListener("abort", () => {
              const abortErr = new Error("This operation was aborted");
              abortErr.name = "AbortError";
              reject(abortErr);
            });
          }
        });
      });

      const requestPromise = client.getWorkspace("ws-abort-test", {
        signal: controller.signal,
      });

      // Abort during inflight request
      controller.abort();

      await expect(requestPromise).rejects.toHaveProperty("name", "AbortError");
    });

    it("should discard stale out-of-order responses under simulated race conditions", async () => {
      // Simulates two concurrent requests where the second request finishes before the first
      let latestSequence = 0;
      let activeTargetId: string | null = null;
      let displayedData: WorkspaceDetailsResponse | null = null;

      async function simulatedSelectWorkspace(targetId: string, delayMs: number) {
        // 1. Synchronous flush
        displayedData = null;
        activeTargetId = targetId;
        const currentReqId = ++latestSequence;

        // 2. Simulated fetch with variable network latency
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // 3. Double-check guard before applying state
        if (currentReqId !== latestSequence || targetId !== activeTargetId) {
          return; // Discarded!
        }

        displayedData = {
          workspace: {
            id: targetId,
            name: `Workspace ${targetId}`,
            slug: targetId,
            timezone: "UTC",
            currency: "BRL",
            isActive: true,
            createdAt: "2026-09-18",
            updatedAt: "2026-09-18",
          },
          userRole: "owner",
          permissions: [],
        };
      }

      // Start Request 1 (slow, 60ms)
      const p1 = simulatedSelectWorkspace("ws-1-slow", 60);
      expect(displayedData).toBeNull();
      expect(activeTargetId).toBe("ws-1-slow");

      // Start Request 2 (fast, 15ms)
      const p2 = simulatedSelectWorkspace("ws-2-fast", 15);
      expect(displayedData).toBeNull();
      expect(activeTargetId).toBe("ws-2-fast");

      // Wait for both to complete
      await Promise.all([p1, p2]);

      // Result MUST be ws-2-fast, and ws-1-slow must have been discarded!
      expect(displayedData).not.toBeNull();
      const resolved = displayedData as unknown as WorkspaceDetailsResponse;
      expect(resolved.workspace.id).toBe("ws-2-fast");
      expect(resolved.workspace.name).toBe("Workspace ws-2-fast");
    });
  });

  describe("4. Cenários de Sessão Real (useSession Hook Montado) com Respostas HTTP Controladas", () => {
    interface SessionTestHarness {
      readonly current: UseSessionReturn;
      setToken: (token: string | null) => Promise<void>;
      unmount: () => void;
      waitFor: (predicate: (s: UseSessionReturn) => boolean, timeoutMs?: number) => Promise<void>;
    }

    function renderSessionHook(initialToken: string | null = null): SessionTestHarness {
      let hookState!: UseSessionReturn;
      let currentToken = initialToken;

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      function SessionHarness({ token }: { token: string | null }) {
        hookState = useSession(token);
        return null;
      }

      act(() => {
        root.render(createElement(SessionHarness, { token: currentToken }));
      });

      return {
        get current() {
          return hookState;
        },
        setToken: async (newToken: string | null) => {
          currentToken = newToken;
          await act(async () => {
            root.render(createElement(SessionHarness, { token: newToken }));
          });
        },
        unmount: () => {
          act(() => {
            root.unmount();
          });
          container.remove();
        },
        waitFor: async (predicate: (s: UseSessionReturn) => boolean, timeoutMs = 1500) => {
          const start = Date.now();
          while (!predicate(hookState)) {
            if (Date.now() - start > timeoutMs) {
              throw new Error("Timeout aguardando condição de estado do hook useSession");
            }
            await act(async () => {
              await new Promise((r) => setTimeout(r, 10));
            });
          }
        },
      };
    }

    it("Cenário 401: Deve montar useSession, capturar 401 em /v1/me, limpar usuário e registrar erro de autenticação", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Unauthorized",
            detail: "Token expirado ou assinatura inválida",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      );

      const harness = renderSessionHook("expired-jwt-token");

      await harness.waitFor((s) => !s.isLoadingMe && s.error !== null);

      expect(harness.current.user).toBeNull();
      expect(harness.current.workspaces).toEqual([]);
      expect(harness.current.activeWorkspaceId).toBeNull();
      expect(harness.current.error?.status).toBe(401);
      expect(harness.current.error?.type).toBe("auth");
      expect(harness.current.error?.detail).toBe("Token expirado ou assinatura inválida");

      harness.unmount();
    });

    it("Cenário 403: Deve montar useSession, autenticar e falhar com 403 em /v1/workspaces/:id isolando o workspace", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                user: { id: "u-agent", email: "agent@mct.br", activeRole: "guest", activeWorkspaceId: "ws-secret" },
                workspaces: [{ id: "ws-secret", name: "Secret Workspace", role: "guest" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (urlStr.includes("/v1/workspaces/ws-secret")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                title: "Forbidden",
                detail: "Acesso não autorizado para este tenant",
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
      });

      const harness = renderSessionHook("agent-token");

      await harness.waitFor((s) => !s.isLoadingWorkspace && s.error?.status === 403);

      expect(harness.current.user?.email).toBe("agent@mct.br");
      expect(harness.current.activeWorkspaceId).toBe("ws-secret");
      expect(harness.current.activeWorkspaceDetails).toBeNull(); // Isolado!
      expect(harness.current.error?.status).toBe(403);
      expect(harness.current.error?.type).toBe("forbidden");
      expect(harness.current.error?.detail).toContain("Acesso não autorizado");

      harness.unmount();
    });

    it("reports a requested workspace failure to its caller while keeping the existing session error state",async()=>{
      globalThis.fetch=vi.fn().mockImplementation((url)=>Promise.resolve(new Response(JSON.stringify(String(url).includes('/v1/me')?{user:{id:'SIM-user',email:'sim@example.invalid',activeRole:'owner'},workspaces:[]}:{title:'Forbidden',detail:'SIM acesso indisponível'}),{status:String(url).includes('/v1/me')?200:403,headers:{'Content-Type':'application/json'}})));
      const harness=renderSessionHook('SIM-token');await harness.waitFor(s=>!s.isLoadingMe&&Boolean(s.user));let failure:unknown;
      await act(async()=>{await harness.current.selectWorkspace('SIM-created',{throwOnError:true}).catch(error=>{failure=error;});});
      expect(failure).toBeInstanceOf(ForbiddenError);expect(harness.current.error?.status).toBe(403);expect(harness.current.activeWorkspaceDetails).toBeNull();expect(harness.current.isLoadingWorkspace).toBe(false);
      await act(async()=>harness.current.selectWorkspace('SIM-default'));expect(harness.current.error?.status).toBe(403);harness.unmount();
    });

    it("Cenário Offline & Retry: Deve montar useSession, capturar falha de rede e recuperar sessão após retry", async () => {
      // 1. Rede offline
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch (offline)"));

      const harness = renderSessionHook("valid-token");

      await harness.waitFor((s) => !s.isLoadingMe && s.error?.type === "network");

      expect(harness.current.error?.type).toBe("network");
      expect(harness.current.user).toBeNull();

      // 2. Conexão restabelecida, retry
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: "u-online", email: "online@mct.br", activeRole: "owner", activeWorkspaceId: null },
            workspaces: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      await act(async () => {
        await harness.current.refreshSession();
      });

      await harness.waitFor((s) => !s.isLoadingMe && s.user !== null);

      expect(harness.current.user?.email).toBe("online@mct.br");
      expect(harness.current.error?.type).toBe("membership"); // Sem workspace, mas recuperou rede!

      harness.unmount();
    });

    it("Cenário Sem Membership: Deve tratar workspaces vazios [] sem disparar busca de workspace", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: "u-solo", email: "solo@mct.br", activeRole: null, activeWorkspaceId: null },
            workspaces: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = fetchSpy;

      const harness = renderSessionHook("solo-token");

      await harness.waitFor((s) => !s.isLoadingMe && s.error?.type === "membership");

      expect(harness.current.user?.email).toBe("solo@mct.br");
      expect(harness.current.workspaces).toHaveLength(0);
      expect(harness.current.activeWorkspaceId).toBeNull();
      expect(harness.current.activeWorkspaceDetails).toBeNull();
      expect(harness.current.error?.type).toBe("membership");
      expect(harness.current.error?.title).toBe("Nenhum Workspace Autorizado");

      // Garante que NENHUMA requisição a /v1/workspaces foi disparada
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      harness.unmount();
    });

    it("clears the mounted session identity and workspace when removing the stored workspace fails",async()=>{
      globalThis.fetch=vi.fn().mockImplementation(url=>Promise.resolve(new Response(JSON.stringify(String(url).includes('/v1/me')?{
        user:{id:'SIM-storage-user',email:'sim@example.invalid',activeRole:'owner',activeWorkspaceId:'SIM-storage-ws'},
        workspaces:[{id:'SIM-storage-ws',name:'SIM workspace',role:'owner'}],
      }:{workspace:{id:'SIM-storage-ws',name:'SIM workspace'},userRole:'owner'}),{status:200,headers:{'Content-Type':'application/json'}})));
      const harness=renderSessionHook('SIM-storage-token');
      try{
        await harness.waitFor(state=>Boolean(state.activeWorkspaceDetails)&&!state.isLoadingWorkspace);
        expect(harness.current.user).not.toBeNull();expect(harness.current.activeWorkspaceId).toBe('SIM-storage-ws');
        const remove=vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('SIM storage blocked');});
        act(()=>{expect(()=>harness.current.logout()).not.toThrow();});
        expect(remove).toHaveBeenCalledWith('sos_sales_active_workspace_id');expect(harness.current.user).toBeNull();expect(harness.current.workspaces).toEqual([]);expect(harness.current.activeWorkspaceId).toBeNull();expect(harness.current.activeWorkspaceDetails).toBeNull();expect(harness.current.isLoadingMe).toBe(false);expect(harness.current.isLoadingWorkspace).toBe(false);
        remove.mockRestore();
      }finally{harness.unmount();}
    });

    it("Cenário Concorrência (Logout com resposta atrasada): Deve descartar resposta lenta de /v1/me após logout() via sessionGenerationRef", async () => {
      let resolveDelayedMe!: (resp: Response) => void;
      const delayedMePromise = new Promise<Response>((resolve) => {
        resolveDelayedMe = resolve;
      });

      globalThis.fetch = vi.fn().mockReturnValue(delayedMePromise);

      const harness = renderSessionHook("user1-token");

      // Verifica que useSession iniciou a requisição de /v1/me
      expect(harness.current.isLoadingMe).toBe(true);

      // Usuário clica em Logout enquanto /v1/me ainda está em trânsito
      act(() => {
        harness.current.logout();
      });

      expect(harness.current.user).toBeNull();
      expect(harness.current.isLoadingMe).toBe(false);

      // Agora a requisição atrasada finalmente retorna com dados do usuário
      resolveDelayedMe(
        new Response(
          JSON.stringify({
            user: { id: "u-late", email: "late@mct.br", activeRole: "owner", activeWorkspaceId: null },
            workspaces: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      // Aguarda processamento da Promise
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });

      // A resposta atrasada DEVE ter sido descartada pela proteção de geração!
      // Se sessionGenerationRef for removido, o usuário passaria a ser late@mct.br e o teste falharia!
      expect(harness.current.user).toBeNull();
      expect(harness.current.workspaces).toEqual([]);
      expect(harness.current.isLoadingMe).toBe(false);

      harness.unmount();
    });

    it("Cenário Concorrência (Troca de Usuário com respostas fora de ordem): Deve descartar resposta lenta do Usuário 1 após troca para Usuário 2 via sessionGenerationRef", async () => {
      let resolveUser1!: (resp: Response) => void;
      const user1Promise = new Promise<Response>((resolve) => {
        resolveUser1 = resolve;
      });

      let resolveUser2!: (resp: Response) => void;
      const user2Promise = new Promise<Response>((resolve) => {
        resolveUser2 = resolve;
      });

      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        const auth = (init.headers as Record<string, string>)?.["Authorization"];
        if (auth === "Bearer user1-token") return user1Promise;
        if (auth === "Bearer user2-token") return user2Promise;
        return Promise.reject(new Error("Unexpected token"));
      });

      // 1. Monta com Usuário 1 (requisição lenta)
      const harness = renderSessionHook("user1-token");
      expect(harness.current.isLoadingMe).toBe(true);

      // 2. Operador troca imediatamente para Usuário 2
      await harness.setToken("user2-token");

      // 3. Resposta do Usuário 2 retorna PRIMEIRO (rápida)
      resolveUser2(
        new Response(
          JSON.stringify({
            user: { id: "u2", email: "user2@mct.br", activeRole: "operator", activeWorkspaceId: null },
            workspaces: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      await harness.waitFor((s) => s.user?.email === "user2@mct.br");
      expect(harness.current.user?.email).toBe("user2@mct.br");

      // 4. Resposta do Usuário 1 retorna DEPOIS (lenta / fora de ordem)
      resolveUser1(
        new Response(
          JSON.stringify({
            user: { id: "u1", email: "user1@mct.br", activeRole: "owner", activeWorkspaceId: null },
            workspaces: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });

      // O estado da sessão DEVE continuar sendo Usuário 2!
      // Se sessionGenerationRef for removido, Usuário 1 sobrescreveria o estado e o teste falharia!
      expect(harness.current.user?.email).toBe("user2@mct.br");
      expect(harness.current.user?.id).toBe("u2");

      harness.unmount();
    });
  });

  describe("7. Upload de Mídia (G5)", () => {
    it("should send binary payload with Content-Type, x-file-name, Authorization, and return media response", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any;

      globalThis.fetch = vi.fn().mockImplementation((url, init) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        capturedBody = init.body;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              mediaUrl: "https://storage.supabase.co/object/sign/chat-sales-media/ws-1/file.png?token=xyz",
              expiresInSeconds: 3600,
              contentType: "image/png",
              category: "image",
              sizeBytes: 1024,
              fileName: "foto.png",
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          )
        );
      });

      const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "foto.png", { type: "image/png" });
      const res = await client.uploadMedia("ws-1", file, { token: "user-jwt" });

      expect(capturedUrl).toBe("http://localhost:4400/v1/workspaces/ws-1/media");
      expect(capturedHeaders["Content-Type"]).toBe("image/png");
      expect(capturedHeaders["x-file-name"]).toBe("foto.png");
      expect(capturedHeaders["Authorization"]).toBe("Bearer user-jwt");
      expect(capturedHeaders["X-Workspace-Id"]).toBe("ws-1");
      expect(capturedBody).toBe(file);
      expect(res.mediaUrl).toContain("chat-sales-media");
      expect(res.category).toBe("image");
    });
  });
});

