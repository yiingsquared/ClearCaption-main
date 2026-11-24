const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('captionOverlay', { onCaption: callback => {
  ipcRenderer.on('cc:caption', (_event, value) => callback(value));
} });
