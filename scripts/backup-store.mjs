import {createCipheriv,randomBytes} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dataDir=path.resolve(process.env.DATA_DIR || ".data");
const backupDir=process.env.BACKUP_DIR && path.resolve(process.env.BACKUP_DIR);
const hex=process.env.BACKUP_ENCRYPTION_KEY || "";
if (!backupDir || !/^[a-f0-9]{64}$/i.test(hex) || backupDir===dataDir || backupDir.startsWith(dataDir+path.sep))
  throw new Error("Configura BACKUP_DIR externo a DATA_DIR y BACKUP_ENCRYPTION_KEY de 32 bytes hexadecimales.");
const store=JSON.parse(fs.readFileSync(path.join(dataDir,"karen-store.json"),"utf8"));
const attachments={};
const dir=path.join(dataDir,"receipts");
if(fs.existsSync(dir))for(const name of fs.readdirSync(dir)) {
  if(!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name))continue;
  attachments[name]=fs.readFileSync(path.join(dir,name)).toString("base64");
}
const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(hex,"hex"),iv);
const encrypted=Buffer.concat([cipher.update(Buffer.from(JSON.stringify({store,attachments}))),cipher.final()]);
const payload=Buffer.concat([Buffer.from("PKB3"),iv,cipher.getAuthTag(),encrypted]);
fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
const dest=path.join(backupDir,`pollos-karen-${new Date().toISOString().replace(/[:.]/g,"-")}.pkb`);
fs.writeFileSync(dest,payload,{mode:0o600,flag:"wx"});
console.log("Respaldo cifrado generado: "+dest);
