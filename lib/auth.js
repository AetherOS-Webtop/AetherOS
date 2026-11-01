'use strict';
const crypto=require('node:crypto');
class AuthManager {
  constructor(userStore) { this.users=userStore; this.attempts=new Map(); }
  allowed(ip) {
    const now=Date.now(), entry=this.attempts.get(ip);
    if(!entry || now-entry.start>15*60*1000) { this.attempts.set(ip,{start:now,count:0}); return true; }
    return entry.count<8;
  }
  recordFailure(ip) { const entry=this.attempts.get(ip)||{start:Date.now(),count:0}; entry.count++; this.attempts.set(ip,entry); }
  clearFailures(ip) { this.attempts.delete(ip); }
  async login(req,username,password,options={}) {
    const ip=req.ip||req.socket.remoteAddress||'unknown';
    if(!this.allowed(ip)) { const e=new Error('Too many sign-in attempts. Try again in 15 minutes.');e.status=429;throw e; }
    const user=this.users.find(username);
    if(!user || !(await this.users.verify(user,password))) { this.recordFailure(ip); return false; }
    if(typeof options.beforeSessionCreate==='function') await options.beforeSessionCreate(user);
    await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
    req.session.user={id:user.id,username:user.username,role:user.role};
    this.clearFailures(ip); return true;
  }
  requireAuth() { return (req,res,next)=>{ const sessionUser=req.session?.user; if(!sessionUser)return res.status(401).json({error:'Sign-in required.'}); const current=this.users.find(sessionUser.username); if(!current||current.id!==sessionUser.id){req.session.destroy(()=>{});return res.status(401).json({error:'This account is no longer available. Sign in again.'});} sessionUser.role=current.role; next(); }; }
  requireAdmin() { return (req,res,next)=>this.requireAuth()(req,res,()=>req.session.user.role==='admin'?next():res.status(403).json({error:'Administrator access required.'})); }
}
module.exports={AuthManager};
