// Paste into Thunderbird's Error Console with the same folder open.
(async () => {
  const snapshot = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "gmail-skin-columns.json"));
  const pane = Services.wm.getMostRecentWindow("mail:3pane")
    .document.getElementById("tabmail").currentAbout3Pane;
  if (pane?.gFolder?.URI !== snapshot.folderURI) throw new Error("Open the original inbox before restoring its columns.");
  pane.threadPane.applyPersistedColumnsState(snapshot.columns);
  pane.threadPane.updateColumns();
  pane.threadTree.reset();
  pane.threadPane.persistColumnStates();
  if ("widths" in snapshot) {
    const { XULStoreUtils } = ChromeUtils.importESModule("resource:///modules/XULStoreUtils.sys.mjs");
    XULStoreUtils.setValue("messenger", "columns", "widths", snapshot.widths);
    // Remove applied inline overrides before restoring the saved widths.
    for (const id of ["senderCol", "subjectCol"]) {
      pane.document.getElementById(id)?.style.removeProperty(`--${id}Splitter-width`);
    }
    pane.threadPane.treeTable.restoreColumnsWidths("messenger");
  }
  console.log("Previous column layout restored; labels and messages unchanged.");
})().catch(console.error);
