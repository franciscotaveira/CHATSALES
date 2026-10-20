// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { CreateWorkspaceModal } from "../components/CreateWorkspaceModal";
import { apiClient } from "../services/api-client";

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setNativeValue(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("CreateWorkspaceModal Component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("renders modal when isOpen is true with required input fields", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreateWorkspaceModal, {
          isOpen: true,
          onClose: () => {},
          onCreated: () => {},
        })
      );
    });

    const title = document.body.querySelector("h2");
    expect(title?.textContent).toContain("Cadastrar Nova Empresa");

    const inputs = document.body.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(3);

    // Verify company name input placeholder
    const companyInput = Array.from(inputs).find((inp) =>
      inp.placeholder.includes("Clínica Dra. Camila")
    );
    expect(companyInput).toBeDefined();

    root.unmount();
  });

  it("successfully calls apiClient.createWorkspace and displays success card", async () => {
    const mockCreateWorkspace = vi.spyOn(apiClient, "createWorkspace").mockResolvedValueOnce({
      success: true,
      workspace: {
        id: "ws-new-123",
        name: "Studio Bella Vista",
        slug: "studio-bella-vista",
      },
      owner: {
        id: "usr-456",
        name: "Camila Santos",
        email: "camila@studiobella.com.br",
        tempPassword: "MctSoberana2026!",
      },
      welcomeMessage: "🚀 Olá, Camila Santos! Seu acesso está pronto.",
    });

    const root = createRoot(container);
    let createdWorkspaceId: string | null = null;

    await act(async () => {
      root.render(
        createElement(CreateWorkspaceModal, {
          isOpen: true,
          onClose: () => {},
          onCreated: (wsId) => {
            createdWorkspaceId = wsId;
          },
        })
      );
    });

    // Fill inputs with React 19 compatible setter
    const inputs = document.body.querySelectorAll("input");
    const nameInput = inputs[0] as HTMLInputElement;
    const ownerNameInput = inputs[1] as HTMLInputElement;
    const ownerEmailInput = inputs[2] as HTMLInputElement;

    await act(async () => {
      setNativeValue(nameInput, "Studio Bella Vista");
      setNativeValue(ownerNameInput, "Camila Santos");
      setNativeValue(ownerEmailInput, "camila@studiobella.com.br");
    });

    // Click submit button
    const submitBtn = Array.from(document.body.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Criar Empresa")
    );
    expect(submitBtn).toBeDefined();

    await act(async () => {
      submitBtn?.click();
      // Allow async promises inside handler to resolve
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateWorkspace).toHaveBeenCalledWith({
      name: "Studio Bella Vista",
      ownerName: "Camila Santos",
      ownerEmail: "camila@studiobella.com.br",
      initialPassword: undefined,
    });

    // Check success title
    const updatedTitle = document.body.querySelector("h2");
    expect(updatedTitle?.textContent).toContain("Empresa criada");

    // Click switch button
    const switchBtn = Array.from(document.body.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Entrar nesta Empresa")
    );
    expect(switchBtn).toBeDefined();

    await act(async () => {
      switchBtn?.click();
    });

    expect(createdWorkspaceId).toBe("ws-new-123");

    mockCreateWorkspace.mockRestore();
    root.unmount();
  });
  it("preserves the exact password and keeps the created result when switching fails", async () => {
    const create = vi.spyOn(apiClient, "createWorkspace").mockResolvedValueOnce({
      success:true,workspace:{id:"synthetic-ws",name:"SIMULADO",slug:"simulado"},
      owner:{id:"synthetic-owner",name:"Responsável LAB",email:"owner@example.test",tempPassword:" senha "},welcomeMessage:"SIMULADO"
    });
    const root=createRoot(container);const close=vi.fn();
    await act(async()=>{root.render(createElement(CreateWorkspaceModal,{isOpen:true,onClose:close,onCreated:async()=>{throw new Error("Falha de entrada");}}));});
    const inputs=Array.from(document.body.querySelectorAll("input"));
    await act(async()=>{["SIMULADO","Responsável LAB","owner@example.test"," senha "].forEach((value,i)=>setNativeValue(inputs[i]!,value));});
    const button=(text:string)=>Array.from(document.body.querySelectorAll("button")).find(b=>b.textContent?.includes(text))!;
    await act(async()=>{button("Criar Empresa").click();button("Criar Empresa").click();});
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0].initialPassword).toBe(" senha ");
    await act(async()=>{button("Entrar nesta Empresa").click();});
    expect(close).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("A empresa já foi criada");
    expect(button("Entrar nesta Empresa").disabled).toBe(false);
    await act(async()=>root.unmount());container.remove();create.mockRestore();
  });

});
