'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const MAX_TEXT=2*1024*1024;
const MAX_UPLOAD=20*1024*1024;
class VirtualFileSystem {
  constructor(root){this.root=path.resolve(root);}
  userRoot(username){if(typeof username!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(username))throw new Error('Invalid user.');return path.join(this.root,username.toLowerCase());}
  resolve(username,relative=''){
    const base=this.userRoot(username),raw=String(relative).replace(/\\/g,'/');
    if(raw.includes('\0')||path.posix.isAbsolute(raw))throw new Error('Invalid path.');
    const target=path.resolve(base,raw);
    if(target!==base&&!target.startsWith(base+path.sep))throw new Error('Path escapes the user home.');
    return target;
  }
  async check(username,target){
    const base=this.userRoot(username);await fs.mkdir(base,{recursive:true,mode:0o700});
    const baseStat=await fs.lstat(base);if(baseStat.isSymbolicLink()||!baseStat.isDirectory())throw new Error('Invalid user home.');
    let current=base;for(const part of path.relative(base,target).split(path.sep).filter(Boolean)){current=path.join(current,part);try{const st=await fs.lstat(current);if(st.isSymbolicLink())throw new Error('Symbolic links are not permitted.');}catch(e){if(e.code==='ENOENT')break;throw e;}}
  }
  async initialize(users){await fs.mkdir(this.root,{recursive:true,mode:0o700});for(const u of users)await fs.mkdir(this.userRoot(u.username),{recursive:true,mode:0o700});}
  async list(username,relative=''){
    const target=this.resolve(username,relative);await this.check(username,target);const st=await fs.lstat(target);if(!st.isDirectory())throw new Error('Not a directory.');
    const entries=await fs.readdir(target,{withFileTypes:true}),result=[];
    for(const ent of entries){const full=path.join(target,ent.name),info=await fs.lstat(full);if(info.isSymbolicLink())continue;result.push({name:ent.name,type:info.isDirectory()?'directory':'file',size:info.size,modified:info.mtime.toISOString()});}
    return result.sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==='directory'?-1:1);
  }
  async stat(username,relative){const target=this.resolve(username,relative);await this.check(username,target);const st=await fs.lstat(target);if(st.isSymbolicLink()||!st.isFile())throw new Error('Not a regular file.');return {size:st.size,modified:st.mtime.toISOString()};}
  async read(username,relative){const target=this.resolve(username,relative);await this.check(username,target);const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink())throw new Error('Not a regular file.');if(st.size>MAX_TEXT)throw new Error('Text file exceeds 2 MiB.');return fs.readFile(target,'utf8');}
  async readBuffer(username,relative){const target=this.resolve(username,relative);await this.check(username,target);const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink())throw new Error('Not a regular file.');if(st.size>MAX_UPLOAD)throw new Error('File exceeds 20 MiB.');return fs.readFile(target);}
  async write(username,relative,content){if(!relative||typeof content!=='string'||Buffer.byteLength(content)>MAX_TEXT)throw new Error('A file path and content up to 2 MiB are required.');return this.writeBuffer(username,relative,Buffer.from(content,'utf8'));}
  async writeBuffer(username,relative,buffer){if(!relative||!Buffer.isBuffer(buffer)||buffer.length>MAX_UPLOAD)throw new Error('A file path and file up to 20 MiB are required.');const target=this.resolve(username,relative);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});await this.check(username,target);try{const st=await fs.lstat(target);if(st.isSymbolicLink()||!st.isFile())throw new Error('Target is not a regular file.');}catch(e){if(e.code!=='ENOENT')throw e;}const tmp=target+'.tmp-'+process.pid+'-'+Date.now()+'-'+Math.random().toString(16).slice(2);await fs.writeFile(tmp,buffer,{mode:0o600,flag:'wx'});await fs.rename(tmp,target);}
  async createFile(username,relative,content=''){if(!relative||typeof content!=='string'||Buffer.byteLength(content)>MAX_TEXT)throw new Error('A file path and text content up to 2 MiB are required.');const target=this.resolve(username,relative);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});await this.check(username,target);await fs.writeFile(target,content,{mode:0o600,flag:'wx'});}
  async mkdir(username,relative){if(!relative)throw new Error('Folder path required.');const target=this.resolve(username,relative);await this.check(username,target);await fs.mkdir(target,{recursive:true,mode:0o700});await this.check(username,target);}
  async rename(username,relative,newName){if(!relative||typeof newName!=='string'||!newName.trim()||/[\\/\0]/.test(newName)||newName==='.'||newName==='..')throw new Error('Invalid rename.');const source=this.resolve(username,relative),destination=this.resolve(username,path.posix.join(path.posix.dirname(relative.replace(/\\/g,'/')),newName));await this.check(username,source);await this.check(username,destination);const st=await fs.lstat(source);if(st.isSymbolicLink())throw new Error('Symbolic links are not permitted.');try{await fs.lstat(destination);throw new Error('An item with that name already exists.');}catch(e){if(e.code!=='ENOENT')throw e;}await fs.rename(source,destination);}
  async remove(username,relative){if(!relative||relative==='.'||relative==='/')throw new Error('Cannot remove the home directory.');const target=this.resolve(username,relative);await this.check(username,target);const st=await fs.lstat(target);if(st.isSymbolicLink())throw new Error('Cannot remove a symbolic link.');await fs.rm(target,{recursive:true,force:false});}
  async removeUserHome(username){const home=this.userRoot(username);await fs.rm(home,{recursive:true,force:true});}
}
module.exports={VirtualFileSystem,MAX_TEXT,MAX_UPLOAD};
