import { describe,it,expect } from "vitest";
import { mapImportRows,suggestImportColumns,sanitizeBrazilianPhoneE164 } from "../pages/templates/import-audience";

describe('Explicit audience column mapping',()=>{
 it('does not guess a phone from arbitrary numeric identifiers',()=>{
  const rows=[{documento:'11999999999',codigo:'21999999999'}];expect(suggestImportColumns(rows).phoneColumn).toBe('');expect(mapImportRows(rows,'','','BR').contacts).toEqual([]);
 });
 it('requires a choice for multiple recognizable phone columns',()=>{
  const rows=[{'Nome':'SIM Cliente','Telefone principal':'11999999999','Telefone alternativo':'21999999999'}];const suggestion=suggestImportColumns(rows);expect(suggestion.phoneColumn).toBe('');expect(suggestion.nameColumn).toBe('Nome');
  expect(mapImportRows(rows,'Telefone alternativo','Nome','BR').contacts).toEqual([{phoneE164:'+5521999999999',name:'SIM Cliente'}]);
 });
 it('preserves DDD 55 instead of mistaking it for a country prefix',()=>{
  expect(sanitizeBrazilianPhoneE164('55 99999-0001')).toEqual({phoneE164:'+5555999990001'});
  expect(sanitizeBrazilianPhoneE164('+55 55 99999-0001')).toEqual({phoneE164:'+5555999990001'});
 });
 it('keeps foreign numbers unchanged only in explicit international mode',()=>{
  const rows=[{phone:'+351 911 222 333'}];expect(mapImportRows(rows,'phone','','BR').contacts).toEqual([]);expect(mapImportRows(rows,'phone','','E164').contacts).toEqual([{phoneE164:'+351911222333',name:undefined}]);
 });
 it('reports duplicates and invalid table rows without silently replacing the first name',()=>{
  const rows=[{telefone:'11999999999',nome:'SIM Primeiro'},{telefone:'+5511999999999',nome:'SIM Outro'},{telefone:'abc',nome:'SIM Inválido'}];
  const mapped=mapImportRows(rows,'telefone','nome','BR');expect(mapped.contacts).toEqual([{phoneE164:'+5511999999999',name:'SIM Primeiro'}]);expect(mapped.stats).toEqual({totalRows:3,validCount:1,duplicateCount:1,invalidCount:1});expect(mapped.issues.map(row=>row.row)).toEqual([3,4]);
 });
 it('blocks names and phones mapped to the same column',()=>{
  const mapped=mapImportRows([{telefone:'11999999999'}],'telefone','telefone','BR');expect(mapped.contacts).toEqual([]);expect(mapped.error).toContain('colunas diferentes');
 });
 it('does not silently truncate a list above the campaign limit',()=>{
  const rows=Array.from({length:1001},(_,index)=>({telefone:`+55119999${String(index).padStart(5,'0')}`}));const mapped=mapImportRows(rows,'telefone','','BR');expect(mapped.contacts).toHaveLength(1001);expect(mapped.error).toContain('limite por campanha é 1.000');
 });
 it('reports a name that exceeds the API limit as a row issue',()=>{
  const mapped=mapImportRows([{telefone:'11999999999',nome:'x'.repeat(151)}],'telefone','nome','BR');expect(mapped.stats.invalidCount).toBe(1);expect(mapped.issues[0]?.reason).toContain('150');
 });
});
