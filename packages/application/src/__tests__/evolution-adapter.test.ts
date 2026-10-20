import { describe, it, expect, vi } from "vitest";
import { EvolutionAdapter, validateEvolutionBaseUrl } from "../channels/adapters/evolution.adapter";
import type { OutboundSendParams } from "../channels/adapters/channel-adapter.interface";

describe("EvolutionAdapter (Evolution API v2 Outbound)", () => {
  const dummyParams: OutboundSendParams = {
    workspaceId: "22222222-2222-4222-8222-222222222222",
    channelInstanceId: "11111111-1111-4111-8111-111111111111",
    commandId: "cmd-1",
    messageId: "msg-1",
    recipientE164: "+5549999998888",
    body: "Olá do SOS Sales V3!",
    idempotencyKey: "idem-1",
  };

  const mockSecretResolver = {
    resolveSigningSecret: vi.fn(),
    useCredentials: vi.fn(async (_channel, _workspace, fn) => fn({
      api_key: "test-evolution-key",
      base_url: "http://evolution:8080",
      instance_name: "test-instance",
    })),
  };

  it("sends a text message successfully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        key: {
          id: "EVO_OUTBOUND_MSG_123",
          remoteJid: "5549999998888@s.whatsapp.net",
          fromMe: true,
        },
      }),
    });

    const adapter = new EvolutionAdapter({
      fetchFn: mockFetch as any,
      allowLocalTest: true,
    });

    const result = await adapter.sendMessage(dummyParams, mockSecretResolver as any);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.externalMessageId).toBe("EVO_OUTBOUND_MSG_123");
      expect(result.sentAt).toBeInstanceOf(Date);
    }

    expect(mockFetch).toHaveBeenCalledWith(
      "http://evolution:8080/message/sendText/test-instance",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "test-evolution-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          number: "5549999998888",
          text: "Olá do SOS Sales V3!",
        }),
      })
    );
  });

  it("handles authentication failure (HTTP 401)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Unauthorized token" }),
    });

    const adapter = new EvolutionAdapter({
      fetchFn: mockFetch as any,
      allowLocalTest: true,
    });

    const result = await adapter.sendMessage(dummyParams, mockSecretResolver as any);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.category).toBe("permanent");
      expect(result.errorCode).toBe("AUTHENTICATION_FAILED");
    }
  });

  it("blocks SSRF attempts to cloud metadata IP", () => {
    expect(() => validateEvolutionBaseUrl("http://169.254.169.254")).toThrow(/SSRF_VIOLATION/);
    expect(() => validateEvolutionBaseUrl("http://metadata.google.internal")).toThrow(/SSRF_VIOLATION/);
  });

  it("allows internal docker hostname evolution", () => {
    const valid = validateEvolutionBaseUrl("http://evolution:8080");
    expect(valid).toBe("http://evolution:8080");
  });
  it("never falls back to global credentials when channel lookup is absent or fails",async()=>{
    const fetchFn=vi.fn();const adapter=new EvolutionAdapter({fetchFn:fetchFn as any,defaultApiKey:"SIM-global",defaultInstance:"SIM-other",allowLocalTest:true});
    for(const resolver of [{},{useCredentials:vi.fn().mockResolvedValue(null)},{useCredentials:vi.fn().mockRejectedValue(new Error("SIM failure"))}]){
      const result=await adapter.sendMessage(dummyParams,resolver as any);expect(result).toMatchObject({success:false,errorCode:"CREDENTIALS_NOT_FOUND"});
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("refuses incomplete tenant credentials and uses encoded instance paths",async()=>{
    const fetchFn=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({key:{id:"SIM-id"}})});
    const adapter=new EvolutionAdapter({fetchFn:fetchFn as any,allowLocalTest:true});
    const resolver={useCredentials:vi.fn(async(channel,workspace,fn)=>{expect(channel).toBe(dummyParams.channelInstanceId);expect(workspace).toBe(dummyParams.workspaceId);return fn({api_key:"SIM-key",base_url:"http://evolution:8080"});})};
    expect(await adapter.sendMessage(dummyParams,resolver as any)).toMatchObject({success:false,errorCode:"CREDENTIALS_NOT_FOUND"});expect(fetchFn).not.toHaveBeenCalled();
    resolver.useCredentials.mockImplementation(async(_c: any,_w: any,fn: any)=>fn({api_key:"SIM-key",base_url:"http://evolution:8080",instance_name:"SIM sales/#2"}));
    await adapter.sendMessage(dummyParams,resolver as any);expect(fetchFn.mock.calls[0]?.[0]).toBe("http://evolution:8080/message/sendText/SIM%20sales%2F%232");
  });

  it("blocks invalid scoped URLs without sending or using defaults",async()=>{
    const fetchFn=vi.fn();const adapter=new EvolutionAdapter({fetchFn:fetchFn as any,allowLocalTest:true});
    const result=await adapter.sendMessage(dummyParams,{useCredentials:async(_c: any,_w: any,fn: any)=>fn({api_key:"SIM-key",instance_name:"SIM-instance",base_url:"http://169.254.169.254"})} as any);
    expect(result).toMatchObject({success:false,errorCode:"INVALID_BASE_URL"});expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([{}, {key:{id:""}}, {id:42}, {id:{}}, {messageId:"   "}])("does not fabricate confirmation for a response without a usable ID: %j",async body=>{
    const fetchFn=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>body});
    const adapter=new EvolutionAdapter({fetchFn:fetchFn as any,allowLocalTest:true});
    expect(await adapter.sendMessage(dummyParams,mockSecretResolver as any)).toMatchObject({success:false,category:"ambiguous",errorCode:"PROVIDER_MESSAGE_ID_MISSING"});expect(fetchFn).toHaveBeenCalledOnce();
  });
  it.each([{id:"SIM-root"},{messageId:"SIM-message"},{key:{id:" SIM-key "}}])("accepts provider-issued string identifiers: %j",async body=>{
    const fetchFn=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>body});
    const adapter=new EvolutionAdapter({fetchFn:fetchFn as any,allowLocalTest:true});
    expect(await adapter.sendMessage(dummyParams,mockSecretResolver as any)).toMatchObject({success:true,externalMessageId:expect.stringMatching(/^SIM-/)});
  });

});
