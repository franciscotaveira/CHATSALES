// Read-only audit for the duplicate explicit sibling-key regression found in UX293.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=process.cwd(),files=[],findings=[],parseFailures=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 if(item.name==='__tests__')continue;
 const file=path.join(dir,item.name);
 if(item.isDirectory())walk(file);else if(/\.tsx$/.test(item.name)&&!/(?:\.test|\.spec|\.stories)\.tsx$/.test(item.name))files.push(file);
}}
for(const dir of ['apps/web/src','packages/ui/src'])walk(path.join(root,dir));
const printer=ts.createPrinter();let checkedGroups=0,explicitKeys=0;
function keyOf(node,source){
 const attrs=ts.isJsxElement(node)?node.openingElement.attributes:node.attributes;
 const key=attrs.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(source)==='key');
 if(!key?.initializer)return null;
 if(ts.isStringLiteral(key.initializer))return `literal:${key.initializer.text}`;
 const value=key.initializer.expression;if(!value)return null;
 if(ts.isStringLiteral(value)||ts.isNumericLiteral(value))return `literal:${value.text}`;
 return `expression:${printer.printNode(ts.EmitHint.Expression,value,source)}`;
}
const inventory=[];
for(const file of files.sort()){
 const text=fs.readFileSync(file,'utf8'),relative=path.relative(root,file);
 inventory.push({file:relative,sha256:crypto.createHash('sha256').update(text).digest('hex')});
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(source.parseDiagnostics.length)parseFailures.push({file:relative,count:source.parseDiagnostics.length});
 function visit(node){
  if(ts.isJsxElement(node)||ts.isJsxFragment(node)){
   const children=node.children.filter(child=>ts.isJsxElement(child)||ts.isJsxSelfClosingElement(child));
   if(children.length>1){checkedGroups++;const seen=new Map();for(const child of children){const key=keyOf(child,source);if(key===null)continue;explicitKeys++;const line=source.getLineAndCharacterOfPosition(child.getStart(source)).line+1;
    if(seen.has(key))findings.push({file:relative,line,previousLine:seen.get(key),key});else seen.set(key,line);
   }}
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
console.log(JSON.stringify({files:inventory.length,checkedGroups,explicitKeys,findings,parseFailures,inventory,limitations:['Only explicit keys on directly adjacent JSX child elements are compared.','Conditional branches, spreads, dynamic key values, arrays and runtime reconciliation still require tests and visual review.']},null,2));
process.exitCode=findings.length||parseFailures.length?1:0;
