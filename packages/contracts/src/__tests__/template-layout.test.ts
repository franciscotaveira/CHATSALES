import { describe, expect, it } from 'vitest';
import { assembleTemplate, templateLayoutSignature, validateTemplateComponents } from '../template-layout';

describe('provider template layout', () => {
  it('keeps header and body values separate and orders positional parameters', () => {
    const source = {bodyText: '{{2}} / {{1}} / {{2}}', headerText: 'Olá {{1}}'};
    const result = assembleTemplate(source, {'header:1':'Empresa', '1':'Ana', '2':'Pedido'});
    expect(result.renderedHeader).toBe('Olá Empresa');
    expect(result.components).toEqual([
      {type:'header', parameters:[{type:'text',text:'Empresa'}]},
      {type:'body', parameters:[{type:'text',text:'Ana'},{type:'text',text:'Pedido'}]},
    ]);
    expect(validateTemplateComponents(source,result.components)).toEqual([]);
  });

  it.each(['IMAGE','VIDEO','DOCUMENT'])('requires and prepares %s media', format => {
    const source = {bodyText:'Pedido {{1}}', providerComponents:[{type:'HEADER',format}]};
    expect(assembleTemplate(source, {'1':'42'}).missing).toHaveLength(1);
    const result = assembleTemplate(source, {'1':'42','header:media':'https://example.com/file','header:filename':'pedido.pdf'});
    expect(result.mediaType).toBe(format.toLowerCase());
    expect(validateTemplateComponents(source,result.components)).toEqual([]);
    expect(assembleTemplate(source, {'1':'42','header:media':'javascript:alert(1)'}).errors).toHaveLength(1);
  });

  it('retains named parameters and original button indices', () => {
    const source = {bodyText:'Olá {{nome}}', parameterFormat:'NAMED', providerComponents:[{type:'BUTTONS',buttons:[
      {type:'PHONE_NUMBER',text:'Ligar',phone_number:'+5500000000001'},
      {type:'URL',text:'Pedido',url:'https://example.com/pedido/{{1}}'},
      {type:'QUICK_REPLY',text:'Ajuda'},
    ]}]};
    const result = assembleTemplate(source, {nome:'Ana','button:1':'42','button:2:payload':'help'});
    expect(result.components[0]?.parameters?.[0]).toEqual({type:'text',text:'Ana',parameter_name:'nome'});
    expect(result.components[1]?.index).toBe(1);
    expect(result.renderedText).toContain('https://example.com/pedido/42');
    expect(validateTemplateComponents(source,result.components)).toEqual([]);
    expect(validateTemplateComponents(source,[result.components[0]!])).toContain('Falta o complemento do link do botão 2.');
  });

  it('rejects unsupported shapes and duplicate parameters', () => {
    const source = {bodyText:'Olá {{1}}'};
    const result = assembleTemplate(source, {'1':'Ana'});
    expect(validateTemplateComponents(source,[...result.components,...result.components])).toContain('Cabeçalho ou corpo duplicado.');
    expect(assembleTemplate({...source,providerComponents:[{type:'CAROUSEL'}]}, {'1':'Ana'}).unsupported).toHaveLength(1);
    expect(validateTemplateComponents(source,[{type:'header',parameters:[]}])).not.toEqual([]);
  });

  it('changes approval snapshot when a header or button changes', () => {
    const source = {bodyText:'Olá',headerText:'Empresa'};
    expect(templateLayoutSignature(source)).not.toBe(templateLayoutSignature({...source,headerText:'Outra'}));
    expect(templateLayoutSignature(source)).toBe(templateLayoutSignature({headerText:'Empresa',bodyText:'Olá'}));
  });
});
