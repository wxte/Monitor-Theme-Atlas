import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium, webkit } = require('playwright')
const { PNG } = require('pngjs')

const output = process.env.ATLAS_SCREENSHOTS || '/tmp/atlas-browser-tests'
fs.mkdirSync(output, { recursive: true })
const mib = 1024 ** 2
const metrics = { uptime: 90061, cpu: 61.2, mem_total: 2048*mib, mem_used: 1024*mib, swap_total: 512*mib, swap_used: 32*mib, disk_total: 40960*mib, disk_used: 10240*mib, net_rx: mib, net_tx: 2*mib, total_rx: 50*mib, total_tx: 60*mib, month_rx: 10*mib, month_tx: 4*mib, tcp: 12, udp: 3, procs: 60, load: [0.2,0.3,0.1] }
const base = { country:'SG', os:'Ubuntu', arch:'amd64', virt:'kvm', cpu_cores:2, cpu_name:'AMD EPYC 7B13 64-Core Processor', agent_version:'1.4.0', kernel:'6.8.0-71-generic', mem_total:2048*mib, disk_total:40960*mib, traffic_limit:100*mib, month_rx:10*mib, month_tx:4*mib, day_rx:6*mib, day_tx:3*mib, traffic_reset_day:1, traffic_mode:'sum', last_seen:1750000000, total_rx:50*mib, total_tx:60*mib }
const nodes = [
  {...base,id:1,sort:1,name:'Singapore Production <01> & Gateway',online:true,metrics},
  {...base,id:2,sort:2,name:'Hong Kong - Pending',country:'HK',os:'Debian',online:true,metrics:null,traffic_limit:0},
  {...base,id:3,sort:3,name:'US - Offline',country:'US',os:'Alpine',online:false,metrics:null},
]
const history = {
  metrics:Array.from({length:24},(_,i)=>({...metrics,cpu:20+(i%7)*8,net_rx:(1+i%5)*mib,ts:1749998620+i*60})),
  ping:Array.from({length:72},(_,i)=>({task_id:i%3+1,ts:1749998620+Math.floor(i/3)*60,latency:i===18?null:20+i%19*5,loss:i===18?100:0})),
  probes:{1:'联通',2:'电信',3:'移动'},loss:{1:5,2:1,3:0},
}

function contrast(a,b) {
  const luminance = rgb => rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{if(!rgb.startsWith('color(srgb'))x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0)
  const x=luminance(a),y=luminance(b)
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)
}

const browser = await (process.env.ATLAS_BROWSER==='webkit'?webkit:chromium).launch({ headless:true, ...(process.env.ATLAS_BROWSER_PATH ? {executablePath:process.env.ATLAS_BROWSER_PATH} : {}) })
async function checkClose(page,cancelSwipe=false){
  const result=await page.evaluate(async(cancelSwipe)=>{
    const overlay=document.querySelector('.detail-overlay'),drawer=overlay.querySelector('.detail-drawer')
    await Promise.all(drawer.getAnimations().map(a=>a.finished.catch(()=>{})))
    const y=scrollY,frames=[]
    if(cancelSwipe){
      const target=document.querySelector('.detail-drawer-scroll')
      for(const [type,x] of [['pointerdown',20],['pointermove',30],['pointerup',20]])target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:11,clientX:x,clientY:200}))
    }
    document.querySelector('[data-action="close-detail"]').click()
    for(let i=0;i<90&&overlay.isConnected;i++){
      frames.push({locked:document.documentElement.classList.contains('drawer-open'),y:scrollY,opacity:Number(getComputedStyle(drawer).opacity)})
      await new Promise(requestAnimationFrame)
    }
    return {y,frames,removed:!overlay.isConnected,locked:document.documentElement.classList.contains('drawer-open')}
  },cancelSwipe)
  assert.ok(result.removed&&!result.locked,'closing must remove the overlay and then unlock scrolling')
  assert.ok(result.frames.every(f=>f.locked&&Math.abs(f.y-result.y)<1),'background stays locked and stationary throughout closing')
  assert.ok(result.frames.at(-1).opacity<.05,`drawer must finish fading before it is removed: ${JSON.stringify(result)}`)
}
try {
  for (const width of (process.env.ATLAS_WIDTHS?process.env.ATLAS_WIDTHS.split(',').map(Number):[320,390,430,768,1440])) for (const dark of [false,true]) {
    const mobile=width<=760,label=`${width}-${dark?'dark':'light'}`
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile})
    const page=await context.newPage(),errors=[],queries=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
    await page.addInitScript(({dark})=>{
      Date.now=()=>1750000060000
      localStorage.setItem('atlas-theme',dark?'dark':'light')
      localStorage.setItem('atlas-node-view','list')
      window.WebSocket=class {
        readyState=1
        constructor(){window.sendSnapshot=nodes=>this.onmessage({data:JSON.stringify({nodes})});queueMicrotask(()=>this.onopen?.())}
        close(){this.readyState=3}
      }
    },{dark})
    await page.route('http://atlas.test/**',async route=>{
      const url=new URL(route.request().url())
      if(url.pathname.startsWith('/api/')){
        if(url.pathname.endsWith('/metrics'))queries.push(url.search)
        return route.fulfill({json:url.pathname==='/api/me'?{public_page:true,authed:false,site_name:'Atlas'}:url.pathname==='/api/nodes'?{nodes}:history})
      }
      const file=path.join('dist',url.pathname==='/'||url.pathname.startsWith('/node/')?'index.html':url.pathname.slice(1))
      const type=file.endsWith('.html')?'text/html':file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'image/png'
      return route.fulfill({body:fs.readFileSync(file),contentType:type})
    })
    await page.goto('http://atlas.test/')
    await page.waitForSelector(mobile?'.node-card':'.node')
    await page.evaluate(()=>document.fonts.ready)
    const palette=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return ['--bg','--t-card-bg','--soft','--text','--muted','--border'].map(k=>s.getPropertyValue(k).trim())})
    assert.deepEqual(palette,dark?['#070707','#181818','#202020','#ededed','#8a8a8a','rgba(255,255,255,.065)']:['#fdfdfd','#f9f9f8','#f3f3f2','#191918','#74746f','rgba(0,0,0,.055)'],'base palette must match the original v1.1 theme')
    if(mobile)await page.waitForFunction(()=>!document.querySelector('.node-card-network.is-loading'))
    if(mobile){
      const network=page.locator('.node-card-network').first()
      assert.equal(await network.locator('.network-compact-item').count(),3)
      assert.deepEqual(await network.locator('.network-provider').allTextContents(),['联通','电信','移动'])
      assert.equal(await network.locator('.network-compact-values').count(),3)
      assert.equal(await network.locator('.network-samples').count(),0,'overview cards must not render history bands')
      assert.equal(await network.locator('.network-summary-head').count(),0,'overview network header stays removed')
      const neutral=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--muted').trim())
      assert.equal(await page.locator('.node-card .bar span').first().evaluate(el=>getComputedStyle(el).backgroundColor),await page.evaluate(()=>{const v=getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();const x=document.createElement('span');x.style.color=v;document.body.append(x);const c=getComputedStyle(x).color;x.remove();return c}),'card meters use muted gray')
      assert.equal(await network.locator('.network-latency-value').first().evaluate(el=>getComputedStyle(el).color),await page.evaluate(()=>getComputedStyle(document.documentElement).color),'overview latency uses normal text color')
    }
    assert.equal(await page.locator('.footer span').textContent(),await page.locator('meta[name="theme-version"]').getAttribute('content'),'footer version must match the package')
    await page.screenshot({path:path.join(output,`${label}-overview.png`),fullPage:true})
    if(width===390&&!dark){
      const steady=await page.evaluate(nodes=>{
        for(let i=0;i<60;i++)window.sendSnapshot(nodes)
        const svg=document.querySelector('.summary-spark')
        const before=svg.outerHTML
        for(let i=0;i<25;i++)window.sendSnapshot(nodes)
        return {same:svg===document.querySelector('.summary-spark'),html:before===document.querySelector('.summary-spark').outerHTML}
      },nodes)
      assert.deepEqual(steady,{same:true,html:true},'identical speed samples must preserve the SVG and its final output')
      const preloads=await page.locator('link[rel="preload"][as="font"]').count()
      assert.equal(preloads,2,'both first-screen fonts are preloaded')
      console.log('Steady speed: 25 identical snapshots, no SVG replacements')
      await page.waitForFunction(()=>document.querySelector('#atlas-globe')?.width>0)
      const shot=await page.locator('#atlas-globe').screenshot(),png=PNG.sync.read(shot),colors=new Set()
      for(let i=0;i<png.data.length;i+=4)colors.add(png.data.subarray(i,i+3).toString('hex'))
      assert.ok(colors.size>30,'globe canvas must render visible pixels')
    }
    await page.locator('[data-action="node"][data-id="1"]').click()
    await page.waitForSelector('.history-svg')
    if(mobile){
      const probeGroups=page.locator('.detail-drawer .probe-group')
      const probeCards=page.locator('.detail-drawer .probe-stat')
      const probeCharts=page.locator('.detail-drawer .probe-chart-shell [data-chart="ping"]')
      assert.equal(await probeGroups.count(),3,'detail network view must expose three carrier groups')
      assert.equal(await probeCards.count(),3,'each carrier group must have one horizontal summary')
      assert.equal(await probeCharts.count(),3,'each carrier group must have its own chart')
      const chartHeights=await probeCharts.evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height))
      assert.ok(chartHeights.every(h=>h<=128),'carrier charts must use the compact vertical profile')
      const lineColors=await page.locator('.detail-drawer .probe-line').evaluateAll(els=>[...new Set(els.map(el=>getComputedStyle(el).stroke))])
      assert.equal(lineColors.length,1,'carrier chart lines must share one neutral color')
      const layout=await page.locator('.detail-drawer .ping-summary').evaluate(el=>{
        const pr=el.getBoundingClientRect()
        return {parent:pr.width,boxes:[...el.querySelectorAll('.probe-group')].map(group=>{const r=group.getBoundingClientRect();return {w:r.width,h:r.height,y:r.y}})}
      })
      const boxes=layout.boxes
      assert.ok(boxes[1].y>boxes[0].y&&boxes[2].y>boxes[1].y,'carrier groups must stack vertically')
      assert.ok(boxes.every(b=>Math.abs(b.w-layout.parent)<2&&b.h>150),'each carrier group must fill its available row and include chart height')
    }
    const details=()=>queries.filter(q=>new URLSearchParams(q).get('points')!=='60')
    const assertLayout=async()=>{
      const result=await page.evaluate(()=>{
        const panel=document.querySelector('.detail-drawer-scroll')
        return {width:panel.clientWidth,scroll:panel.scrollWidth,body:document.documentElement.scrollWidth,viewport:innerWidth}
      })
      assert.ok(result.scroll<=result.width+1,`${label}: detail overflow ${JSON.stringify(result)}`)
      assert.ok(result.body<=result.viewport+1,`${label}: page overflow`)
    }
    await assertLayout()
    if(mobile){
      assert.equal(await page.getByRole('tab').count(),3)
      assert.deepEqual(await page.getByRole('tab').allTextContents(),['网络','监控','资料'])
      assert.equal(await page.getByRole('tab',{name:'网络'}).getAttribute('aria-selected'),'true')
      assert.equal(new URLSearchParams(details().at(-1)).get('series'),'ping')
      const chartBounds=await page.locator('.chart-card').boundingBox(),plotBounds=await page.locator('[data-chart="ping"]').first().boundingBox()
      assert.ok(plotBounds.x-chartBounds.x>=8&&chartBounds.x+chartBounds.width-plotBounds.x-plotBounds.width>=8,'network plot keeps its inset inside the history surface')
      assert.equal(await page.locator('.probe-stat').first().evaluate(el=>getComputedStyle(el).boxShadow),'none','probe borders must not be doubled with an inset shadow')
      await page.locator('.detail-drawer').screenshot({path:path.join(output,`${label}-network-default.png`),animations:'disabled'})
      await page.getByRole('tab',{name:'监控'}).click()
      await page.waitForSelector('[data-chart="metrics"]')
      assert.equal(await page.getByRole('tab',{name:'监控'}).getAttribute('aria-selected'),'true')
      const surfaces=await page.evaluate(()=>{
        const summary=getComputedStyle(document.querySelector('.drawer-mobile-summary'))
        const card=getComputedStyle(document.querySelector('.node-card'))
        const drawer=getComputedStyle(document.querySelector('.detail-drawer'))
        const selected=getComputedStyle(document.querySelector('[role="tab"][aria-selected="true"]'))
        return {summary:summary.backgroundColor,card:card.backgroundColor,drawer:drawer.backgroundColor,selected:selected.backgroundColor,underline:selected.borderBottomWidth}
      })
      assert.equal(surfaces.summary,dark?'rgb(24, 24, 24)':'rgb(249, 249, 248)','detail uses the original card material')
      assert.equal(surfaces.card,dark?'rgb(24, 24, 24)':'rgb(250, 250, 249)','homepage keeps its original panel material')
      assert.notEqual(surfaces.drawer,surfaces.summary,'detail cards remain distinct from the page')
      assert.equal(await page.locator('.chart-card').evaluate(el=>getComputedStyle(el).borderTopWidth),'1px')
      assert.equal(await page.locator('.chart-card').evaluate(el=>getComputedStyle(el).borderRadius),'14px','original rounded history card must be retained')
      assert.equal(surfaces.selected,dark?'rgb(32, 32, 32)':'rgb(243, 243, 242)','selected tabs use the original soft surface')
      assert.equal(surfaces.underline,'1px','tabs use a thin outline')
      assert.equal(await page.locator('.facts').count(),0)
      const cpu=await page.locator('.resource-chart-shell').first().boundingBox()
      assert.ok(cpu.y<844,`${label}: first chart should appear in initial viewport`)
      const contrastColors=await page.locator('.drawer-mobile-network small').first().evaluate(el=>({text:getComputedStyle(el).color,bg:getComputedStyle(document.querySelector('.detail-drawer')).backgroundColor}))
      assert.ok(contrast(contrastColors.text,contrastColors.bg)>=4.5,`${label}: secondary text contrast`)
      await page.locator('.detail-drawer').screenshot({path:path.join(output,`${label}-monitor.png`),animations:'disabled'})
      const count=details().length
      await page.getByRole('tab',{name:'资料'}).click()
      assert.equal(await page.locator('.facts').evaluate(el=>getComputedStyle(el).borderTopWidth),'1px','profile stays a framed card')
      assert.equal(details().length,count,'profile must not fetch history')
      assert.equal(await page.locator('.history-svg').count(),0)
      assert.ok((await page.locator('.fact-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns)).split(' ').length===2,'short profile fields stay in two columns')
      assert.equal(await page.locator('.fact-wide').count(),2)
      if(width>=390){
        await page.setViewportSize({width,height:700})
        assert.ok(await page.locator('.detail-drawer-scroll').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'complete profile fits a 700px mobile viewport')
        await page.setViewportSize({width,height:844})
      }
      await assertLayout()
      await page.locator('.detail-drawer').screenshot({path:path.join(output,`${label}-profile.png`),animations:'disabled'})
      await page.getByRole('tab',{name:'监控'}).click()
      assert.equal(details().length,count,'returning from profile must reuse current history')
      await page.getByRole('tab',{name:'网络'}).click()
      await page.waitForSelector('[data-chart="ping"]')
      assert.equal(new URLSearchParams(details().at(-1)).get('series'),'ping')
      await page.getByRole('button',{name:'7D',exact:true}).click()
      await page.waitForSelector('[data-chart="ping"]')
      assert.equal(new URLSearchParams(details().at(-1)).get('hours'),'168')
      await page.getByRole('button',{name:'去毛刺',exact:true}).click()
      assert.equal(await page.getByRole('button',{name:'去毛刺',exact:true}).getAttribute('aria-pressed'),'true')
      assert.equal(await page.locator('.probe-stat.is-hidden').count(),0,'independent carrier charts stay visible without summary-card toggles')
      await assertLayout()
      await page.locator('.detail-drawer').screenshot({path:path.join(output,`${label}-network.png`),animations:'disabled'})
      await page.getByRole('tab',{name:'监控'}).focus()
      await page.keyboard.press('ArrowRight')
      assert.equal(await page.getByRole('tab',{name:'资料'}).getAttribute('aria-selected'),'true')
      await page.keyboard.press('Home')
      assert.equal(await page.getByRole('tab',{name:'网络'}).getAttribute('aria-selected'),'true')
      await page.getByRole('tab',{name:'监控'}).click()
      await page.waitForSelector('[data-chart="metrics"]')
      await page.evaluate(nodes=>window.sendSnapshot(nodes),nodes.map(n=>n.id===1?{...n,month_rx:80*mib,metrics:{...metrics,cpu:85,net_tx:3*mib}}:n))
      assert.equal(await page.locator('[data-mobile-resources] .metric-top b').first().textContent(),'85.0%')
      assert.equal(await page.locator('[data-live="net-tx"]').textContent(),'↑ 3.00 MB/s')
      await page.evaluate(nodes=>window.sendSnapshot(nodes),nodes.map(n=>({...n,online:false,metrics:null})))
      assert.equal(await page.locator('[data-live="presence"]').textContent(),'离线')
      assert.equal(await page.locator('[data-mobile-resources] .metric-top b').first().textContent(),'—')
      await page.evaluate(nodes=>window.sendSnapshot(nodes),nodes)
      await page.locator('.detail-drawer-scroll').evaluate(el=>{el.scrollTop=450})
      const top=await page.locator('.drawer-mobile-top').boundingBox()
      assert.ok(Math.abs(top.y)<=1,'mobile header and tabs must stick to the top')
      await page.locator('.detail-drawer-scroll').evaluate(el=>{el.scrollTop=0})
      const svg=page.locator('.history-svg').first()
      await svg.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:9,clientX:80,clientY:500,button:0})
      await svg.dispatchEvent('pointermove',{pointerType:'touch',pointerId:9,clientX:180,clientY:500})
      await svg.dispatchEvent('pointerup',{pointerType:'touch',pointerId:9,clientX:180,clientY:500})
      assert.ok(page.url().endsWith('/node/1'),'chart gestures must not close the drawer')
      await page.locator('.detail-drawer-scroll').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:7,clientX:20,clientY:200})
      await page.locator('.detail-drawer-scroll').dispatchEvent('pointermove',{pointerType:'touch',pointerId:7,clientX:150,clientY:202})
      await page.locator('.detail-drawer-scroll').dispatchEvent('pointerup',{pointerType:'touch',pointerId:7,clientX:150,clientY:202})
      await page.waitForFunction(()=>location.pathname==='/')
      await page.waitForSelector('.detail-overlay',{state:'detached'})
      await page.locator('[data-action="node"][data-id="1"]').click()
      await page.waitForSelector('[data-chart="ping"]')
      assert.equal(await page.getByRole('tab',{name:'网络'}).getAttribute('aria-selected'),'true','reopening defaults to network')
      await page.reload()
      await page.waitForSelector('[data-chart="ping"]')
      assert.equal(await page.getByRole('tab',{name:'网络'}).getAttribute('aria-selected'),'true','direct links default to network')
      await assertLayout()
      await checkClose(page)
      await page.locator('[data-action="node"][data-id="1"]').click()
      await page.waitForSelector('[data-chart="ping"]')
      await page.evaluate(()=>{
        document.querySelector('[data-action="close-detail"]').click()
        history.pushState({},'','/node/2')
        dispatchEvent(new PopStateEvent('popstate'))
      })
      await page.waitForFunction(()=>document.querySelector('.drawer-node-line h1')?.textContent.includes('Hong Kong'))
      await page.waitForTimeout(450)
      assert.ok(page.url().endsWith('/node/2'),'a stale close must not redirect a newly opened node')
      assert.equal(await page.locator('.detail-overlay:not(.is-closing)').count(),1)
      await checkClose(page,true)
      await page.locator('[data-action="node"][data-id="1"]').click()
      await page.waitForSelector('[data-chart="ping"]')
      await page.goBack()
      await page.waitForSelector('.detail-overlay',{state:'detached'})
      assert.equal(await page.locator('html.drawer-open').count(),0,'browser back releases the scroll lock')
      await page.locator('[data-action="node"][data-id="1"]').click()
      await page.waitForSelector('[data-chart="ping"]')
      await page.emulateMedia({reducedMotion:'reduce'})
      await checkClose(page)
    }else{
      assert.equal(new URLSearchParams(details().at(-1)).get('series'),'metrics','desktop still opens resource history')
      assert.equal(await page.getByRole('tab').count(),0)
      assert.equal(await page.locator('.detail-kpi').count(),4)
      assert.equal(await page.locator('.facts').count(),1)
      await page.locator('.detail-drawer').screenshot({path:path.join(output,`${label}-detail.png`),animations:'disabled'})
      await page.getByRole('button',{name:'网络延迟',exact:true}).click()
      await page.waitForSelector('[data-chart="ping"]')
      await page.getByRole('button',{name:'关闭详情'}).click()
      await page.waitForSelector('.detail-overlay',{state:'detached'})
      await page.getByRole('button',{name:'卡片',exact:true}).click()
      await page.waitForSelector('.node-card')
      await page.screenshot({path:path.join(output,`${label}-cards.png`),fullPage:true})
    }
    assert.deepEqual(errors,[],`${label}: browser errors`)
    console.log(`${label}: layout, navigation, rendering and runtime passed`)
    await context.close()
  }
}finally{await browser.close()}
