import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const html = fs.readFileSync("dist/index.html", "utf8")
const appRef = html.match(/\/assets\/(app\.[^"]+\.mjs)/)?.[1]
const cssRef = html.match(/\/assets\/(atlas\.[^"]+\.css)/)?.[1]
assert.ok(appRef && cssRef, "index must reference hashed app/css assets")

const source = fs.readFileSync(`dist/assets/${appRef}`, "utf8")
const css = fs.readFileSync(`dist/assets/${cssRef}`, "utf8")

for (const marker of [
  "function parseNodesFrame",
  "function ensureDetailRoute",
  "function patchKpis",
  "function regionSignature",
  "function syncNotice",
  "if(document.hidden)return",
  "requestIdleCallback",
  "state.wsBlocked",
  "function activeNodeView",
  "function refreshOverviewPing",
  "function summarizeOverviewPing",
]) assert.ok(source.includes(marker), `missing runtime contract: ${marker}`)

assert.ok(!source.includes("kpiEl.outerHTML=kpis(nodes)"), "live frames must not replace the whole KPI grid")
assert.ok(source.includes("function themeActionLabel"), "theme switch must expose a state-aware label")
assert.ok(source.includes("hours=1&points=60&series=ping"), "overview latency must use the bounded ping-only history query")
assert.ok(!source.includes("fetchOverviewWeekNode"), "overview must not preload 7-day history")
assert.ok(!source.includes("scheduleOverviewWeek"), "overview must not schedule 7-day history")
assert.ok(source.includes("[1,6,24,168].map"), "detail history selector must expose 7D")
assert.ok(source.includes("Math.min(2,nodes.length)"), "overview latency loader must keep history concurrency below the hub gate")
assert.ok(css.includes(".node-card-network"), "primary node cards must expose the three-network matrix")
assert.ok(css.includes(".node-card-grid{padding-left:0;padding-right:0"), "card grid must align with the overview width")
assert.ok(css.includes("border-radius:999px"), "network sample pills must stay rounded")
assert.ok(css.includes(".network-samples{gap:2px;height:6px;contain:layout paint}"), "network samples must keep paint containment")
assert.ok(css.includes(".network-samples i.ok{background:var(--net-ok);box-shadow:none}"), "network pills must not use blur shadows")
assert.ok(css.includes("--meter-neutral:#32363b"), "shared deeper light meter gray missing")
assert.ok(css.includes("--net-ok:var(--meter-neutral)"), "healthy network samples must use the shared meter gray")
assert.ok(css.includes("background:var(--meter-neutral);border-radius:inherit"), "default resource meters must use the shared gray")
assert.ok(css.includes(".bar span{background:var(--meter-neutral)}"), "late bar override must not force near-black fills")
assert.ok(css.includes(".card-resource .bar:not(.card-traffic-bar) span{background:var(--meter-neutral)}"), "card CPU/RAM/DISK bars must explicitly use the shared gray")
assert.ok(css.includes("grid-template-columns:repeat(10,minmax(0,1fr))"), "network sample density must stay at 10 pills")
assert.ok(css.includes("--net-warn:rgb(226 116 24)"), "warning samples must use the deeper orange tone")
assert.ok(css.includes("--net-bad:rgb(202 54 52)"), "bad samples must use the clearer soft red tone")
assert.ok(css.includes("--loss-ok:rgb(58 160 104)"), "packet-loss tender green missing")
assert.ok(css.includes(".network-loss .network-samples i.bad{background:var(--loss-bad);box-shadow:none}"), "packet-loss bad state must stay in the green family")
assert.ok(source.includes("function trafficBarGradient(percent)"), "quota traffic color ramp helper missing")
assert.ok(source.includes("const greenStop=15/p*100,orangeStop=45/p*100,redStop=100/p*100"), "quota traffic must stay green through 30 percent")
assert.ok(css.includes("--traffic-ok:rgb(58 160 104)"), "traffic bar must start with the same tender green")
assert.ok(source.includes("trafficResetText"), "node cards must expose traffic reset timing")
assert.ok(!source.includes("nodeExtraText(node,m)"), "overview ping must stay card-only")
assert.ok(source.includes("history.replaceState({},'','/');state.route=null"), "invalid detail routes must recover to overview")
assert.ok(!source.includes('<div class="nodes">${nodes.map(nodeRow).join(\'\')}</div><div class="node-card-grid">'), "nodesPanel must not render both views together")
assert.ok(!source.includes('<article class="node '), "node rows must not misuse article role=button")
assert.ok(!source.includes('<article class="node-card '), "node cards must not misuse article role=button")
assert.ok(css.includes("content-visibility:auto"), "offscreen node rendering optimization missing")
assert.ok(html.includes('name="description"'), "index must include a meta description")
assert.ok(fs.readFileSync("dist/robots.txt","utf8").startsWith("User-agent:"), "robots.txt must be valid text")
assert.ok(!fs.existsSync("dist/llms.txt"), "llms.txt is intentionally not shipped")
assert.ok(!/\/\* v0\.9\.[3-7]/.test(css), "superseded v0.9.3-v0.9.7 card CSS must be consolidated")

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `function ${name} missing`)
  const candidates = [
    source.indexOf("\n  function ", start + 1),
    source.indexOf("\n  async function ", start + 1),
    source.indexOf("\n  class ", start + 1),
    source.indexOf("\n  const ", start + 1),
  ].filter((n) => n > start)
  const end = candidates.length ? Math.min(...candidates) : source.length
  return source.slice(start, end).trim()
}

const alpha2 = source.match(/const ALPHA2=\/[^;]+;/)?.[0]
assert.ok(alpha2, "ALPHA2 validator missing")

const sandbox = {}
vm.createContext(sandbox)
vm.runInContext([
  extractFunction("n"),
  extractFunction("monthUsage"),
  alpha2,
  extractFunction("safeMetrics"),
  extractFunction("safeNodes"),
  extractFunction("parseNodesFrame"),
  extractFunction("nodeShape"),
  "globalThis.__atlas={monthUsage,safeMetrics,safeNodes,parseNodesFrame,nodeShape}",
].join("\n"), sandbox)

const { monthUsage, safeMetrics, safeNodes, parseNodesFrame, nodeShape } = sandbox.__atlas

const mib = 1024 * 1024
const traffic = { month_rx: 10 * mib, month_tx: 4 * mib }
assert.equal(monthUsage({ ...traffic, traffic_mode: "sum" }), 14 * mib)
assert.equal(monthUsage({ ...traffic, traffic_mode: "down" }), 10 * mib)
assert.equal(monthUsage({ ...traffic, traffic_mode: "up" }), 4 * mib)
assert.equal(monthUsage({ ...traffic, traffic_mode: "max" }), 10 * mib)

const metrics = {
  uptime: 1, cpu: 1, mem_total: 2, mem_used: 1, swap_total: 0, swap_used: 0,
  disk_total: 2, disk_used: 1, net_rx: 0, net_tx: 0, total_rx: 0, total_tx: 0,
  month_rx: 0, month_tx: 0, tcp: 0, udp: 0, procs: 1, load: [0, 0, 0],
}
assert.ok(safeMetrics(metrics))
assert.equal(safeMetrics({ ...metrics, cpu: -1 }), null)

const cleaned = safeNodes([{ id: 1, country: "us", metrics }, { id: 2, country: "USA", metrics }])
assert.equal(cleaned[0].country, "US")
assert.equal(cleaned[1].country, "")

assert.equal(parseNodesFrame("not-json"), null)
assert.equal(parseNodesFrame("{}"), null)
assert.ok(Array.isArray(parseNodesFrame('{"nodes":[]}')))

const a = [{ id: 2, sort: 2, name: "b" }, { id: 1, sort: 1, name: "a" }]
const b = [...a].reverse()
assert.equal(nodeShape(a), nodeShape(b), "nodeShape must be stable across payload ordering")

console.log("Atlas runtime contract tests passed")
