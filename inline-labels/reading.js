/* Gmail-like navigation around the native/Conversations message pane.
 * Actions delegate to native Thunderbird commands and installed Follow-Ups.
 */
function isReadingClick(event) {
  return event.button === 0 && !event.ctrlKey && !event.metaKey &&
    !event.shiftKey && !event.altKey &&
    !event.target.closest('button, input, a, .button-column, .select-column, .selectcol-column, .twisty, .gm-reading-toolbar');
}

function readingMessageWasMoved(previous, move, messages) {
  return !!(move && previous?.message && messages.some(message =>
    message.messageKey === previous.message.key &&
    message.folder?.URI === previous.message.folderURI));
}

function installReadingMode(win) {
  const doc = win.document;
  const layout = doc.getElementById('paneLayout');
  const tree = doc.getElementById('threadTree');
  const folderTree = doc.getElementById('folderTree');
  if (!layout || !tree || !folderTree) return { close() {} };
  let active = false;
  let closed = false;
  let pending = null;
  let previous = null;
  let bulk = false;
  const threadPane = doc.getElementById('threadPane');
  const selectionLabel = doc.createElement('span');
  const originalColumns = new Map();
  const originalUpdateColumns = win.threadPane?.updateColumns;
  function checkboxColumns() {
    const columns = win.threadPane?.columns;
    if (!columns) return;
    for (const c of columns) {
      if (!originalColumns.has(c)) originalColumns.set(c, {hidden:c.hidden, ordinal:c.ordinal});
    }
    const select = columns.find(c => c.id === 'selectCol');
    if (select) {
      select.hidden = false;
      columns.sort((a,b) => a.id === 'selectCol' ? -1 : b.id === 'selectCol' ? 1 : a.ordinal-b.ordinal);
      columns.forEach((c,i) => c.ordinal=i+1);
    }
  }
  function updateColumns(...args) {
    checkboxColumns();
    return originalUpdateColumns.apply(win.threadPane, args);
  }
  if (originalUpdateColumns) {
    win.threadPane.updateColumns = updateColumns;
    updateColumns(); tree.reset();
  }
  const originalMessagePaneVisible = layout.messagePaneVisible;
  // Gmail navigation has two explicit states: list-only and conversation-only.
  // Never restore an expanded native preview when returning to the list.
  layout.messagePaneVisible = false;
  const style = doc.createElement('style');
  style.textContent = `
    #paneLayout.gm-reading:not(.account-central) {
      grid-template:
        "folders folderPaneSplitter readingbar" 44px
        "folders folderPaneSplitter message" minmax(0, 1fr)
        / minmax(100px, var(--folderPaneSplitter-width)) min-content minmax(0, 1fr) !important;
    }
    #paneLayout.gm-reading > :is(#threadPane, #messagePaneSplitter) { display:none !important; }
    #paneLayout.gm-reading > #messagePane { min-height:0 !important; min-width:0 !important; }
    .gm-reading-toolbar {
      grid-area:readingbar; display:flex; align-items:center; gap:2px;
      box-sizing:border-box; block-size:44px; padding:4px 12px; background:var(--layout-background-0, white);
      color:var(--layout-color-0, #202124); border-radius:16px 16px 0 0;
      border-bottom:1px solid var(--layout-border-0, #e8eaed);
      font:inherit; min-width:0; overflow-x:auto; flex-shrink:0;
    }
    .gm-reading-toolbar[hidden] { display:none !important; }
    .gm-reading-back {
      display:inline-flex; align-items:center; justify-content:center;
      box-sizing:border-box; inline-size:36px; block-size:36px; min-inline-size:36px;
      margin:0; font:inherit; color:inherit; border:0; border-radius:50%;
      background:transparent; padding:8px; cursor:pointer; flex:0 0 36px;
    }
    .gm-reading-back:hover { background:var(--treeitem-background-hover, #e9eef6); }
    .gm-reading-back:focus-visible { outline:2px solid #1a73e8; outline-offset:-2px; }
    .gm-reading-back:disabled { opacity:.38; cursor:default; background:transparent; }
    .gm-reading-back svg { display:block; inline-size:20px; block-size:20px; flex:none; }
    .gm-action-separator { inline-size:1px; block-size:20px; margin-inline:8px;
      background:var(--layout-border-0, #dadce0); flex:0 0 1px; }
    .gm-selection-count { margin-inline:6px 10px; white-space:nowrap; }
    .gm-selection-count:empty { display:none; }
  `;
  doc.head.append(style);
  const toolbar = doc.createElement('div');
  toolbar.className = 'gm-reading-toolbar';
  toolbar.hidden = true;
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Conversation navigation');
  const back = doc.createElement('button');
  back.className = 'gm-reading-back';
  back.type = 'button';
  setBackIcon(false);
  selectionLabel.className = 'gm-selection-count';
  toolbar.append(back, selectionLabel);
  separator();
  const popups = [];
  function icon(path) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20');
    svg.setAttribute('height', '20'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('aria-hidden', 'true');
    const shape = doc.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', path); svg.append(shape);
    return svg;
  }
  function setBackIcon(selection) {
    const label = selection ? 'Clear selection' : 'Back to message list';
    back.textContent = '';
    back.title = label;
    back.setAttribute('aria-label', label);
    back.append(icon(selection ? 'M6 6l12 12 M18 6 6 18' : 'M20 12H4 M11 5l-7 7 7 7'));
  }
  function separator() {
    const divider = doc.createElement('span');
    divider.className = 'gm-action-separator';
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', 'vertical');
    toolbar.append(divider);
  }
  function action(label, path, handler) {
    const button = doc.createElement('button');
    button.className = 'gm-reading-back gm-reading-action';
    button.type = 'button'; button.title = label;
    button.setAttribute('aria-label', label);
    button.append(icon(path));
    button.addEventListener('click', () => handler(button));
    toolbar.append(button); return button;
  }
  function command(name, returnToList = false) {
    if (!win.commandController.isCommandEnabled(name)) return;
    win.commandController.doCommand(name);
    if (returnToList) { if (active) leave(true); else clearBulk(); }
  }
  action('Archive', 'M4 8h16v13H4z M3 3h18v5H3z M9 12h6 M12 10v7 m-3-3 3 3 3-3',
    () => command('cmd_archive', true));
  action('Mark as spam', 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 7v7 M12 17v1',
    () => command('cmd_markAsJunk', true));
  action('Delete', 'M5 6h14 M9 6V3h6v3 M7 6l1 15h8l1-15 M10 9v9 M14 9v9',
    () => command('cmd_deleteMessage', true));
  separator();
  action('Mark as unread', 'M3 6h18v14H3z M3 7l9 7 9-7 M16 3h5',
    () => command('cmd_markAsUnread', true));
  const snoozeButton = action('Snooze / Follow-Up…', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 6v6l4 3', () => {
    const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    const extension = ExtensionParent.GlobalManager.extensionMap.get('mailmindr@arndissler.net');
    if (extension?.shortcuts) extension.shortcuts.onCommand('mailmindr_set_follow_up');
  });
  separator();
  const movePopup = doc.createXULElement('menupopup', {is:'folder-menupopup'});
  movePopup.setAttribute('is', 'folder-menupopup');
  movePopup.setAttribute('mode', 'filing');
  movePopup.setAttribute('showFileHereLabel', 'true');
  movePopup.setAttribute('showRecent', 'true');
  movePopup.setAttribute('showFavorites', 'true');
  doc.documentElement.append(movePopup); popups.push(movePopup);
  movePopup.addEventListener('command', event => {
    if (event.target._folder) {
      win.commandController.doCommand('cmd_moveMessage', event.target._folder);
      if (active) leave(true); else clearBulk();
    }
  });
  action('Move to…', 'M3 6h7l2 2h9v12H3z M12 10v7 m-3-3 3 3 3-3',
    button => movePopup.openPopup(button, 'after_start', 0, 0, false, false));
  const tagPopup = doc.createXULElement('menupopup');
  doc.documentElement.append(tagPopup); popups.push(tagPopup);
  action('Labels…', 'M3 4h9l9 8-9 8H3z M7 10v4', button => {
    tagPopup.replaceChildren();
    const messages = win.gDBView?.getSelectedMsgHdrs() || [];
    const assignments = messages.map(message => new Set((message.getStringProperty('keywords') || '').split(' ')));
    for (const tag of MailServices.tags.getAllTags()) {
      const item = doc.createXULElement('menuitem');
      item.setAttribute('type', 'checkbox'); item.setAttribute('label', tag.tag);
      if (assignments.length && assignments.every(keys => keys.has(tag.key))) item.setAttribute('checked', 'true');
      if (tag.color) item.style.color = tag.color;
      item.addEventListener('command', () =>
        win.commandController._toggleMessageTag(tag.key, item.getAttribute('checked') === 'true'));
      tagPopup.append(item);
    }
    tagPopup.openPopup(button, 'after_start', 0, 0, false, false);
  });
  layout.append(toolbar);
  function syncBulk() {
    if (active || closed || !threadPane) return;
    const count = win.gDBView?.getSelectedMsgHdrs().length || 0;
    toolbar.hidden = !bulk || !count;
    if (!toolbar.hidden) {
      threadPane.prepend(toolbar);
      setBackIcon(true);
      selectionLabel.textContent = `${count} selected`;
      toolbar.setAttribute('aria-label', 'Selected message actions');
      snoozeButton.disabled = count !== 1;
    }
  }
  function clearBulk() {
    bulk = false;
    tree.selectedIndices = [];
    syncBulk();
  }
  function selectionChanged() { syncBulk(); }
  function selectionClick(event) {
    if (active) return;
    if (event.target.closest('.select-column, .selectcol-column, #selectCol') ||
        event.ctrlKey || event.metaKey || event.shiftKey) {
      bulk = true;
      win.requestAnimationFrame(() => { if (!closed) syncBulk(); });
    }
  }

  function leave(restorePosition = true) {
    if (pending !== null) { win.cancelAnimationFrame(pending); pending = null; }
    if (!active) return;
    active = false;
    layout.classList.remove('gm-reading');
    bulk = false;
    toolbar.hidden = true;
    layout.messagePaneVisible = false;
    if (restorePosition && win.gFolder?.URI === previous.folderURI) {
      tree.scrollTop = previous.scrollTop;
      tree.scrollLeft = previous.scrollLeft;
      tree.table?.body?.focus({ preventScroll:true });
      win.requestAnimationFrame(() => {
        if (!active && !closed) tree.scrollTop = previous.scrollTop;
      });
    }
  }
  function open(row) {
    if (closed || active || !win.gDBView || row.index < 0) return;
    if ((row.dataset.properties || '').split(' ').includes('dummy')) return;
    previous = {
      message:win.gDBView.hdrForFirstSelectedMessage ? {
        key:win.gDBView.hdrForFirstSelectedMessage.messageKey,
        folderURI:win.gDBView.hdrForFirstSelectedMessage.folder.URI
      } : null,
      folderURI:win.gFolder?.URI, scrollTop:tree.scrollTop, scrollLeft:tree.scrollLeft };
    active = true;
    bulk = false;
    layout.append(toolbar);
    setBackIcon(false);
    selectionLabel.textContent = '';
    snoozeButton.disabled = false;
    toolbar.setAttribute('aria-label', 'Conversation navigation');
    toolbar.hidden = false;
    layout.classList.add('gm-reading');
    // Expanding triggers Thunderbird's request-message-selection event, which
    // Conversations already handles. If already expanded, explicitly refresh.
    if (!layout.messagePaneVisible) layout.messagePaneVisible = true;
    else win.threadPane._onSelect(new win.Event('select'));
    back.focus({preventScroll:true});
  }
  function click(event) {
    if (!isReadingClick(event) || active) return;
    const row = event.target.closest('tr.table-layout');
    if (!row || !tree.contains(row)) return;
    if (pending !== null) win.cancelAnimationFrame(pending);
    // Let native selection complete before invoking the existing reader.
    pending = win.requestAnimationFrame(() => { pending = null; open(row); });
  }
  function doubleClick(event) {
    if (!isReadingClick(event) || !event.target.closest('tr.table-layout')) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  // Conversations archives via the messages API, bypassing our toolbar.
  // Observe successful moves so every archive entry point returns to the list.
  const moveListener = {
    msgsMoveCopyCompleted(move, messages) {
      if (active && readingMessageWasMoved(previous, move, messages)) {
        leave(true);
      }
    }
  };
  MailServices.mfn.addListener(moveListener, Ci.nsIMsgFolderNotificationService.msgsMoveCopyCompleted);
  function folderChange() { leave(false); bulk = false; toolbar.hidden = true; }
  function backClick() { if (active) leave(true); else clearBulk(); }
  tree.addEventListener('click', selectionClick, true);
  tree.addEventListener('select', selectionChanged);
  tree.addEventListener('click', click);
  tree.addEventListener('dblclick', doubleClick, true);
  folderTree.addEventListener('select', folderChange, true);
  back.addEventListener('click', backClick);
  function close() {
    leave(false);
    closed = true;
    layout.messagePaneVisible = originalMessagePaneVisible;
    MailServices.mfn.removeListener(moveListener);
    tree.removeEventListener('click', selectionClick, true);
    tree.removeEventListener('select', selectionChanged);
    tree.removeEventListener('click', click);
    for (const [column, state] of originalColumns) Object.assign(column, state);
    if (originalUpdateColumns && win.threadPane.updateColumns === updateColumns) {
      win.threadPane.updateColumns = originalUpdateColumns;
      originalUpdateColumns.call(win.threadPane); tree.reset();
    }
    tree.removeEventListener('dblclick', doubleClick, true);
    folderTree.removeEventListener('select', folderChange, true);
    back.removeEventListener('click', backClick);
    for (const popup of popups) popup.remove();
    toolbar.remove(); style.remove();
    win.removeEventListener('unload', close);
  }
  win.addEventListener('unload', close, {once:true});
  return {close};
}
