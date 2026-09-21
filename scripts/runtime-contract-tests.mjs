import assert from "node:assert/strict"
// Contract checks verify rendered behavior, not historical CSS declaration order.
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
assert.ok(/\.network-samples\{[^}]*gap:2px[^}]*height:6px[^}]*contain:layout paint[^}]*\}/.test(css), "network samples must keep paint containment")
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
assert.ok(css.includes(".network-loss .network-samples i.bad{background:var(--loss-bad)}") && css.includes(".network-samples i.bad{background:var(--net-bad);box-shadow:none}"), "packet-loss bad state must stay green and shadow-free")
assert.ok(source.includes("function trafficBarGradient(percent)"), "quota traffic color ramp helper missing")
assert.ok(source.includes("function beginDrawerSwipe(e)"), "mobile drawer swipe start missing")
assert.ok(source.includes("fallback=Math.max(8,mid*.08)"), "Hampel MAD=0 fallback missing")
assert.ok(source.includes("Hampel 去毛刺：过滤孤立异常点，保留持续异常"), "despike control wording must explain its behavior")
assert.ok(source.includes("if(k==='debian')return"), "Debian distro glyph missing")
assert.ok(source.includes("if(k==='ubuntu')return"), "Ubuntu distro glyph missing")
assert.ok(css.includes(".drawer-os-icon{"), "detail OS icon wrapper missing")
assert.ok(css.includes("background:transparent!important"), "detail OS icon tag background must be removed")
assert.ok(css.includes("box-shadow:none!important"), "detail OS icon tag shadow must be removed")
assert.ok(source.includes("function moveDrawerSwipe(e)"), "mobile drawer swipe move missing")
assert.ok(source.includes("dx>=76||(dx>=42&&velocity>=.55)"), "mobile drawer swipe threshold missing")
assert.ok(source.includes(".history-svg,.chart-wrap,button,a,input,select,textarea"), "drawer swipe must exclude charts and controls")
assert.ok(css.includes(".detail-drawer{touch-action:pan-y}"), "mobile drawer must preserve vertical scrolling")
assert.ok(source.includes("const greenStop=15/p*100,orangeStop=45/p*100,redStop=100/p*100"), "quota traffic must stay green through 30 percent")
assert.ok(css.includes("--traffic-ok:rgb(58 160 104)"), "traffic bar must start with the same tender green")
assert.ok(source.includes("function cardCpuMeter(node,cpu,m,load)"), "card CPU meter helper missing")
assert.ok(source.includes("node.cpu_cores?\`\${node.cpu_cores}C · \`:''"), "CPU core count must survive live refresh")
assert.ok(source.includes('class="node-card-os"'), "system icon must live beside the node title")
assert.ok(source.includes('node-card-runtime"><i class="presence-dot"></i>'), "card online state must use the shared presence dot")
assert.ok(!source.slice(source.indexOf("function nodeCard(node)"),source.indexOf("function regions(")).includes("node-card-meta"), "card must not render a separate meta row")
assert.ok(css.includes(".card-resource-label em"), "CPU architecture/virtualization styling missing")
assert.ok(css.includes(".card-resource-top>span{color:var(--card-label)}"), "resource label hierarchy must stay consistent")
assert.ok(css.includes(".card-resource-sub,.node-card-activity span{color:var(--card-meta)}"), "secondary card metadata must share one hierarchy tone")
assert.ok(css.includes(".network-latency .network-samples i.ok{background:var(--loss-ok)}") && css.includes(".network-samples i.ok{background:var(--net-ok);box-shadow:none}"), "low latency samples must use the packet-loss green without shadows")
assert.ok(/border-left(?::1px solid|-color:) color-mix\(in srgb,var\(--border\) 55%,transparent\)/.test(css), "network center divider must stay subtle")
assert.ok(source.includes('live-mode ${mode}"><i class="presence-dot"></i>'), "LIVE status must use the shared presence dot")
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

assert.ok(source.includes("function osSprite()"), "OS SVG sprite definition missing")
assert.ok(source.includes('id="atlas-os-debian"'), "Debian sprite symbol missing")
assert.ok(source.includes('<use href="#atlas-os-debian"></use>'), "OS icons must reference sprite symbols")
assert.ok(css.includes(".os-sprite{position:absolute!important;width:0!important;height:0!important"), "OS sprite must stay out of layout")

assert.ok(source.includes('<circle cx="14" cy="6" r="2"/>'), "admin sliders icon missing")
assert.ok(css.includes(".admin-btn svg{width:16px!important;height:16px!important"), "admin icon optical alignment missing")

assert.ok(source.includes('ICONS.sliders'), "admin action must use sliders icon")
assert.ok(!source.includes('ICONS.wrench'), "stale wrench icon reference must be removed")
const toolbar = source.indexOf('<div class="top-actions"><button class="icon-btn" data-action="theme"')
const admin = source.indexOf('class="icon-btn admin-btn"', toolbar)
assert.ok(toolbar >= 0 && admin > toolbar, "theme toggle must render before admin action")
assert.ok(!css.includes("/* v1.2.0"), "incremental v1.x CSS override stack must be consolidated")
assert.ok(!css.includes(".node-card-meta{"), "dead node-card-meta CSS must be removed")
assert.ok(!css.includes(".os-badge{"), "dead os-badge CSS must be removed")
assert.ok(css.includes("Consolidated node-card/network/runtime overrides — v1.3.25"), "consolidated override block missing")

assert.ok(source.includes("function resourceBarGradient(percent)"), "shared resource gradient helper missing")
assert.ok(source.includes("redStop=80/p*100"), "resource gradient must reach red at 80 percent")
assert.ok(css.includes("--detail-chart-neutral:color-mix(in srgb,var(--meter-neutral) 78%,var(--muted))"), "detail history neutral token missing")
assert.ok(css.includes("--detail-chart-ok:color-mix(in srgb,rgb(58 160 104) 82%,var(--muted))"), "detail history green must derive from the card healthy green")
assert.ok(css.includes(".detail-drawer .line-rx{stroke:var(--detail-chart-ok)}"), "detail network RX line must use the softened healthy green")
assert.ok(css.includes(".detail-drawer .line-cpu{stroke:var(--detail-chart-neutral)}"), "detail CPU chart must use the softened neutral palette")

assert.ok(source.includes("function listCpuMeter(node,cpu,m)"), "desktop list CPU parity helper missing")
assert.ok(source.includes('class="node-card-os list-node-os"'), "desktop list must reuse card OS glyph styling")
const rowSource = source.slice(source.indexOf("function nodeRow(node)"),source.indexOf("function cardMeter("))
assert.ok(!rowSource.includes("status-wrap"), "desktop list must remove duplicate pre-flag online dot")
assert.ok(rowSource.includes("runtime-line"), "desktop list runtime must own the presence dot")
assert.ok(source.includes("trafficBarGradient(trafficPct)"), "desktop list traffic gradient must update live")
assert.ok(source.includes("next.style.minHeight=") && source.includes("oldHeight"), "view swap must temporarily preserve panel height")
assert.ok(css.includes(".nodes-panel.view-list .nodes{padding:12px 0}"), "list/card content top offsets must match")
assert.ok(css.includes(".nodes-panel.view-list .traffic>.bar{display:block;height:5px"), "desktop list traffic meter must stay visible")
assert.ok(css.includes("grid-template-columns:minmax(240px,1.42fr) minmax(128px,.68fr)"), "desktop list 1440px layout must keep roomy columns")

assert.ok(css.includes(":root{--traffic-ok:rgb(58 160 104);--traffic-warn:rgb(226 116 24);--traffic-bad:rgb(202 54 52)}"), "traffic palette must be globally scoped")
assert.ok(source.includes("background:${resourceBarGradient(v)}"), "resource bars must render the shared gradient")
assert.ok(source.includes("if(thresholds)span.style.background=resourceBarGradient(v)"), "live resource bars must update gradient colors")
