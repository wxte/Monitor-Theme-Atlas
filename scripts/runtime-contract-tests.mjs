import assert from "node:assert/strict"
import crypto from "node:crypto"
// Contract checks verify shipped runtime behavior and asset integrity, not historical CSS declaration order.
import fs from "node:fs"
import vm from "node:vm"

const html = fs.readFileSync("dist/index.html", "utf8")
const appRef = html.match(/\/assets\/(app\.[^"]+\.mjs)/)?.[1]
const cssRef = html.match(/\/assets\/(atlas\.[^"]+\.css)/)?.[1]
assert.ok(appRef && cssRef, "index must reference hashed app/css assets")

const source = fs.readFileSync(`dist/assets/${appRef}`, "utf8")
const css = fs.readFileSync(`dist/assets/${cssRef}`, "utf8")

function assetFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? assetFiles(path) : [path]
  })
}

for (const path of assetFiles("dist/assets")) {
  const match = path.match(/\/[^/]+\.([0-9a-f]{12})\.[^/.]+$/)
  assert.ok(match, `asset must be content-hashed: ${path}`)
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex").slice(0, 12)
  assert.equal(match[1], hash, `asset hash drifted: ${path}`)
}

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
assert.ok(css.includes("--meter-neutral:#32363b"), "shared deeper light meter gray missing")
assert.ok(css.includes("background:var(--meter-neutral);border-radius:inherit"), "default resource meters must use the shared gray")
assert.ok(css.includes(".bar span{background:var(--meter-neutral)}"), "late bar override must not force near-black fills")
assert.ok(css.includes(".card-resource .bar:not(.card-traffic-bar) span{background:var(--meter-neutral)}"), "card CPU/RAM/DISK bars must explicitly use the shared gray")
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
assert.ok(source.includes("function cardCpuMeter(node,cpu,m,load)"), "card CPU meter helper missing")
assert.ok(source.includes("node.cpu_cores?\`\${node.cpu_cores}C · \`:''"), "CPU core count must survive live refresh")
assert.ok(source.includes('class="node-card-os"'), "system icon must live beside the node title")
assert.ok(source.includes('node-card-runtime"><i class="presence-dot"></i>'), "card online state must use the shared presence dot")
assert.ok(!source.slice(source.indexOf("function nodeCard(node)"),source.indexOf("function regions(")).includes("node-card-meta"), "card must not render a separate meta row")
assert.ok(css.includes(".card-resource-label em"), "CPU architecture/virtualization styling missing")
assert.ok(css.includes(".card-resource-top>span{color:var(--card-label)}"), "resource label hierarchy must stay consistent")
assert.ok(css.includes(".card-resource-sub,.node-card-activity span{color:var(--card-meta)}"), "secondary card metadata must share one hierarchy tone")
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
assert.ok(!css.includes("Consolidated node-card/network/runtime overrides"), "historical override marker must not ship")
for (const selector of [
  ".status-wrap{",
  ".node-meta{",
  ".meta-sep{",
  ".detail-head{",
  ".detail-grid{",
  ".detail-title",
  ".detail-status",
  ".back{",
  ".os-mark",
  ".os-name",
  ".meta-inline",
  ".line-ping",
  ".chart-label",
  ".legend",
  ".probe-list",
  ".probe{",
  ".probe-live",
  ".spark.tx-only",
  ".spark-ring",
  ".spark-dot",
  ".brand-sub",
  ".section-title",
  ".drawer-section-title",
]) assert.ok(!css.includes(selector), `dead historical CSS selector must stay removed: ${selector}`)

assert.ok(source.includes("function resourceBarGradient(percent)"), "shared resource gradient helper missing")
assert.ok(source.includes("redStop=80/p*100"), "resource gradient must reach red at 80 percent")

assert.ok(source.includes("function listCpuMeter(node,cpu,m)"), "desktop list CPU parity helper missing")
assert.ok(source.includes('class="node-card-os list-node-os"'), "desktop list must reuse card OS glyph styling")
const rowSource = source.slice(source.indexOf("function nodeRow(node)"),source.indexOf("function cardMeter("))
assert.ok(!rowSource.includes("status-wrap"), "desktop list must remove duplicate pre-flag online dot")
assert.ok(rowSource.includes("runtime-line"), "desktop list runtime must own the presence dot")
assert.ok(source.includes("trafficBarGradient(trafficPct)"), "desktop list traffic gradient must update live")
assert.ok(source.includes("next.style.minHeight=") && source.includes("oldHeight"), "view swap must temporarily preserve panel height")
assert.ok(css.includes(".nodes-panel.view-list .nodes{padding:12px 0}"), "list/card content top offsets must match")
assert.ok(css.includes(".nodes-panel.view-list .traffic>.bar{display:block;height:5px"), "desktop list traffic meter must stay visible")
assert.ok(css.includes("grid-template-columns:minmax(205px,1.12fr) minmax(150px,.82fr) minmax(170px,.90fr) minmax(170px,.90fr)"), "desktop list 1440px resource columns must stay roomy")

assert.ok(source.includes("background:${resourceBarGradient(v)}"), "resource bars must render the shared gradient")
assert.ok(source.includes("if(thresholds)span.style.background=resourceBarGradient(v)"), "live resource bars must update gradient colors")

assert.ok(css.includes(".nodes-panel.view-list .node-heading strong{max-width:calc(100% - 24px);flex:0 1 auto}"), "list OS glyph must stay close to the node name")
assert.ok(css.includes(".nodes-panel.view-list .flag{width:26px;height:18px;margin-top:0;align-self:flex-start}"), "list flag alignment contract missing")
assert.ok(css.includes(".nodes-panel.view-list .list-node-os{width:18px;height:18px"), "list OS glyph must share the flag title-line height")
assert.ok(css.includes(".nodes-panel.view-list .rx:before{color:var(--muted)}"), "desktop list RX arrow must be neutral gray")
assert.ok(css.includes(".nodes-panel.view-list .traffic{margin-left:-6px;margin-right:6px}"), "desktop list traffic column spacing contract missing")

// Observe writes as well as values: equal formatted snapshots should keep text nodes intact.
function textElement(initial = "") {
  let text = initial
  return {
    writes: 0,
    get textContent() { return text },
    set textContent(value) { text = value; this.writes++ },
  }
}

function resourceElement(topSelector) {
  const value = textElement(), note = textElement(), classes = new Set()
  const span = {
    style: {},
    parentElement: { classList: { toggle(name, enabled) {
      if (enabled) classes.add(name)
      else classes.delete(name)
    } } },
  }
  return {
    value, note, span, classes,
    querySelector(selector) {
      return selector === topSelector ? value : selector === ".bar span" ? span : selector === ".card-resource-sub" ? note : null
    },
  }
}

vm.runInContext([
  ...["clamp", "pct", "bytes", "rate", "quotaBytes", "uptime", "age", "resourceBarGradient", "trafficBarGradient",
    "patchText", "patchBar", "patchMetric", "patchCardResource", "patchNodeLive"].map(extractFunction),
  "globalThis.__live={patchText,patchMetric,patchCardResource,patchNodeLive}",
].join("\n"), sandbox)
const { patchText, patchMetric, patchCardResource, patchNodeLive } = sandbox.__live

const text = textElement("0")
patchText(text, "0")
assert.equal(text.writes, 0)
patchText(text, "<node> & status")
assert.equal(text.textContent, "<node> & status", "live labels must remain plain text")
patchText(text, "")
patchText(text, "")
assert.equal(text.textContent, "")
assert.equal(text.writes, 2)
assert.doesNotThrow(() => patchText(null, "pending"))
assert.doesNotThrow(() => patchMetric(null, 0, "pending"))
assert.doesNotThrow(() => patchCardResource(null, 0, "pending"))

const metricElements = Array.from({ length: 3 }, () => resourceElement(".metric-top b"))
let metricQueries = 0
const row = {
  classList: { toggle() {} },
  querySelector() { return null },
  querySelectorAll(selector) {
    assert.equal(selector, ".metric")
    metricQueries++
    return metricElements
  },
}
sandbox.document = { querySelector(selector) { return selector.startsWith(".nodes ") ? row : null } }
const node = { id: 1, online: true, cpu_cores: 2, metrics: { ...metrics, cpu: 61.2, mem_total: 2 * mib, mem_used: mib, disk_total: 4 * mib, disk_used: mib } }
patchNodeLive(node)
assert.equal(metricQueries, 1, "each list refresh must collect its metric elements once")
assert.deepEqual(metricElements.map(x => x.value.textContent), ["2C · 61.2%", "1.00 MB / 2.00 MB", "1.00 MB / 4.00 MB"])
assert.deepEqual(metricElements.map(x => x.span.style.width), ["61.2%", "50.0%", "25.0%"])
assert.ok(metricElements[0].classes.has("warn"))
const firstGradient = metricElements[0].span.style.background
patchNodeLive(node)
assert.deepEqual(metricElements.map(x => x.value.writes), [1, 1, 1], "unchanged live values must not rewrite text")
patchNodeLive({ ...node, metrics: { ...node.metrics, cpu: 61.21 } })
assert.equal(metricElements[0].value.writes, 1, "sub-display precision changes must not rewrite text")
patchNodeLive({ ...node, metrics: { ...node.metrics, cpu: 85 } })
assert.equal(metricElements[0].value.textContent, "2C · 85.0%")
assert.equal(metricElements[0].span.style.width, "85.0%")
assert.ok(metricElements[0].classes.has("bad") && !metricElements[0].classes.has("warn"))
assert.notEqual(metricElements[0].span.style.background, firstGradient)
patchNodeLive({ ...node, metrics: null })
assert.deepEqual(metricElements.map(x => x.value.textContent), ["2C · —", "—", "—"])
assert.deepEqual(metricElements.map(x => x.span.style.width), ["0.0%", "0.0%", "0.0%"])
patchNodeLive(node)
assert.equal(metricElements[0].value.textContent, "2C · 61.2%", "metrics must recover after an unavailable snapshot")

const resource = resourceElement(".card-resource-top b")
patchCardResource(resource, 55, "55%", "1 GB / 2 GB")
patchCardResource(resource, 55, "55%", "1 GB / 2 GB")
assert.equal(resource.value.writes, 1)
assert.equal(resource.note.writes, 1)
patchCardResource(resource, 0, "—", "")
assert.equal(resource.value.textContent, "—")
assert.equal(resource.note.textContent, "")
assert.equal(resource.span.style.width, "0.0%")

const detail = { tab: "metrics", mobileTab: "metrics", data: { metrics: [] }, zoom: [1, 2], drag: null, zoomMode: true }
const cachedData = detail.data
let historyLoads = 0, drawerRenders = 0
sandbox.state = { detail }
sandbox.renderDrawerContent = () => { drawerRenders++ }
sandbox.loadDetail = () => { historyLoads++ }
vm.runInContext(`${extractFunction("selectMobileDetailTab")}\nglobalThis.selectTab=selectMobileDetailTab`, sandbox)
sandbox.selectTab("profile")
assert.equal(detail.mobileTab, "profile")
assert.equal(detail.tab, "metrics")
assert.equal(detail.data, cachedData)
assert.equal(historyLoads, 0, "profile must not request history")
sandbox.selectTab("metrics")
assert.equal(historyLoads, 0, "returning to the same series must reuse its data")
sandbox.selectTab("ping")
assert.equal(detail.tab, "ping")
assert.equal(detail.mobileTab, "ping")
assert.equal(detail.data, null)
assert.equal(detail.zoom, null)
assert.equal(detail.zoomMode, false)
assert.equal(historyLoads, 1, "changing series must load the selected history once")
sandbox.selectTab("ping")
assert.equal(historyLoads, 1)
const previousRenders = drawerRenders
sandbox.selectTab("invalid")
assert.equal(drawerRenders, previousRenders)

assert.ok(!source.includes("function overviewSampleBand"),"overview cards must not render history bands")
assert.ok(source.includes("loss=Math.max(0,n(data?.loss?.[id],0))"),"overview loss must use the one-hour aggregate returned by the history API")
assert.ok(source.includes("return value>0?'bad':'ok'"),"any non-zero packet loss must use the single alert color")
assert.ok(!source.includes("network-summary-head"),"overview cards must not render the redundant network header")
assert.ok(css.includes(".network-compact-grid"),"overview networks must use a three-column compact grid")
assert.ok(css.includes("grid-template-columns:repeat(3,minmax(0,1fr))"),"three carriers must stay on one row")
assert.ok(source.includes('class="ping-summary ping-groups"'),"detail ping view must render one group per carrier")
assert.ok(source.includes('data-chart="ping" data-probe="'),"each carrier must own an independent ping chart")
assert.ok(source.includes("rows.filter(p=>String(p.task_id)===probe)"),"ping chart hover and zoom must stay scoped to its carrier")
assert.ok(source.includes("function smoothPingVisual(points,radius=2)"),"detail ping charts must use lightweight visual smoothing")
assert.ok(source.includes("timePath(x.series,'lat',1000,128,max,min)"),"detail ping plot geometry must use the compact height")
assert.ok(css.includes("stroke:var(--text)!important"),"all detail carrier charts must share the homepage neutral line color")
assert.ok(css.includes(".detail-drawer .probe-chart-shell>.history-svg{height:128px!important}"),"detail carrier charts must use the compressed desktop height")
assert.ok(css.includes(".detail-drawer .probe-chart-shell>.history-svg{height:112px!important}"),"detail carrier charts must use the compressed mobile height")
assert.ok(css.includes(".detail-drawer .probe-group{"),"each carrier summary and chart must share one full-width card")
assert.ok(css.includes("grid-template-columns:minmax(0,.82fr) minmax(0,.78fr) minmax(0,1fr) minmax(0,1.08fr)!important"),"carrier summary must use overflow-safe proportional columns")
assert.ok(css.includes(".bar span{background:var(--muted)!important}"),"all resource and quota bars must use muted secondary-text gray")
assert.ok(css.includes(".network-latency-value{color:var(--text)!important}"),"overview latency must stay neutral regardless of threshold")
assert.ok(css.includes(".probe-now b,.probe-average b{color:var(--text)!important}"),"detail latency summaries must stay neutral")
assert.ok(source.includes("status=lossCellClass(loss)"),"detail probe alert status must be driven by packet loss only")

const pending=[]
let networkWrites=0,networkHtml="first",networkElement
const newNetwork=()=>({set outerHTML(value){networkWrites++;networkElement=newNetwork()},remove(){networkElement=null}})
networkElement=newNetwork()
const networkCard={querySelector:()=>networkElement}
sandbox.document={querySelector:()=>networkCard}
sandbox.overviewPingStrip=()=>networkHtml
vm.runInContext(`const overviewMarkup=new WeakMap(); ${extractFunction("patchOverviewPing")}\nglobalThis.patchNetwork=patchOverviewPing`,sandbox)
sandbox.patchNetwork({id:1})
sandbox.patchNetwork({id:1})
assert.equal(networkWrites,1,"unchanged network samples must retain the current DOM")
networkHtml="updated"
sandbox.patchNetwork({id:1})
assert.equal(networkWrites,2,"changed network samples must render")
networkHtml=""
sandbox.patchNetwork({id:1})
assert.equal(networkElement,null,"empty probe results remove the obsolete network section")

sandbox.state={route:1,detail:{tab:"ping",hours:6}}
sandbox.api=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))
sandbox.innerWidth=390
sandbox.devicePixelRatio=1
sandbox.renderDrawerContent=()=>{}
vm.runInContext(`let detailRequest=0; async ${extractFunction("loadDetail")}\nglobalThis.loadHistory=loadDetail`,sandbox)
const stale=sandbox.loadHistory()
sandbox.state.detail.tab="metrics"
const active=sandbox.loadHistory()
pending[1].resolve({metrics:[{cpu:42}]})
await active
pending[0].reject(new Error("stale ping failure"))
await stale
assert.equal(sandbox.state.detail.error,"","stale failures must not overwrite a newer tab")
assert.equal(sandbox.state.detail.data.metrics[0].cpu,42)
const older=sandbox.loadHistory(),newer=sandbox.loadHistory()
pending[3].resolve({metrics:[{cpu:60}]})
await newer
pending[2].resolve({metrics:[{cpu:10}]})
await older
assert.equal(sandbox.state.detail.data.metrics[0].cpu,60,"older identical queries must not replace the latest result")

const network = {state:{connection:'ws'},document:{querySelector(){throw new Error('unchanged connection touched DOM')}},received:0,errors:0}
vm.createContext(network)
network.ApiError=class extends Error {}
network.setErrorMessage=()=>{network.errors++}
network.receiveNodes=()=>{network.received++}
network.refreshAccess=()=>{}
let finishRequest,calls=0
network.api=()=>{calls++;return new Promise(resolve=>{finishRequest=resolve})}
vm.runInContext(`${extractFunction("setConnection")}\nasync ${extractFunction("fetchNodes")}`,network)
network.setConnection('ws')
const firstFetch=network.fetchNodes()
await network.fetchNodes()
assert.equal(calls,1,"slow node requests must not overlap")
finishRequest({nodes:[]})
await firstFetch
assert.equal(network.received,1)
network.api=async()=>{throw new Error('offline')}
await network.fetchNodes()
assert.equal(network.state.nodesBusy,false,"failed requests must release the refresh guard")
assert.equal(network.errors,1)

let timeoutCallback,cleared=0
const transport={AbortController,setTimeout(fn){timeoutCallback=fn;return 1},clearTimeout(){cleared++},ApiError:network.ApiError}
vm.createContext(transport)
transport.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))))
vm.runInContext(`async ${extractFunction("api")}`,transport)
const stalled=transport.api('/nodes')
timeoutCallback()
await assert.rejects(stalled,/timeout/)
assert.equal(cleared,1,"aborted requests must clear the timer")
transport.fetch=async()=>({ok:true,status:200,json:async()=>({nodes:[]})})
assert.equal((await transport.api('/nodes')).nodes.length,0)
assert.equal(cleared,2,"successful requests must clear the timer")

console.log("Atlas runtime contract tests passed")
