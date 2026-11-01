'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const USERNAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;
const ROLES = new Set(['admin','user']);
class UserStore {
  constructor(file) { this.file=path.resolve(file); this.users=new Map(); this.writeQueue=Promise.resolve(); }
  async initialize() {
    await fs.mkdir(path.dirname(this.file),{recursive:true});
    try {
      const data=JSON.parse(await fs.readFile(this.file,'utf8'));
      if (!Array.isArray(data.users)) throw new Error('User database has an invalid format.');
      for (const user of data.users) {
        if (!user || typeof user.id!=='string' || !USERNAME.test(user.username) || !ROLES.has(user.role) || typeof user.salt!=='string' || typeof user.passwordHash!=='string' || (user.removeRamCap !== undefined && typeof user.removeRamCap !== 'boolean')) throw new Error('User database contains an invalid record.');
        this.users.set(user.username.toLowerCase(),user);
      }
    } catch (e) {
      if (e.code!=='ENOENT') throw e;
      const bootstrap=process.env.AETHEROS_ADMIN_PASSWORD;
      if (!bootstrap || bootstrap.length<14) throw new Error('First run: set AETHEROS_ADMIN_PASSWORD to a password of at least 14 characters, then restart.');
      await this.create('admin',bootstrap,'admin');
    }
    if (![...this.users.values()].some(u=>u.role==='admin')) throw new Error('User database has no administrator; refusing to start.');
  }
  async hash(password,salt=crypto.randomBytes(16).toString('hex')) {
    if (typeof password!=='string' || password.length<12 || password.length>256) throw new Error('Password must contain 12–256 characters.');
    const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    return {salt,passwordHash:derived.toString('hex')};
  }
  async verify(user,password) {
    if (!user || typeof password!=='string' || password.length>256) return false;
    const derived=await scrypt(password,user.salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    const expected=Buffer.from(user.passwordHash,'hex');
    return expected.length===derived.length && crypto.timingSafeEqual(derived,expected);
  }
  async persist() {
    const snapshot=JSON.stringify({version:1,users:[...this.users.values()]},null,2);
    this.writeQueue=this.writeQueue.then(async()=>{const tmp=this.file+'.tmp';await fs.writeFile(tmp,snapshot,{mode:0o600});await fs.rename(tmp,this.file);});
    return this.writeQueue;
  }
  async create(username,password,role='user') {
    if (typeof username!=='string' || !USERNAME.test(username) || !ROLES.has(role)) throw new Error('Username must be 3–32 letters, numbers, dots, underscores or hyphens; role must be admin or user.');
    const key=username.toLowerCase(); if(this.users.has(key)) throw new Error('That username already exists.');
    const credentials=await this.hash(password);
    const user={id:crypto.randomUUID(),username,role,removeRamCap:false,...credentials,createdAt:new Date().toISOString()};
    this.users.set(key,user); await this.persist(); return this.publicUser(user);
  }
  publicUser(user) { return {id:user.id,username:user.username,role:user.role,removeRamCap:user.removeRamCap===true,createdAt:user.createdAt}; }
  find(username) { return this.users.get(String(username||'').toLowerCase()) || null; }
  list() { return [...this.users.values()].map(u=>this.publicUser(u)).sort((a,b)=>a.username.localeCompare(b.username)); }
  async changePassword(username,currentPassword,newPassword) {
    const user=this.find(username); if(!user || !(await this.verify(user,currentPassword))) return false;
    const credentials=await this.hash(newPassword); Object.assign(user,credentials); await this.persist(); return true;
  }
  async remove(username) {
    const user=this.find(username); if(!user) throw new Error('User not found.');
    if(user.role==='admin' && [...this.users.values()].filter(u=>u.role==='admin').length<=1) throw new Error('Cannot delete the last administrator.');
    this.users.delete(username.toLowerCase()); await this.persist(); return this.publicUser(user);
  }
  async setRemoveRamCap(username,enabled) {
    const user=this.find(username); if(!user) throw new Error('User not found.');
    if(typeof enabled!=='boolean') throw new Error('removeRamCap must be a boolean.');
    user.removeRamCap=enabled; await this.persist(); return this.publicUser(user);
  }
  async setRole(username,role) {
    const user=this.find(username); if(!user) throw new Error('User not found.');
    if(!ROLES.has(role)) throw new Error('Invalid role.');
    if(user.role==='admin' && role!=='admin' && [...this.users.values()].filter(u=>u.role==='admin').length<=1) throw new Error('Cannot demote the last administrator.');
    user.role=role; await this.persist(); return this.publicUser(user);
  }
}
module.exports={UserStore,USERNAME};
