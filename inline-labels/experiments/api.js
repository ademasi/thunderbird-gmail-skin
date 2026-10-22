var { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
var { ExtensionSupport } = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

function mailPaneReady(doc) {
  const win = doc.defaultView;
  return doc.readyState === 'complete' && !!win?.threadPane &&
    ['paneLayout','threadTree','folderTree'].every(id => doc.getElementById(id));
}
function waitForMailPane(doc, onReady) {
  const win = doc.defaultView;
  let timer = null, stopped = false, attempts = 0;
  function close() {
    stopped = true;
    if (timer !== null) win.clearTimeout(timer);
    win.removeEventListener('unload',close);
  }
  function check() {
    timer = null;
    if (stopped || win.closed) { close(); return; }
    if (mailPaneReady(doc)) { close(); onReady(); return; }
    if (++attempts < 100) timer = win.setTimeout(check,100);
    else { close(); console.warn('Thunder-G: mail pane is not ready; waiting for a later load event.'); }
  }
  win.addEventListener('unload',close,{once:true});
  timer = win.setTimeout(check,0);
  return {close};
}

var inlineLabels = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const documents = new Map();
    const pendingDocuments = new Map();
    const windows = new Map();
    const conversationDocuments = new Map();
    const id = context.extension.id;
    const skinWindows = new Map();
    let hideTodayPane = false;
    const todayWindows = new Set();
    const todayURI = 'data:text/css;charset=utf-8,' + encodeURIComponent(
      '#today-pane-panel, #today-splitter, #calendar-show-todaypane-panel { display:none !important; }');
    function applyTodayPane(win) {
      if (hideTodayPane && !todayWindows.has(win)) {
        win.windowUtils.loadSheetUsingURIString(todayURI, Ci.nsIDOMWindowUtils.USER_SHEET);
        todayWindows.add(win);
      } else if (!hideTodayPane) removeTodayPaneStyle(win);
    }
    function removeTodayPaneStyle(win) {
      if (!todayWindows.delete(win)) return;
      try { win.windowUtils.removeSheetUsingURIString(todayURI, Ci.nsIDOMWindowUtils.USER_SHEET); }
      catch (_) { /* Closed windows already discarded the sheet. */ }
    }
    const skinURI = 'data:text/css;charset=utf-8,' + encodeURIComponent(GMAIL_SKIN_CSS);
    function loadSkin(win, cssURI = skinURI) {
      if (skinWindows.has(win)) return;
      win.windowUtils.loadSheetUsingURIString(cssURI, Ci.nsIDOMWindowUtils.USER_SHEET);
      skinWindows.set(win, cssURI);
    }
    function unloadSkin(win) {
      const cssURI = skinWindows.get(win);
      if (!skinWindows.delete(win)) return;
      try { win.windowUtils.removeSheetUsingURIString(cssURI, Ci.nsIDOMWindowUtils.USER_SHEET); }
      catch (_) { /* A destroyed window already discarded its sheets. */ }
    }
    let started = false;
    let closed = false;
    const attach = doc => {
      if (!closed && doc?.documentURI === 'chrome://conversations/content/experiment-api/stub.html') {
        loadSkin(doc.defaultView, 'data:text/css;charset=utf-8,' + encodeURIComponent(GMAIL_CONVERSATIONS_CSS));
        if (!conversationDocuments.has(doc)) conversationDocuments.set(doc, installConversationStyle(doc.defaultView, GMAIL_CONVERSATIONS_CSS, messageId => {
          // IDs belong to Conversations, not to this extension's message manager.
          const extension = ExtensionParent.GlobalManager.extensionMap.get("gconversation@xulforum.org");
          const header = extension?.messageManager?.get(messageId);
          if (!header) return null;
          return assignedTags(header, MailServices.tags.getAllTags()).map(tag =>
            ({key:tag.key,name:tag.tag,color:tag.color}));
        }));
        return;
      }
      if (closed || !doc || doc.documentURI !== "about:3pane" || documents.has(doc)) return;
      if (!mailPaneReady(doc)) {
        if (!pendingDocuments.has(doc)) pendingDocuments.set(doc,waitForMailPane(doc,() => {
          pendingDocuments.delete(doc);
          attach(doc);
        }));
        return;
      }
      pendingDocuments.get(doc)?.close(); pendingDocuments.delete(doc);
      loadSkin(doc.defaultView);
      const labels = installInlineLabels(doc.defaultView, MailServices);
      const reader = installReadingMode(doc.defaultView);
      const dates = installCompactDates(doc.defaultView);
      const inbox = installInboxControls(doc.defaultView);
      const conversationBrowser = watchConversationBrowser(doc.defaultView, attach);
      documents.set(doc, { refresh() { labels.refresh(); dates.refresh(); }, close() {
        conversationBrowser.close(); inbox.close(); dates.close(); reader.close(); labels.close();
      }});
    };
    const scan = doc => {
      attach(doc);
      for (const browser of doc.querySelectorAll("browser")) {
        try { if (browser.contentDocument) scan(browser.contentDocument); }
        catch (error) { console.error("Inline labels document attachment:", error); }
      }
    };
    const loadWindow = win => {
      loadSkin(win);
      // Today Pane visibility belongs to the user. Do not persist calendar UI
      // changes when a skin attaches, restarts, or is disabled.
      const listener = event => { if (event.target?.nodeType === 9) attach(event.target); };
      win.addEventListener("load", listener, true);
      windows.set(win, listener);
      applyTodayPane(win);
      scan(win.document);
    };
    const refresh = () => {
      for (const [doc, controller] of documents) {
        if (doc.defaultView?.closed) { controller.close(); documents.delete(doc); }
        else controller.refresh();
      }
    };
    const observer = { observe: refresh };
    const tagChanges = {
      msgPropertyChanged(header, property) {
        if (closed || !["keywords", "label"].includes(property)) return;
        for (const controller of conversationDocuments.values()) controller.refresh();
      }
    };
    context.callOnClose({ close() {
      closed = true;
      if (!started) return;
      ExtensionSupport.unregisterWindowListener(id);
      Services.prefs.removeObserver("mailnews.tags.", observer);
      MailServices.mfn.removeListener(tagChanges);
      for (const [win, listener] of windows) win.removeEventListener("load", listener, true);
      for (const controller of pendingDocuments.values()) controller.close();
      pendingDocuments.clear();
      for (const controller of documents.values()) controller.close();
      for (const controller of conversationDocuments.values()) controller.close();
      conversationDocuments.clear();
      for (const win of skinWindows.keys()) unloadSkin(win);
      for (const win of todayWindows) removeTodayPaneStyle(win);
      documents.clear(); windows.clear();
    }});
    return { inlineLabels: {
      async setHideTodayPane(hidden) {
        if (closed) return;
        hideTodayPane = hidden;
        for (const win of windows.keys()) applyTodayPane(win);
      },
      async start() {
      if (started) return;
      started = true;
      Services.prefs.addObserver("mailnews.tags.", observer);
      MailServices.mfn.addListener(tagChanges, Ci.nsIMsgFolderNotificationService.msgPropertyChanged);
      ExtensionSupport.registerWindowListener(id, {
        chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
        onLoadWindow: loadWindow,
        onUnloadWindow(win) {
          removeTodayPaneStyle(win);
          unloadSkin(win);
          const listener = windows.get(win);
          if (listener) win.removeEventListener("load", listener, true);
          windows.delete(win);
          for (const [doc, controller] of conversationDocuments) {
            if (doc.defaultView?.top === win || doc.defaultView?.closed) {
              controller.close(); unloadSkin(doc.defaultView); conversationDocuments.delete(doc);
            }
          }
          for (const [doc, controller] of documents) {
            if (doc.defaultView?.top === win || doc.defaultView?.closed) {
              controller.close(); unloadSkin(doc.defaultView); documents.delete(doc);
            }
          }
        }
      });
    }}};
  }
};
