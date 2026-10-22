const checkbox = document.getElementById('hide-today-pane');
const status = document.getElementById('status');
checkbox.disabled = true;
browser.storage.local.get({hideTodayPane:false}).then(settings => {
  checkbox.checked = settings.hideTodayPane === true;
  checkbox.disabled = false;
}).catch(() => { status.textContent = 'Unable to load settings.'; });
checkbox.addEventListener('change',async () => {
  checkbox.disabled = true;
  try {
    await browser.storage.local.set({hideTodayPane:checkbox.checked});
    status.textContent = 'Saved.';
  } catch (_) {
    checkbox.checked = !checkbox.checked;
    status.textContent = 'Unable to save. Please try again.';
  } finally { checkbox.disabled = false; }
});
