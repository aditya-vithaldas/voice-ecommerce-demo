import type {Turn} from './measurements';
/** Server is authoritative; IndexedDB is an offline retry queue, not the archive. */
export class MeasurementStore {
 token=''; status='Connecting storage…'; pending=new Map<string,Turn>(); saving=false; timer:ReturnType<typeof setTimeout>|undefined;
 onStatus:()=>void=()=>{};
 async init(){this.token=localStorage.getItem('surface-metrics-access')||crypto.randomUUID()+crypto.randomUUID();localStorage.setItem('surface-metrics-access',this.token);try{const db=await this.db();const rows=await new Promise<Turn[]>((resolve,reject)=>{const q=db.transaction('outbox').objectStore('outbox').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();rows.forEach(t=>this.pending.set(t.turnId,t));}catch{this.status='Offline queue unavailable';this.onStatus();}void this.flush();}
 db(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('surface-measurements',1);r.onupgradeneeded=()=>r.result.createObjectStore('outbox',{keyPath:'turnId'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async queue(t:Turn){this.pending.set(t.turnId,t);try{const db=await this.db();const tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').put(t);tx.oncomplete=()=>db.close();}catch{}clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),350);}
 async flush(){if(this.saving||!this.token)return;this.saving=true;try{for(const [id,t]of this.pending){const r=await fetch('/api/metrics',{method:'POST',headers:{'Content-Type':'application/json','X-Metrics-Access':this.token},body:JSON.stringify(t)});if(!r.ok)throw Error('Measurements waiting to sync');if(this.pending.get(id)?.revision===t.revision){this.pending.delete(id);try{const db=await this.db();const tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').delete(id);tx.oncomplete=()=>db.close();}catch{}}}this.status='Saved';}catch{this.status='Offline · retrying saved queue';}finally{this.saving=false;this.onStatus();if(this.pending.size)this.timer=setTimeout(()=>void this.flush(),5000);}}
 async history(){const r=await fetch('/api/metrics',{headers:{'X-Metrics-Access':this.token}});if(!r.ok)throw Error('History unavailable');return (await r.json() as {turns:Turn[]}).turns;}
 dispose(){clearTimeout(this.timer);}
}
