var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
var { ExtensionSupport } = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

var inlineLabels = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const documents = new Map();
    const windows = new Map();
    const id = context.extension.id;
    let started = false;
    let closed = false;
    const attach = doc => {
      if (closed || !doc || doc.documentURI !== "about:3pane" || documents.has(doc)) return;
      const labels = installInlineLabels(doc.defaultView, MailServices);
      const reader = installReadingMode(doc.defaultView);
      const dates = installCompactDates(doc.defaultView);
      documents.set(doc, { refresh() { labels.refresh(); dates.refresh(); }, close() {
        dates.close(); reader.close(); labels.close();
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
      const listener = event => { if (event.target?.nodeType === 9) attach(event.target); };
      win.addEventListener("load", listener, true);
      windows.set(win, listener);
      scan(win.document);
    };
    const refresh = () => {
      for (const [doc, controller] of documents) {
        if (doc.defaultView?.closed) { controller.close(); documents.delete(doc); }
        else controller.refresh();
      }
    };
    const observer = { observe: refresh };
    context.callOnClose({ close() {
      closed = true;
      if (!started) return;
      ExtensionSupport.unregisterWindowListener(id);
      Services.prefs.removeObserver("mailnews.tags.", observer);
      for (const [win, listener] of windows) win.removeEventListener("load", listener, true);
      for (const controller of documents.values()) controller.close();
      documents.clear(); windows.clear();
    }});
    return { inlineLabels: { async start() {
      if (started) return;
      started = true;
      Services.prefs.addObserver("mailnews.tags.", observer);
      ExtensionSupport.registerWindowListener(id, {
        chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
        onLoadWindow: loadWindow,
        onUnloadWindow(win) {
          const listener = windows.get(win);
          if (listener) win.removeEventListener("load", listener, true);
          windows.delete(win);
          for (const [doc, controller] of documents) {
            if (doc.defaultView?.top === win || doc.defaultView?.closed) {
              controller.close(); documents.delete(doc);
            }
          }
        }
      });
    }}};
  }
};
