const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lifeOSDesktop', Object.freeze({
  isDesktop: true,
  openOAuth: (url) => ipcRenderer.invoke('lifeos:open-google-oauth', url),
}));
