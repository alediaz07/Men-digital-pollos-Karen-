import {createDecipheriv} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const [archive]=process.argv.slice(2), hex=process.env.BACKUP_ENCRYPTION_KEY || "";
if(!archive || process.env.ALLOW_RESTORE!=="YES" || !/^[a-f0-9]{64}$/i.test(hex))
  throw new Error("Detén la app y define ALLOW_RESTORE=YES, BACKUP_ENCRYPTION_KEY y la ruta del archivo .pkb");
const raw=fs.readFileSync(path.resolve(archive));
if(raw.toString("ascii",0,4)!=="PKB3")throw new Error("Formato de respaldo incompatible.");
const decipher=createDecipheriv("aes-256-gcm",Buffer.from(hex,"hex"),raw.subarray(4,16));
decipher.setAuthTag(raw.subarray(16,32));
const {store,attachments}=JSON.parse(Buffer.concat([decipher.update(raw.subarray(32)),decipher.final()]).toString("utf8"));
if(!Array.isArray(store?.orders)||!Array.isArray(store?.menu)||!Array.isArray(store?.tables) || !attachments || typeof attachments!=="object")
  throw new Error("El respaldo tiene datos inválidos.");
const dataDir=path.resolve(process.env.DATA_DIR||".data");
const dir=path.join(dataDir,"receipts");
const receipts=Object.entries(attachments);
for(const [name,b64] of receipts)
  if(!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)||typeof b64!=="string"||!/^[A-Za-z0-9+/=]*$/.test(b64))throw new Error("Adjunto inválido.");
fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const target=path.join(dataDir,"karen-store.json");
if(fs.existsSync(target))fs.copyFileSync(target,path.join(dataDir,`pre-restore-${Date.now()}.json`));
for(const [name,b64] of receipts)fs.writeFileSync(path.join(dir,name),Buffer.from(b64,"base64"),{mode:0o600});
const tmp=target+".restoring";
fs.writeFileSync(tmp,JSON.stringify(store,null,2),{mode:0o600});
fs.renameSync(tmp,target);
console.log("Restauración completada. Verifica los datos antes de reabrir el sistema.");
