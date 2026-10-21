const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const scope = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../inline-labels/reading.js'),'utf8'),scope);
test('only unmodified left clicks on message text open reading mode',()=>{
  const event = {button:0,target:{closest:()=>null}};
  assert.equal(scope.isReadingClick(event),true);
  for(const key of ['metaKey','ctrlKey','altKey','shiftKey']) {
    assert.equal(scope.isReadingClick({...event,[key]:true}),false);
  }
  assert.equal(scope.isReadingClick({...event,button:2}),false);
  assert.equal(scope.isReadingClick({...event,target:{closest:()=>({})}}),false);
});
test('successful moves of the open message return to list; copies and other mail do not',()=>{
  const previous = {message:{key:42,folderURI:'imap://account/INBOX'}};
  const message = {messageKey:42,folder:{URI:'imap://account/INBOX'}};
  assert.equal(scope.readingMessageWasMoved(previous,true,[message]),true);
  assert.equal(scope.readingMessageWasMoved(previous,false,[message]),false);
  assert.equal(scope.readingMessageWasMoved(previous,true,[{...message,messageKey:43}]),false);
  assert.equal(scope.readingMessageWasMoved(previous,true,[{...message,folder:{URI:'imap://other/INBOX'}}]),false);
  assert.equal(scope.readingMessageWasMoved(null,true,[message]),false);
});
test('returning from a conversation collapses even an initially expanded native preview',()=>{
  const elements = [];
  function element() {
    const events = {};
    const item = {events, classList:{add(){},remove(){}}, style:{},
      setAttribute(){}, append(){}, remove(){}, focus(){},
      addEventListener(name,fn){events[name]=fn}, removeEventListener(){}};
    elements.push(item); return item;
  }
  const layout = element(); layout.messagePaneVisible = true;
  const tree = element(); tree.scrollTop=120; tree.scrollLeft=0;
  tree.contains=()=>true; tree.table={body:element()};
  const folderTree=element();
  const doc={getElementById:id=>({paneLayout:layout,threadTree:tree,folderTree})[id],
    createElement:element,createElementNS:element,createXULElement:element,
    head:element(),documentElement:element()};
  const frameQueue=[]; let listener;
  scope.Ci={nsIMsgFolderNotificationService:{msgsMoveCopyCompleted:1}};
  scope.MailServices={mfn:{addListener(fn){listener=fn},removeListener(){}}};
  const hdr={messageKey:42,folder:{URI:'imap://account/INBOX'}};
  const win={document:doc,gFolder:hdr.folder,gDBView:{hdrForFirstSelectedMessage:hdr},
    requestAnimationFrame:fn=>{frameQueue.push(fn);return frameQueue.length},
    cancelAnimationFrame(){},addEventListener(){},removeEventListener(){}};
  const controller=scope.installReadingMode(win);
  assert.equal(layout.messagePaneVisible,false,'startup must be list only');
  const row={index:0,dataset:{}};
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?row:null}});
  frameQueue.shift()();
  assert.equal(layout.messagePaneVisible,true,'click opens conversation');
  listener.msgsMoveCopyCompleted(true,[hdr]);
  assert.equal(layout.messagePaneVisible,false,'archive closes preview immediately');
  while(frameQueue.length)frameQueue.shift()();
  assert.equal(layout.messagePaneVisible,false,'deferred list restoration cannot reopen next message');
  controller.close();
  assert.equal(layout.messagePaneVisible,true,'disabling skin restores original preference');
});
test('checkbox selection shows bulk toolbar and archives native selection without opening reader',()=>{
  const nodes=[];
  function element(){
    const events={};
    const item={events,children:[],style:{},classList:{add(){},remove(){}},setAttribute(){},
      append(...items){this.children.push(...items)},prepend(item){this.children.unshift(item)},
      remove(){},focus(){},addEventListener(name,fn){(events[name]??=[]).push(fn)},removeEventListener(){}};
    nodes.push(item);return item;
  }
  const layout=element(), tree=element(), folders=element(), threadPane=element();
  tree.reset=()=>{};tree.contains=()=>true;tree.table={body:element()};
  const doc={getElementById:id=>({paneLayout:layout,threadTree:tree,folderTree:folders,threadPane})[id],
    createElement:element,createElementNS:element,createXULElement:element,head:element(),documentElement:element()};
  const columns=[{id:'flaggedCol',ordinal:1,hidden:false},{id:'selectCol',ordinal:2,hidden:true}];
  const messages=[{messageKey:1},{messageKey:2}];let selected=messages;const calls=[];const frames=[];
  scope.Ci={nsIMsgFolderNotificationService:{msgsMoveCopyCompleted:1}};
  scope.MailServices={mfn:{addListener(){},removeListener(){}}};
  const win={document:doc,gDBView:{getSelectedMsgHdrs:()=>selected},
    threadPane:{columns,updateColumns(){}},commandController:{isCommandEnabled:()=>true,
      doCommand:name=>calls.push([name,selected.slice()])},
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length},cancelAnimationFrame(){},
    addEventListener(){},removeEventListener(){}};
  Object.defineProperty(tree,'selectedIndices',{set(){selected=[]}});
  const controller=scope.installReadingMode(win);
  assert.equal(columns[0].id,'selectCol');assert.equal(columns[0].hidden,false);
  const event={button:0,target:{closest:selector=>selector.includes('.selectcol-column')?{}:null}};
  for(const fn of tree.events.click)fn(event);
  while(frames.length)frames.shift()();
  const toolbar=threadPane.children[0];
  assert.equal(toolbar.hidden,false);assert.equal(toolbar.children[1].textContent,'2 selected');
  assert.equal(layout.messagePaneVisible,false);
  const archive=nodes.find(n=>n.title==='Archive');archive.events.click[0]();
  assert.equal(calls[0][0],'cmd_archive');assert.equal(calls[0][1].length,2);
  assert.equal(toolbar.hidden,true);assert.equal(selected.length,0);
  controller.close();assert.equal(columns.find(c=>c.id==='selectCol').hidden,true);
});
test('L is restricted to unmodified mail browsing, never text entry or composition',()=>{
  const event={key:'l',target:{closest:()=>null}};
  assert.equal(scope.isLabelShortcut(event),true);
  for(const key of ['ctrlKey','metaKey','altKey','shiftKey','repeat','isComposing','defaultPrevented'])
    assert.equal(scope.isLabelShortcut({...event,[key]:true}),false,key);
  assert.equal(scope.isLabelShortcut({...event,key:'k'}),false);
  assert.equal(scope.isLabelShortcut({...event,target:{isContentEditable:true}}),false);
  assert.equal(scope.isLabelShortcut({...event,target:{closest:()=>({})}}),false);
});
test('label search supports substrings, case, spaces, Unicode and literal punctuation',()=>{
  assert.equal(scope.labelMatchesQuery('Project / UniNE',' unine '),true);
  assert.equal(scope.labelMatchesQuery('ＡＢＣ','abc'),true);
  assert.equal(scope.labelMatchesQuery('conf[2026]','['),true);
  assert.equal(scope.labelMatchesQuery('Project',''),true);
  assert.equal(scope.labelMatchesQuery('Project','other'),false);
});
test('label checkboxes distinguish all, some, none, legacy labels and exact keys',()=>{
  const msg=(keywords,label=0)=>({getStringProperty:()=>keywords,label});
  const state=messages=>JSON.parse(JSON.stringify(scope.labelAssignmentState({key:'one'},messages)));
  assert.deepEqual(state([msg('one'),msg('one two')]),{checked:true,mixed:false});
  assert.deepEqual(state([msg('one'),msg('two')]),{checked:false,mixed:true});
  assert.deepEqual(state([msg('onetwo')]),{checked:false,mixed:false});
  assert.deepEqual(state([]),{checked:false,mixed:false});
  assert.equal(scope.labelAssignmentState({key:'$label1'},[msg('',1)]).checked,true);
});
test('picker filters, preserves focus, delegates bulk toggles and rejects changed selection',()=>{
  const nodes=[];
  function el(name){const events={}, attrs={};const n={name,events,children:[],style:{},value:'',isConnected:true,
    classList:{add(){},remove(){}},setAttribute(k,v){attrs[k]=v},getAttribute:k=>attrs[k],
    append(...children){this.children.push(...children)},prepend(x){this.children.unshift(x)},
    replaceChildren(...children){this.children=children},get childElementCount(){return this.children.length},
    addEventListener(k,f){(events[k]??=[]).push(f)},removeEventListener(){},remove(){},
    focus(){doc.activeElement=this},querySelectorAll(){return this.children.flatMap(x=>x.children.filter(y=>y.name==='input'))},
    openPopup(){this.events.popupshown?.forEach(f=>f())},hidePopup(){this.events.popuphidden?.forEach(f=>f())}};
    nodes.push(n);return n;}
  const layout=el(),tree=el(),folderTree=el(),threadPane=el();
  const doc={activeElement:tree,getElementById:id=>({paneLayout:layout,threadTree:tree,folderTree,threadPane})[id],
    createElement:el,createElementNS:(_ns,name)=>el(name),createXULElement:el,head:el(),documentElement:el()};
  const messages=[{messageKey:1,folder:{URI:'inbox'},getStringProperty:()=> 'one'},
    {messageKey:2,folder:{URI:'inbox'},getStringProperty:()=> ''}];let selected=messages;const calls=[];
  scope.Ci={nsIMsgFolderNotificationService:{msgsMoveCopyCompleted:1}};
  scope.MailServices={mfn:{addListener(){},removeListener(){}},tags:{getAllTags:()=>[
    {key:'one',tag:'Project One',color:'#ff0000'},{key:'two',tag:'Other'}]}};
  const win={document:doc,gDBView:{getSelectedMsgHdrs:()=>selected},commandController:{_toggleMessageTag:(...args)=>calls.push(args)},
    addEventListener(){},removeEventListener(){}};
  const controller=scope.installReadingMode(win);
  nodes.find(n=>n.title==='Labels… (L)').events.click[0]();
  const search=nodes.find(n=>n.type==='search');assert.equal(doc.activeElement,search);
  const first=nodes.find(n=>n.type==='checkbox');assert.equal(first.indeterminate,true);
  first.checked=true;first.events.change[0]();assert.deepEqual(calls,[['one',true]]);
  first.checked=false;first.events.change[0]();assert.deepEqual(calls[1],['one',false]);
  search.value='Other';search.events.input[0]();
  const list=nodes.find(n=>n.className==='gm-label-list');assert.equal(list.childElementCount,1);
  const other=list.children[0].children[0];selected=[messages[0]];
  other.checked=true;other.events.change[0]();assert.equal(calls.length,2);assert.equal(doc.activeElement,tree);
  controller.close();
});
