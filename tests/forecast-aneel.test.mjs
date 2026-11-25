import test from "node:test";
import assert from "node:assert/strict";
import { forecastEnergyBill, projectMeterCycle, resolveCycleFlags, ANEEL_MONTHLY_FLAGS } from "../packages/consumption-domain/browser/billing-engine.js";
const day = (y,m,d) => new Date(y,m-1,d,0,0,0);
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-8, String(actual));
test("projeção usa os mesmos extremos da leitura em vez de dias do cadastro",()=>{
  const readings=[{date:"2026-11-16T12:10:00Z",value:29412},{date:"2026-11-18T22:04:00Z",value:29427},{date:"2026-11-24T12:22:00Z",value:29475}];
  const result=projectMeterCycle(readings,{start:day(2026,11,17),end:day(2026,12,16)},63);
  close(result.measuredDays,8+12/1440);
  close(result.average,63/(8+12/1440));
  assert.equal(result.remainingDays,22);
  close(result.projectedConsumption,63+22*63/(8+12/1440));
});
test("uma leitura sem base temporal não inventa previsão",()=>{
 const result=projectMeterCycle([{date:"2026-11-24T12:22:00Z",value:29475}],{start:day(2026,11,17),end:day(2026,12,16)},0);
 assert.equal(result.measuredDays,0); assert.equal(result.projectedConsumption,0);
});
test("setembro/outubro: 14 dias amarelos e 16 verdes, com tarifa proporcional",()=>{
 const flags=resolveCycleFlags("2026-09-17","2026-10-16","sin");
 assert.equal(flags.complete,true); assert.equal(flags.segments[0].days,14); assert.equal(flags.segments[1].days,16);
 close(flags.rate,0.01885*14/30);
 const result=forecastEnergyBill(300,{}, {fallbackRate:0.87571,flagPeriod:{start:"2026-09-17",end:"2026-10-16",systemType:"sin"},lightingFee:21.33});
 assert.equal(result.flagGross,2.64);
});
test("não extrapola competência desconhecida; dezembro depende de publicação oficial",()=>{
 const flags=resolveCycleFlags("2026-11-17","2026-12-16","sin");
 const december=ANEEL_MONTHLY_FLAGS["2026-12"];
 assert.equal(flags.complete,Boolean(december));
 assert.deepEqual(flags.pendingMonths,december ? [] : ["2026-12"]);
 close(flags.rate,(december?.[1] ?? 0)*16/30);
 const unknown=resolveCycleFlags("2099-12-01","2099-12-31","sin");
 assert.equal(unknown.complete,false); assert.deepEqual(unknown.pendingMonths,["2099-12"]);
});
test("sistemas isolados e não identificados não recebem adicional presumido",()=>{
 assert.equal(resolveCycleFlags("2026-09-01","2026-09-30","isolated").complete,true);
 assert.equal(resolveCycleFlags("2026-09-01","2026-09-30","isolated").rate,0);
 const unknown=resolveCycleFlags("2026-09-01","2026-09-30","not_identified");
 assert.equal(unknown.complete,false); assert.equal(unknown.rate,0);
});
test("ciclo encerrado em novembro: verde independentemente da configuração amarela legada",()=>{
 const result=forecastEnergyBill(269,{}, {fallbackRate:0.87571,flagRate:0.01885,flagPeriod:{start:"2026-10-17",end:"2026-11-16",systemType:"sin"},lightingFee:21.33});
 assert.equal(result.flagGross,0); assert.equal(result.totalCost,256.90);
});
