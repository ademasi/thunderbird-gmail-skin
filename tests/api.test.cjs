const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');

test('native keyword notifications refresh open conversations and unsubscribe on shutdown',async()=>{
  let listener, windows, cleanup, refreshed=0, disposed=0, removed;
  const mail={mfn:{addListener(value,flags){listener=value;assert.equal(flags,8)},removeListener(value){removed=value}}};
  const support={registerWindowListener(id,value){windows=value},unregisterWindowListener(){}};
  const scope=vm.createContext({ChromeUtils:{importESModule:()=>({
    ExtensionCommon:{ExtensionAPI:class{}},ExtensionSupport:support,MailServices:mail,ExtensionParent:{}})},
    Services:{prefs:{addObserver(){},removeObserver(){}}},
    Ci:{nsIDOMWindowUtils:{USER_SHEET:1},nsIMsgFolderNotificationService:{msgPropertyChanged:8}},
    GMAIL_SKIN_CSS:'',GMAIL_CONVERSATIONS_CSS:'',
    installConversationStyle:()=>({refresh(){refreshed++},close(){disposed++}})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../inline-labels/experiments/api.js'),'utf8'),scope);
  const api=new scope.inlineLabels().getAPI({extension:{id:'test'},callOnClose(value){cleanup=value}});
  await api.inlineLabels.start();
  const sheets=new Set();
  const win={windowUtils:{loadSheetUsingURIString(uri){sheets.add(uri)},removeSheetUsingURIString(uri){sheets.delete(uri)}},addEventListener(){},removeEventListener(){}};
  let todayPaneWrites=0;
  const pane={setVisible(){todayPaneWrites++}};
  win.TodayPane={updateDisplay(){todayPaneWrites++},updateSplitterState(){todayPaneWrites++}};
  win.document={documentURI:'chrome://conversations/content/experiment-api/stub.html',defaultView:win,
    getElementById:id=>id==='today-pane-panel'?pane:null,querySelectorAll:()=>[]};
  windows.onLoadWindow(win);
  assert.equal(todayPaneWrites,0,"attaching the skin preserves the native Today Pane preference");
  listener.msgPropertyChanged({},'keywords','ta','');assert.equal(refreshed,1);
  listener.msgPropertyChanged({},'label',1,0);assert.equal(refreshed,2);
  listener.msgPropertyChanged({},'junkscore','0','100');assert.equal(refreshed,2);
  cleanup.close();assert.equal(todayPaneWrites,0,"disabling the skin does not change calendar settings");assert.equal(removed,listener);assert.equal(disposed,1);assert.equal(sheets.size,0,"disable unloads all styles, including the Today Pane option");
  listener.msgPropertyChanged({},'keywords','ta','');assert.equal(refreshed,2);
});

test('startup waits for a complete mail pane and cancels retries when its window closes',()=>{
  const scope=vm.createContext({ChromeUtils:{importESModule:()=>({ExtensionCommon:{ExtensionAPI:class{}}})}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../inline-labels/experiments/api.js'),'utf8'),scope);
  const tasks=new Map();let sequence=0,unload,attached=0;
  const win={setTimeout(fn){tasks.set(++sequence,fn);return sequence},clearTimeout(id){tasks.delete(id)},
    addEventListener(name,fn){unload=fn},removeEventListener(){}};
  const doc={defaultView:win,readyState:'loading',getElementById:()=>({})};
  const step=()=>{const [id,fn]=tasks.entries().next().value;tasks.delete(id);fn()};
  scope.waitForMailPane(doc,()=>attached++);step();assert.equal(attached,0);
  doc.readyState='complete';step();assert.equal(attached,0,'DOM alone is insufficient before threadPane exists');
  win.threadPane={};step();assert.equal(attached,1);assert.equal(tasks.size,0);
  doc.readyState='loading';scope.waitForMailPane(doc,()=>attached++);
  unload();assert.equal(tasks.size,0,'unload cancels pending startup');assert.equal(attached,1);
});

