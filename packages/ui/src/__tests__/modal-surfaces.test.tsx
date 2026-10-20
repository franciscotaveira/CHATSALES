// @vitest-environment happy-dom
import { act, useState, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "../components/Dialog/Dialog";
import { CommandPalette } from "../components/CommandPalette/CommandPalette";
import { Drawer } from "../components/Drawer/Drawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.body.style.overflow = ""; });
async function key(value: string, shiftKey = false) { await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true })); }); }
function query<T extends HTMLElement>(selector: string): T { const found = document.querySelector<T>(selector); if (!found) throw new Error(`Missing ${selector}`); return found; }

describe("Modal surfaces — keyboard and context", () => {
  it("focuses a usable field and excludes hidden or disabled controls from the focus loop", async () => {
    await act(async () => root.render(<Dialog isOpen onClose={() => {}} title="Editar contato" footer={<><button id="save">Salvar</button><button disabled>Indisponível</button><button style={{display:"none"}}>Oculto</button></>}>
      <input disabled aria-label="Desabilitado"/><input id="name" aria-label="Nome"/>
    </Dialog>));
    expect(document.activeElement).toBe(query("#name"));
    query("#save").focus(); await key("Tab");
    expect(document.activeElement).toBe(query('button[aria-label="Fechar diálogo"]'));
    await key("Tab",true); expect(document.activeElement).toBe(query("#save"));
  });

  it("Escape closes only the top dialog, restores the parent focus, then restores the application", async () => {
    function Example() {
      const [drawer,setDrawer]=useState(false);const [dialog,setDialog]=useState(false);
      return <><button id="opener" onClick={()=>setDrawer(true)}>Abrir ficha</button>
        <Drawer isOpen={drawer} onClose={()=>setDrawer(false)} title="Ficha"><button id="nested" onClick={()=>setDialog(true)}>Editar</button></Drawer>
        <Dialog isOpen={dialog} onClose={()=>setDialog(false)} title="Edição"><input aria-label="Nome"/></Dialog></>;
    }
    document.body.style.overflow="auto";
    await act(async()=>root.render(<Example/>));
    const opener=query<HTMLButtonElement>("#opener");opener.focus();await act(async()=>opener.click());
    expect(container.inert).toBe(true);expect(document.body.style.overflow).toBe("hidden");
    const nested=query<HTMLButtonElement>("#nested");nested.focus();await act(async()=>nested.click());
    expect(query('[data-sos-overlay="drawer"]').inert).toBe(true);
    await key("Escape");
    expect(document.querySelector('[data-sos-overlay="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(nested);expect(document.querySelector('[data-sos-overlay="drawer"]')).not.toBeNull();
    await key("Escape");expect(document.activeElement).toBe(opener);expect(container.inert).toBe(false);expect(document.body.style.overflow).toBe("auto");
  });

  it("does not steal focus on edits and uses the latest close callback",async()=>{
    const first=vi.fn(),next=vi.fn();
    await act(async()=>root.render(<Dialog isOpen title="Editar" onClose={first}><input id="field"/><button id="choice">Escolha</button></Dialog>));
    query("#choice").focus();
    await act(async()=>root.render(<Dialog isOpen title="Editar atualizado" onClose={next}><input id="field"/><button id="choice">Escolha</button></Dialog>));
    expect(document.activeElement).toBe(query("#choice"));await key("Escape");expect(first).not.toHaveBeenCalled();expect(next).toHaveBeenCalledOnce();
  });

  it("restores pre-existing background attributes after unmount",async()=>{
    container.setAttribute("aria-hidden","false");
    await act(async()=>root.render(<Drawer isOpen title="Cliente" onClose={()=>{}}><p>Dados</p></Drawer>));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.getAttribute("aria-hidden")).toBe("true");
    await act(async()=>root.render(null));expect(container.getAttribute("aria-hidden")).toBe("false");expect(container.inert).toBe(false);
  });

  it("keeps a surface with no enabled controls keyboard reachable",async()=>{
    await act(async()=>root.render(<Dialog isOpen title="Aguardar" onClose={()=>{}}><input disabled/></Dialog>));
    const dialog=query('[role="dialog"]');dialog.focus();await key("Tab");
    expect(document.activeElement).toBe(query('button[aria-label="Fechar diálogo"]'));
  });

  it("cleans up correctly when React replays effects in StrictMode",async()=>{
    await act(async()=>root.render(<StrictMode><Dialog isOpen title="Teste" onClose={()=>{}}><input aria-label="Campo"/></Dialog></StrictMode>));
    expect(document.body.style.overflow).toBe("hidden");
    await act(async()=>root.render(null));expect(document.body.style.overflow).toBe("");expect(container.inert).toBe(false);
  });
  it("keyboard selection follows the visible category order, not the original array",async()=>{
    const action=vi.fn(),page=vi.fn(),close=vi.fn();
    await act(async()=>root.render(<CommandPalette isOpen onClose={close} items={[{id:'action',title:'Criar',category:'actions',onSelect:action},{id:'page',title:'Contatos',category:'navigation',onSelect:page}]}/>));
    expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain('Contatos');
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');await key('Enter');expect(page).toHaveBeenCalledOnce();expect(action).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();
  });

  it("keeps global search above a dialog and restores its opener on Escape",async()=>{
    function Example(){const [search,setSearch]=useState(false);return <><Dialog isOpen title="Cliente" onClose={()=>{}}><button id="open-search" onClick={()=>setSearch(true)}>Buscar ação</button></Dialog><CommandPalette isOpen={search} onClose={()=>setSearch(false)} items={[]}/></>;}
    await act(async()=>root.render(<Example/>));const opener=query<HTMLButtonElement>('#open-search');opener.focus();await act(async()=>opener.click());
    expect(query('[data-sos-overlay="dialog"]').inert).toBe(true);
    query('button[aria-label="Fechar busca"]').focus();await key('Escape');
    expect(document.querySelector('[data-sos-overlay="commands"]')).toBeNull();expect(document.activeElement).toBe(opener);expect(query('[data-sos-overlay="dialog"]').inert).toBe(false);
  });

});

it('keeps a dialog open when Escape belongs to an active text composition',async()=>{
 const close=vi.fn();await act(async()=>root.render(<Dialog isOpen title="SIM formulário" onClose={close}><input aria-label="SIM texto"/></Dialog>));
 await act(async()=>document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true})));expect(close).not.toHaveBeenCalled();await key('Escape');expect(close).toHaveBeenCalledOnce();
});
