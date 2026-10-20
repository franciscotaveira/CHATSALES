// @vitest-environment happy-dom
import {act,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Composer} from '../pages/cockpit/Conversation/Composer';
import {attachmentFileError} from '../pages/cockpit/utils/attachment-file';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const send=vi.fn(),attach=vi.fn();
const pdf=()=>new File(['SIM'],'SIM anterior.pdf',{type:'application/pdf'});
function Harness({sending=false}:{sending?:boolean}){const [file,setFile]=useState<File|null>(pdf),[draft,setDraft]=useState('SIM texto preservado');return <Composer draft={draft} onDraftChange={setDraft} attachedFile={file} onAttachFile={f=>{attach(f);setFile(f);}} onSend={send} isSending={sending} windowInfo={{isOpen:true,hoursRemaining:0,badgeText:'SIM',badgeVariant:'action'}} onOpenTemplates={()=>{}}/>;}
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);send.mockReset();attach.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();});
async function choose(file:File){await act(async()=>{const input=el.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new Event('change',{bubbles:true}));});}
it.each([['empty',new File([],'SIM vazio.pdf',{type:'application/pdf'}),'arquivo está vazio'],['unsupported',new File(['SIM'],'SIM.txt',{type:'text/plain'}),'Formato não aceito']])('rejects %s without replacing the previous attachment or draft',async(_label,file,notice)=>{
 await act(async()=>root.render(<Harness/>));await choose(file as File);expect(el.textContent).toContain(notice as string);expect(el.textContent).toContain('SIM anterior.pdf');expect(el.querySelector('textarea')!.value).toBe('SIM texto preservado');expect(attach).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();expect(el.querySelector<HTMLInputElement>('input[type=file]')!.value).toBe('');
});
it('validates image and document size boundaries before upload',()=>{
 const sized=(type:string,size:number)=>{const file=new File(['SIM'],'SIM file',{type});Object.defineProperty(file,'size',{value:size});return file;};
 expect(attachmentFileError(sized('image/png',5*1024*1024))).toBeNull();expect(attachmentFileError(sized('image/png',5*1024*1024+1))).toContain('5 MB');expect(attachmentFileError(sized('application/pdf',16*1024*1024))).toBeNull();expect(attachmentFileError(sized('application/pdf',16*1024*1024+1))).toContain('16 MB');
});
it('replaces a file only after valid selection and clears the selection error',async()=>{
 await act(async()=>root.render(<Harness/>));await choose(new File([],'SIM vazio.pdf',{type:'application/pdf'}));await choose(new File(['SIM replacement'],'SIM novo.pdf',{type:'application/pdf'}));expect(el.textContent).toContain('SIM novo.pdf');expect(el.textContent).not.toContain('SIM anterior.pdf');expect(el.querySelector('[role=alert]')).toBeNull();expect(attach).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();
});
it('blocks removal while sending and restores focus to the text after a permitted removal',async()=>{
 await act(async()=>root.render(<Harness sending/>));const remove=el.querySelector<HTMLButtonElement>('button[aria-label="Remover anexo"]')!;expect(remove.disabled).toBe(true);await act(async()=>remove.click());expect(attach).not.toHaveBeenCalled();await act(async()=>root.render(<Harness/>));await act(async()=>el.querySelector<HTMLButtonElement>('button[aria-label="Remover anexo"]')!.click());expect(el.textContent).not.toContain('SIM anterior.pdf');expect(el.querySelector('textarea')!.value).toBe('SIM texto preservado');expect(document.activeElement).toBe(el.querySelector('textarea'));expect(send).not.toHaveBeenCalled();
});
