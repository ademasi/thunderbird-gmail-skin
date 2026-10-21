async function startThunderG() {
  // Optional settings must never prevent the companion from starting.
  let hideTodayPane = false;
  try {
    const settings = await browser.storage.local.get({hideTodayPane:false});
    hideTodayPane = settings.hideTodayPane === true;
  } catch (error) { console.warn('Thunder-G: using default settings.',error); }
  await browser.inlineLabels.setHideTodayPane(hideTodayPane);
  await browser.inlineLabels.start();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.hideTodayPane) {
      browser.inlineLabels.setHideTodayPane(changes.hideTodayPane.newValue === true).catch(console.error);
    }
  });
}
startThunderG().catch(console.error);
