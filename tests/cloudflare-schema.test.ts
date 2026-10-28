import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";

test("Worker Cloudflare: módulos JavaScript válidos",()=>{
  for(const path of ["cloudflare/src/core.mjs","cloudflare/src/orders.mjs","cloudflare/src/worker.mjs"]){
    const checked=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
    assert.equal(checked.status,0,path+": "+checked.stderr);
  }
});
test("D1: migración SQLite crea tablas e impide dobles cobros",()=>{
  const result=spawnSync("python3",["tests/fixtures/cloudflare_schema.py"],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
