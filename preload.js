'use strict';
const {contextBridge}=require('electron');contextBridge.exposeInMainWorld('aetherosDesktop',Object.freeze({isElectron:true}));
