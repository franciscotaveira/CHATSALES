// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Notes } from "../pages/cockpit/ContextPanel/Notes";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement;
const save = vi.fn();
async function render(note: string) { await act(async () => root.render(createElement(Notes, { initialNotes: note, onSaveNotes: save }))); }
const field = () => host.querySelector("textarea")!;
const button = (text: string) => Array.from(host.querySelectorAll("button")).find(b => b.textContent?.includes(text))!;
async function edit(text: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field(), text); field().dispatchEvent(new Event("input", { bubbles: true })); }); }
beforeEach(() => { host=document.createElement("div"); document.body.appendChild(host); root=createRoot(host); save.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it("updates a clean note when new saved content arrives", async () => { await render("old"); await render("new"); expect(field().value).toBe("new"); });
it("preserves dirty text and requires an explicit choice before overwriting received content", async () => {
 await render("old"); await edit("my draft"); await render("other operator");
 expect(field().value).toBe("my draft"); expect(button("Salvar Anotação").disabled).toBe(true);
 expect(host.textContent).toContain("other operator");
 await act(async () => button("Manter meu rascunho").click());
 expect(button("Salvar Anotação").disabled).toBe(false);
 await act(async () => button("Salvar Anotação").click()); expect(save).toHaveBeenCalledWith("my draft");
 expect(field().value).toBe("my draft");
});
it("allows loading the received note without saving the draft", async () => {
 await render("old"); await edit("draft"); await render("received"); await act(async () => button("Carregar nota recebida").click());
 expect(field().value).toBe("received"); expect(save).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("Salvar Anotação");
});
it("keeps the draft and error when persistence fails", async () => {
 save.mockRejectedValue(new Error("Falha simulada")); await render("old"); await edit("draft"); await act(async () => button("Salvar Anotação").click());
 expect(field().value).toBe("draft"); expect(host.textContent).toContain("Falha simulada"); expect(button("Salvar Anotação").disabled).toBe(false);
});

it("shows the received note when the local edit is fully undone",async()=>{
 await render('old');await edit('draft');await render('other operator');await edit('old');
 expect(field().value).toBe('other operator');expect(host.textContent).not.toContain('Salvar Anotação');expect(save).not.toHaveBeenCalled();
});
it("serializes synchronous save clicks and keeps the successful draft while parent data catches up",async()=>{
 let resolve!:()=>void;save.mockReturnValue(new Promise<void>(r=>resolve=r));await render('old');await edit('draft');
 await act(async()=>{button('Salvar Anotação').click();button('Salvar Anotação').click();});expect(save).toHaveBeenCalledTimes(1);
 await act(async()=>resolve());expect(field().value).toBe('draft');expect(host.textContent).not.toContain('Salvar Anotação');
 await render('draft');expect(field().value).toBe('draft');
});
it("keeps a useful failure and the draft when a save rejects without an Error object",async()=>{
 save.mockRejectedValue(null);await render('old');await edit('draft');await act(async()=>button('Salvar Anotação').click());
 expect(field().value).toBe('draft');expect(host.textContent).toContain('Não foi possível salvar a anotação');expect(button('Salvar Anotação').disabled).toBe(false);
});
