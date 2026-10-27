import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";

test("Backup AES-GCM incluye comprobantes privados y restaura sin divulgar datos", () => {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"karen-backup-"));
  try {
    const data=path.join(tmp,"data"), backup=path.join(tmp,"backup"), restored=path.join(tmp,"restored");
    fs.mkdirSync(path.join(data,"receipts"),{recursive:true});
    const name="11111111-2222-3333-4444-555555555555.png";
    fs.writeFileSync(path.join(data,"karen-store.json"),JSON.stringify({orders:[{id:"secreto-de-prueba"}],menu:[],tables:[]}));
    fs.writeFileSync(path.join(data,"receipts",name),"fake-png-attachment");
    const env={...process.env,DATA_DIR:data,BACKUP_DIR:backup,BACKUP_ENCRYPTION_KEY:randomBytes(32).toString("hex")};
    const run=spawnSync(process.execPath,["scripts/backup-store.mjs"],{env,encoding:"utf8"});
    assert.equal(run.status,0,run.stderr);
    const file=path.join(backup,fs.readdirSync(backup)[0]);
    const bytes=fs.readFileSync(file);
    assert.equal(bytes.toString("ascii",0,4),"PKB3");
    assert.equal(bytes.includes(Buffer.from("secreto-de-prueba")),false);
    const restore=spawnSync(process.execPath,["scripts/restore-store.mjs",file],{env:{...env,DATA_DIR:restored,ALLOW_RESTORE:"YES"},encoding:"utf8"});
    assert.equal(restore.status,0,restore.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(restored,"karen-store.json"),"utf8")).orders[0].id,"secreto-de-prueba");
    assert.equal(fs.readFileSync(path.join(restored,"receipts",name),"utf8"),"fake-png-attachment");
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
