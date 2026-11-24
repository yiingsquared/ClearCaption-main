const { contextBridge, ipcRenderer } = require('electron');
async function call(channel, data) {
  const response = await ipcRenderer.invoke(channel, data);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
contextBridge.exposeInMainWorld('clearcaption', {
  api: data => call('cc:api', data),
  getPreferences: () => call('cc:preferences'),
  setService: url => call('cc:service', url),
  setKey: key => call('cc:key', key),
  overlay: data => call('cc:overlay', data),
  setBusy: value => call('cc:busy', { busy: !!value, locale: document.documentElement.lang.split('-')[0] }),
  onShortcut: callback => { ipcRenderer.on('cc:shortcut', (_event, action) => callback(action)); },
});
