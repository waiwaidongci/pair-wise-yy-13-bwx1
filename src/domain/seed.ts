import { appendWeighing, changeGsm, createBatch, recordGrade } from "./engine";
import type { DomainEvent } from "./types";

// 固定时间戳构造演示数据：T 为 2026-09-18 09:00（本地时区显示）
const T = new Date(2026, 8, 18, 9, 0, 0).getTime();
const min = 60_000;

/**
 * 演示批次覆盖：
 * B1 合格并判级通过；B2 环境超限待复测；B3 称量差 0.6% 待复测；
 * B4 先失败后补测合格（首个合格生效）待判级；
 * B5 判级后改克重 → 旧判级作废回到待复测，旧结果可查；
 * B6 尚未称量（回潮中）；
 * B7 合格锁定后再补测失败 → 门控仍有效。
 */
export function buildSeedEvents(): DomainEvent[] {
  let events: DomainEvent[] = [];
  const add = (e: DomainEvent) => events.push(e);
  const batchIdOf = (no: string) => events.find((e) => e.type === "BATCH_CREATED" && e.no === no)!.batchId;

  // B1 全棉府绸 120g：环境合格、相邻差 0.20% → 判级通过
  add(createBatch(events, { no: "TS-2401", fabric: "全棉府绸", gsm: 120, at: T - 90 * min }));
  let id = batchIdOf("TS-2401");
  add(appendWeighing(events, id, { temp: 20.4, humidity: 64, grams: 10.000, at: T - 60 * min }));
  add(appendWeighing(events, id, { temp: 20.6, humidity: 66, grams: 10.020, at: T - 30 * min }));
  add(
    recordGrade(events, id, {
      std: { l: 50.0, a: 2.5, b: -30.0 },
      smp: { l: 49.85, a: 2.62, b: -29.82 },
      limit: 1.0,
      at: T - 10 * min,
    }),
  );

  // B2 涤纶针织 180g：第二次称量温度 23.5℃ 超限 → 待复测
  add(createBatch(events, { no: "TS-2402", fabric: "涤纶针织", gsm: 180, at: T - 80 * min }));
  id = batchIdOf("TS-2402");
  add(appendWeighing(events, id, { temp: 20.1, humidity: 65, grams: 12.000, at: T - 50 * min }));
  add(appendWeighing(events, id, { temp: 23.5, humidity: 65, grams: 12.010, at: T - 20 * min }));

  // B3 锦纶塔丝隆 95g：相邻差 0.60% > 0.5% → 待复测
  add(createBatch(events, { no: "TS-2403", fabric: "锦纶塔丝隆", gsm: 95, at: T - 70 * min }));
  id = batchIdOf("TS-2403");
  add(appendWeighing(events, id, { temp: 20.0, humidity: 65, grams: 8.000, at: T - 40 * min }));
  add(appendWeighing(events, id, { temp: 20.2, humidity: 64, grams: 8.048, at: T - 10 * min }));

  // B4 混纺斜纹 220g：首次环境失败，补测合格 → 待判级
  add(createBatch(events, { no: "TS-2404", fabric: "涤棉混纺斜纹", gsm: 220, at: T - 120 * min }));
  id = batchIdOf("TS-2404");
  add(appendWeighing(events, id, { temp: 20.0, humidity: 65, grams: 15.000, at: T - 90 * min }));
  add(appendWeighing(events, id, { temp: 24.2, humidity: 71, grams: 15.020, at: T - 60 * min }));
  add(appendWeighing(events, id, { temp: 20.1, humidity: 64.8, grams: 15.038, at: T - 45 * min }));
  add(appendWeighing(events, id, { temp: 19.9, humidity: 65.2, grams: 15.045, at: T - 30 * min }));
  // 15.038 → 15.045：0.05%，环境合格（首个合格结果生效），更早的失败记录保留可查

  // B5 棉氨弹力 200g：判级不合格（ΔE 2.04），随后改克重 → 旧判级作废，新轮仅 1 次称量
  add(createBatch(events, { no: "TS-2405", fabric: "棉氨弹力布", gsm: 200, at: T - 200 * min }));
  id = batchIdOf("TS-2405");
  add(appendWeighing(events, id, { temp: 19.8, humidity: 63, grams: 11.000, at: T - 170 * min }));
  add(appendWeighing(events, id, { temp: 20.3, humidity: 66, grams: 11.011, at: T - 140 * min }));
  add(
    recordGrade(events, id, {
      std: { l: 50, a: 2.6772, b: -79.7751 },
      smp: { l: 50, a: 0, b: -82.7485 },
      limit: 1.0,
      at: T - 120 * min,
    }),
  );
  add(changeGsm(events, id, 205));
  add(appendWeighing(events, id, { temp: 20.0, humidity: 65, grams: 11.050, at: T - 5 * min }));

  // B6 麻粘混纺 140g：尚未称量 → 回潮中
  add(createBatch(events, { no: "TS-2406", fabric: "亚麻粘胶混纺", gsm: 140, at: T - 30 * min }));

  // B7 涤纶塔丝隆 160g：合格锁定后又补测一次（环境失败）→ 门控仍有效
  add(createBatch(events, { no: "TS-2407", fabric: "涤纶塔丝隆", gsm: 160, at: T - 110 * min }));
  id = batchIdOf("TS-2407");
  add(appendWeighing(events, id, { temp: 20.0, humidity: 65, grams: 9.000, at: T - 80 * min }));
  add(appendWeighing(events, id, { temp: 20.5, humidity: 64, grams: 9.027, at: T - 50 * min })); // 0.30% 合格
  add(appendWeighing(events, id, { temp: 23.0, humidity: 72, grams: 9.018, at: T - 20 * min })); // 后补，环境失败

  return events;
}
