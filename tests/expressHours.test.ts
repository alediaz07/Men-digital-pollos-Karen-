import test from "node:test";
import assert from "node:assert/strict";
import {expressAvailability} from "../src/utils/expressHours.ts";
const schedule={expressDays:[1,2,3,4,5],expressOpen:"07:00",expressClose:"16:00"};
test("Exprés: lunes 7:00 abre, 6:59 y 16:00 no reciben pedidos",()=>{
  assert.equal(expressAvailability(schedule,new Date("2026-10-26T12:59:00Z")).open,false);
  assert.equal(expressAvailability(schedule,new Date("2026-10-26T13:00:00Z")).open,true);
  assert.equal(expressAvailability(schedule,new Date("2026-10-26T21:59:00Z")).open,true);
  assert.equal(expressAvailability(schedule,new Date("2026-10-26T22:00:00Z")).open,false);
});
test("Exprés: fin de semana cerrado y cierre temporal",()=>{
  assert.equal(expressAvailability(schedule,new Date("2026-10-31T16:00:00Z")).open,false);
  assert.equal(expressAvailability(schedule,new Date("2026-11-01T16:00:00Z")).open,false);
  assert.equal(expressAvailability({...schedule,expressTemporarilyClosed:true},new Date("2026-10-27T16:00:00Z")).open,false);
});
